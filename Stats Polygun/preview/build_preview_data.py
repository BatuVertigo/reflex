"""Build Stats Polygun preview data for a few PlayFab IDs from ThinkingData (TE).

Runs the same fixed queries the real server will run and writes one JS data file per player.
Reads the TE MCP endpoint and auth header from ~/.claude.json at runtime; never prints them.
All times are UTC+0 (phone wall clock shifted by #zone_offset).
"""

import concurrent.futures
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
import uuid

PROJECT_ID = 4
OUTPUT_DIRECTORY = os.path.dirname(os.path.abspath(__file__))
UTC = 'date_add(\'minute\', -cast(round(coalesce("#zone_offset", 0) * 60) as integer), "#event_time")'


def load_server_config():
    with open(os.path.expanduser("~/.claude.json"), encoding="utf-8") as file:
        config = json.load(file)
    stack = [config]
    while stack:
        node = stack.pop()
        if isinstance(node, dict):
            server = node.get("te-mcp-analysis")
            if isinstance(server, dict) and server.get("url"):
                return server["url"], server.get("headers", {})
            stack.extend(node.values())
        elif isinstance(node, list):
            stack.extend(node)
    raise SystemExit("te-mcp-analysis server not found in ~/.claude.json")


URL, AUTH_HEADERS = load_server_config()


def post(payload):
    headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream", **AUTH_HEADERS}
    request = urllib.request.Request(URL, data=json.dumps(payload).encode(), headers=headers, method="POST")
    with urllib.request.urlopen(request, timeout=300) as response:
        body = response.read().decode()
        content_type = response.headers.get("Content-Type", "")
    if "text/event-stream" in content_type:
        messages = [json.loads(line[5:].strip()) for line in body.splitlines() if line.startswith("data:") and line[5:].strip()]
        return messages[-1] if messages else None
    return json.loads(body) if body.strip() else None


def initialize():
    post({"jsonrpc": "2.0", "id": 1, "method": "initialize",
          "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "stats-polygun-preview", "version": "0.1"}}})
    post({"jsonrpc": "2.0", "method": "notifications/initialized"})


def cancel(request_id):
    try:
        post({"jsonrpc": "2.0", "id": 3, "method": "tools/call",
              "params": {"name": "cancel_query", "arguments": {"requestId": request_id, "reason": "preview builder gave up"}}})
    except Exception:
        pass


def run_sql(name, sql, required_event="login"):
    """Run one SQL query through query_adhoc and return (columns, rows). Retries when TE is busy."""
    for attempt in range(6):
        request_id = "mcp_" + uuid.uuid4().hex
        started = time.time()
        try:
            message = post({
                "jsonrpc": "2.0", "id": 2, "method": "tools/call",
                "params": {"name": "query_adhoc", "arguments": {
                    "projectId": PROJECT_ID,
                    "modelType": "sql",
                    "qp": json.dumps({"eventView": {"requiredEvents": [required_event]}, "events": {"sql": sql}}),
                    "requestId": request_id,
                    "limit": 20000,
                    "timeoutMinutes": 10,
                }},
            })
        except (urllib.error.URLError, TimeoutError) as error:
            cancel(request_id)
            raise RuntimeError(f"{name}: {error} after {time.time() - started:.0f} s") from None
        print(f"  {name}: {time.time() - started:.1f} s", flush=True)
        result = (message or {}).get("result", {})
        text = next((part.get("text", "") for part in result.get("content", []) if part.get("type") == "text"), "")
        if result.get("isError") or not text.startswith("{"):
            if "concurrency" in text.lower() and attempt < 5:
                time.sleep(3 + attempt * 2)
                continue
            raise RuntimeError(f"{name}: {text[:300]}")
        payload = json.loads(text)
        if not payload.get("success"):
            if "concurrency" in json.dumps(payload).lower() and attempt < 5:
                time.sleep(3 + attempt * 2)
                continue
            raise RuntimeError(f"{name}: {json.dumps(payload)[:300]}")
        data = payload.get("data") or {}
        return data.get("title") or [], data.get("rows") or []
    raise RuntimeError(f"{name}: TE stayed busy")


def number(value):
    if value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return value
    return int(parsed) if parsed.is_integer() else round(parsed, 2)


def build(playfab_id):
    if not re.fullmatch(r"[0-9A-F]{16}", playfab_id):
        raise SystemExit(f"invalid PlayFab ID: {playfab_id}")

    columns, rows = run_sql("player", f"""select "#user_id", user_name, league_point,
        substr(cast(date_add('day', -2, created_time) as varchar), 1, 10), substr(cast(date_add('day', 2, last_login_time) as varchar), 1, 10)
        from ta.v_user_4 where "#account_id" = '{playfab_id}' limit 1""")
    if not rows:
        raise SystemExit(f"no player found for {playfab_id}")
    user_id, user_name, profile_league_points, first_day, last_day = rows[0]
    user_id = int(user_id)
    # Profile times use the phone's clock; two days of margin on each side cover any time zone.
    first_day = first_day or "2025-01-01"
    last_day = last_day or time.strftime("%Y-%m-%d", time.gmtime())
    base = f"\"$part_date\" between '{first_day}' and '{last_day}' and \"#user_id\" = {user_id}"

    queries = {
        "meta": f"""select substr(cast(min({UTC}) as varchar), 1, 19), substr(cast(max({UTC}) as varchar), 1, 19),
            max_by("#os", if("#os" is not null, "#event_time")), max_by("#device_model", if("#device_model" is not null, "#event_time")),
            max_by("#country_code", if("#country_code" is not null, "#event_time")), array_join(array_sort(array_agg(distinct "#app_version")), ',')
            from ta.v_event_4 where "$part_event" in ('login', 'battle_end') and {base} limit 1""",
        "battles": f"""with e as (
                select b."#event_time" as event_time, {UTC.replace('"#', 'b."#')} as utc_time, b."#app_version" as app_version, b.match_id, b.game_mode, b.map,
                    b.result, b.end_reason, b.kill_count, b.deaths_count, b.team_score, b.enemy_team_score, b.league_point, b.league_index,
                    b.passed_duration, b."equipped_character"."name" as character_name, b."equipped_character"."lvl" as character_lvl,
                    b.team_power_avg, b.enemy_team_power_avg, b.team_player_count, b.enemy_team_player_count
                from ta.v_event_4 b where b."$part_event" = 'battle_end' and b.{base}
            ), s as (
                select match_id, max(team_player_count) as start_team, max(enemy_team_player_count) as start_enemies
                from ta.v_event_4 where "$part_event" = 'battle_start' and {base} group by 1
            ), q as (
                select match_id, max(elapsed_time) as search_seconds
                from ta.v_event_4 where "$part_event" = 'battle_search' and action = 'success' and {base} group by 1
            )
            select substr(cast(e.utc_time as varchar), 1, 19), e.app_version, e.game_mode, e.map, e.result, e.end_reason, e.kill_count, e.deaths_count,
                e.team_score, e.enemy_team_score, e.league_point, e.league_index, e.passed_duration, e.character_name, e.character_lvl,
                e.team_power_avg, e.enemy_team_power_avg, e.team_player_count, e.enemy_team_player_count, s.start_team, s.start_enemies,
                q.search_seconds, substr(cast(e.event_time as varchar), 1, 23)
            from e left join s on s.match_id = e.match_id and e.match_id <> '' left join q on q.match_id = e.match_id and e.match_id <> ''
            order by e.utc_time, e.event_time limit 20000""",
        "weapons": f"""select substr(cast(b."#event_time" as varchar), 1, 23), weapon.w_name, weapon.w_cat, weapon.w_kill,
                cast(round(weapon.w_sec) as integer), round(weapon.w_dmg), weapon.w_boost
            from ta.v_event_4 b cross join unnest(b.match_end_weapons) as weapon(w_id, w_name, w_cat, w_lvl, w_pow, w_kill, w_sec, w_acc, w_boost, w_dmg)
            where b."$part_event" = 'battle_end' and b.{base} and (weapon.w_kill > 0 or weapon.w_sec > 0)
            order by b."#event_time" limit 20000""",
        "sessions": f"""select substr(cast({UTC} as varchar), 1, 19), cast(round("#duration") as integer)
            from ta.v_event_4 where "$part_event" = 'ta_app_end' and {base} order by {UTC} limit 20000""",
        "resources": f"""with e as (select "$part_event" as event_name, coalesce(nullif(source_type, ''), '-') as source_type, resources
                from ta.v_event_4 where "$part_event" in ('resource_earn', 'resource_spend') and {base})
            select case when event_name = 'resource_earn' then 'earn' else 'spend' end, source_type, resource.item_type, resource.item_name, count(*), sum(resource.quantity)
            from e cross join unnest(e.resources) as resource(item_id, item_name, item_type, quantity, final_amount)
            group by 1, 2, 3, 4 order by 1, 6 desc limit 20000""",
        "currency_days": f"""with e as (select {UTC} as utc_time, "$part_event" as event_name, resources
                from ta.v_event_4 where "$part_event" in ('resource_earn', 'resource_spend') and {base})
            select substr(cast(utc_time as varchar), 1, 10), resource.item_name,
                sum(case when event_name = 'resource_earn' then resource.quantity else 0 end),
                sum(case when event_name = 'resource_spend' then resource.quantity else 0 end),
                max_by(resource.final_amount, utc_time)
            from e cross join unnest(e.resources) as resource(item_id, item_name, item_type, quantity, final_amount)
            where resource.item_name in ('SoftCurrency', 'HardCurrency') group by 1, 2 order by 1, 2 limit 20000""",
        "inventory": f"""select substr(cast({UTC} as varchar), 1, 19), action, name, category, rarity, lvl_before, lvl
            from ta.v_event_4 where "$part_event" = 'inventory' and {base} order by {UTC} limit 20000""",
        "search_fails": f"""select substr(cast({UTC} as varchar), 1, 19), coalesce(fail_reason, '')
            from ta.v_event_4 where "$part_event" = 'battle_search' and action = 'fail' and {base}
            order by {UTC} limit 20000""",
    }

    results = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        futures = {pool.submit(run_sql, name, sql): name for name, sql in queries.items()}
        for future in concurrent.futures.as_completed(futures):
            results[futures[future]] = future.result()[1]

    meta = results["meta"][0] if results["meta"] else [None] * 6
    report = {
        "player": {
            "playfabId": playfab_id,
            "name": user_name,
            "firstSeen": meta[0],
            "lastSeen": meta[1],
            "os": meta[2],
            "device": meta[3],
            "country": meta[4],
            "versions": (meta[5] or "").split(",") if meta[5] else [],
        },
        # The profile holds the current league points, which is the value after the last match.
        "finalLeaguePoints": number(profile_league_points),
        "battles": [[number(value) if index in (6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21) else value for index, value in enumerate(row)] for row in results["battles"]],
        "weapons": [[row[0], row[1], row[2], number(row[3]), number(row[4]), number(row[5]), row[6]] for row in results["weapons"]],
        "sessions": [[row[0], number(row[1])] for row in results["sessions"]],
        "resources": [[row[0], row[1], row[2], row[3], number(row[4]), number(row[5])] for row in results["resources"]],
        "currencyDays": [[row[0], row[1], number(row[2]), number(row[3]), number(row[4])] for row in results["currency_days"]],
        "inventory": [[row[0], row[1], row[2], row[3], row[4], number(row[5]), number(row[6])] for row in results["inventory"]],
        "searchFails": results["search_fails"],
    }
    path = os.path.join(OUTPUT_DIRECTORY, f"data-{playfab_id}.js")
    with open(path, "w", encoding="utf-8") as file:
        file.write("window.statsPolygunData = window.statsPolygunData || {};\n")
        file.write(f"window.statsPolygunData[{json.dumps(playfab_id)}] = {json.dumps(report, separators=(',', ':'))};\n")
    counts = {key: len(value) for key, value in report.items() if isinstance(value, list)}
    print(playfab_id, user_name, "first day", first_day, "final LP", report["finalLeaguePoints"], counts, f"{os.path.getsize(path) // 1024} KB")


if __name__ == "__main__":
    initialize()
    for playfab_id in sys.argv[1:]:
        started = time.time()
        build(playfab_id)
        print(f"  done in {time.time() - started:.1f} s")
