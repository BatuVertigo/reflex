"""Stats Polygun: serves the page and answers its two API calls with fixed ThinkingData (TE) queries.

Runs on the office Mac (port 3800 unless STATS_POLYGUN_PORT says otherwise), reads TE_MCP_URL and TE_MCP_TOKEN
from reflex/.env, and stores nothing: no disk writes, no cache, no request log. One TE job runs at a time, so the
shared TE account never sees more than 2 queries at once. All times are UTC+0 (phone clock shifted by #zone_offset).
"""

import concurrent.futures
import datetime
import json
import os
import re
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from dotenv import load_dotenv

FOLDER = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(os.path.dirname(FOLDER), ".env"))
TE_URL = os.environ.get("TE_MCP_URL", "")
TE_TOKEN = os.environ.get("TE_MCP_TOKEN", "")
PORT = int(os.environ.get("STATS_POLYGUN_PORT") or "3800")
# 20,000 is TE's cap. A lower value only serves to test the cut-off error.
ROW_LIMIT = int(os.environ.get("STATS_POLYGUN_ROW_LIMIT") or "20000")
STATIC = os.path.join(FOLDER, "static")
PROJECT_ID = 4
LOCK_WAIT_SECONDS = 120
PLAYFAB_ID = re.compile(r"[0-9A-F]{16}")
DAY = re.compile(r"\d{4}-\d{2}-\d{2}")
UTC = 'date_add(\'minute\', -cast(round(coalesce("#zone_offset", 0) * 60) as integer), "#event_time")'
UTC_DAY = f"substr(cast({UTC} as varchar), 1, 10)"
# A match: any non-tutorial, non-trial mode that ended normally. Everything else is a mark on the charts.
MATCH = "game_mode not in ('TutorialMap', 'TrialMap') and game_mode not like 'Tutorial%' and end_reason in ('Success-objective', 'Success-timeout')"
GUNS = "('Primary', 'Backup', 'Ranged', 'Support', 'Melee')"
WEAPON_COLUMNS = "weapon(w_id, w_name, w_cat, w_lvl, w_pow, w_kill, w_sec, w_acc, w_boost, w_dmg)"
BATTLE_NUMBER_COLUMNS = (6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21)

# ponytail: one global lock, so two teammates' searches run one after the other; revisit if TE ever allows more than 2 queries.
te_lock = threading.Lock()


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def post(payload):
    headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream", "mcp-token": TE_TOKEN}
    request = urllib.request.Request(TE_URL, data=json.dumps(payload).encode(), headers=headers, method="POST")
    with urllib.request.urlopen(request, timeout=300) as response:
        body = response.read().decode()
        content_type = response.headers.get("Content-Type", "")
    if "text/event-stream" in content_type:
        messages = [json.loads(line[5:].strip()) for line in body.splitlines() if line.startswith("data:") and line[5:].strip()]
        return messages[-1] if messages else None
    return json.loads(body) if body.strip() else None


def initialize():
    post({"jsonrpc": "2.0", "id": 1, "method": "initialize",
          "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "stats-polygun", "version": "0.1"}}})
    post({"jsonrpc": "2.0", "method": "notifications/initialized"})


def cancel(request_id):
    try:
        post({"jsonrpc": "2.0", "id": 3, "method": "tools/call",
              "params": {"name": "cancel_query", "arguments": {"requestId": request_id, "reason": "Stats Polygun gave up"}}})
    except Exception:
        pass


def run_sql(name, sql, limit=None):
    """Runs one query through query_adhoc and returns its rows. Retries while TE is busy; a full result set means it was cut off."""
    row_limit = limit or ROW_LIMIT
    for attempt in range(6):
        request_id = "mcp_" + uuid.uuid4().hex
        try:
            message = post({"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "query_adhoc", "arguments": {
                "projectId": PROJECT_ID,
                "modelType": "sql",
                "qp": json.dumps({"eventView": {"requiredEvents": ["login"]}, "events": {"sql": f"{sql} limit {row_limit}"}}),
                "requestId": request_id,
                "limit": row_limit,
                "timeoutMinutes": 10,
            }}})
        except urllib.error.HTTPError as error:
            cancel(request_id)
            raise ApiError(504 if error.code == 504 else 502, f"TE answered HTTP {error.code} on the {name} query. Try again.")
        except (urllib.error.URLError, TimeoutError, OSError):
            cancel(request_id)
            raise ApiError(504, f"TE did not answer the {name} query in time. Try again.")
        result = (message or {}).get("result", {})
        text = next((part.get("text", "") for part in result.get("content", []) if part.get("type") == "text"), "")
        payload = json.loads(text) if text.startswith("{") else {}
        if result.get("isError") or not payload.get("success"):
            reason = text or json.dumps(message)
            if "concurrency" in reason.lower() and attempt < 5:
                time.sleep(3 + attempt * 2)
                continue
            raise ApiError(502, f"TE rejected the {name} query: {reason[:200]}")
        rows = (payload.get("data") or {}).get("rows") or []
        if limit is None and len(rows) >= ROW_LIMIT:
            raise ApiError(502, f"The {name} query was cut off at {ROW_LIMIT:,} rows, so the report would be wrong. This player has too much data for one report.")
        return rows
    raise ApiError(503, "TE stayed busy. Try again in a moment.")


def run_all(queries):
    """Runs the queries 2 at a time (TE's concurrency limit). The first failure cancels the rest."""
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        futures = {name: pool.submit(run_sql, name, sql) for name, sql in queries.items()}
        try:
            return {name: future.result() for name, future in futures.items()}
        except BaseException:
            for future in futures.values():
                future.cancel()
            raise


def number(value):
    if value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return value
    return int(parsed) if parsed.is_integer() else round(parsed, 2)


def shift_day(day, days):
    return (datetime.date.fromisoformat(day) + datetime.timedelta(days=days)).isoformat()


def player_row(playfab_id):
    rows = run_sql("player", f"""select "#user_id", user_name, league_point,
        substr(cast(date_add('day', -2, created_time) as varchar), 1, 10), substr(cast(date_add('day', 2, last_login_time) as varchar), 1, 10)
        from ta.v_user_4 where "#account_id" = '{playfab_id}'""")
    if not rows:
        raise ApiError(404, f"No player found for {playfab_id}.")
    user_id, name, league_points, first_day, last_day = rows[0]
    # Profile times use the phone's clock; two days of margin on each side cover any time zone.
    return int(user_id), name, number(league_points), first_day or "2025-01-01", last_day or time.strftime("%Y-%m-%d", time.gmtime())


def bounds(user_id, first_day, last_day):
    return f"\"$part_date\" between '{first_day}' and '{last_day}' and \"#user_id\" = {user_id}"


def battles_sql(base, extra):
    utc_b = UTC.replace('"#', 'b."#')
    return f"""with e as (
            select b."#event_time" as event_time, {utc_b} as utc_time, b."#app_version" as app_version, b.match_id, b.game_mode, b.map,
                b.result, b.end_reason, b.kill_count, b.deaths_count, b.team_score, b.enemy_team_score, b.league_point, b.league_index,
                b.passed_duration, b."equipped_character"."name" as character_name, b."equipped_character"."lvl" as character_lvl,
                b.team_power_avg, b.enemy_team_power_avg, b.team_player_count, b.enemy_team_player_count
            from ta.v_event_4 b where b."$part_event" = 'battle_end' and b.{base} and {extra}
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
        order by e.utc_time, e.event_time"""


def battle_row(row):
    return [number(value) if index in BATTLE_NUMBER_COLUMNS else value for index, value in enumerate(row)]


def currency_days_sql(base, extra):
    return f"""with e as (select {UTC} as utc_time, "$part_event" as event_name, resources
            from ta.v_event_4 where "$part_event" in ('resource_earn', 'resource_spend') and {base} and {extra})
        select substr(cast(utc_time as varchar), 1, 10) as utc_day, resource.item_name,
            sum(case when event_name = 'resource_earn' then resource.quantity else 0 end) as earned,
            sum(case when event_name = 'resource_spend' then resource.quantity else 0 end) as spent,
            max_by(resource.final_amount, utc_time) as final_amount
        from e cross join unnest(e.resources) as resource(item_id, item_name, item_type, quantity, final_amount)
        where resource.item_name in ('SoftCurrency', 'HardCurrency') group by 1, 2"""


def currency_row(row):
    return [row[0], row[1], number(row[2]), number(row[3]), number(row[4])]


def all_time(playfab_id):
    user_id, name, league_points, first_day, last_day = player_row(playfab_id)
    base = bounds(user_id, first_day, last_day)
    matches = f"\"$part_event\" = 'battle_end' and {base} and {MATCH}"
    rows = run_all({
        "meta": f"""select substr(cast(min({UTC}) as varchar), 1, 19), substr(cast(max({UTC}) as varchar), 1, 19),
            max_by("#os", if("#os" is not null, "#event_time")), max_by("#device_model", if("#device_model" is not null, "#event_time")),
            max_by("#country_code", if("#country_code" is not null, "#event_time")), array_join(array_sort(array_agg(distinct "#app_version")), ',')
            from ta.v_event_4 where "$part_event" in ('login', 'battle_end') and {base}""",
        # One scan of the real matches, grouped four ways: per UTC day (the strip), per mode, per map and per power gap bucket.
        "career": f"""with m as (
                select {UTC} as utc_time, {UTC_DAY} as utc_day, "#app_version" as app_version, game_mode, map, result, kill_count, deaths_count, league_point,
                    case when team_power_avg > 0 and enemy_team_power_avg > 0
                        then (cast(team_power_avg as double) - cast(enemy_team_power_avg as double)) / cast(enemy_team_power_avg as double) * 100 end as gap
                from ta.v_event_4 where {matches}
            ), b as (
                select *, case when gap < -20 then 'much_weaker' when gap < -5 then 'weaker' when gap <= 5 then 'even'
                    when gap <= 20 then 'stronger' when gap > 20 then 'much_stronger' end as bucket from m
            )
            select utc_day, game_mode, map, bucket, count(*), count_if(result = 'Victory'), count_if(result = 'Defeat'), sum(kill_count), sum(deaths_count),
                min_by(league_point, utc_time), max(league_point), max_by(app_version, utc_time), grouping(utc_day, game_mode, map, bucket)
            from b group by grouping sets ((utc_day), (game_mode), (map), (bucket)) order by 1, 2, 3, 4""",
        "weapon_totals": f"""select weapon.w_name, arbitrary(weapon.w_cat), sum(weapon.w_kill), count(*), sum(cast(round(weapon.w_sec) as integer)),
                sum(case when weapon.w_cat in {GUNS} and round(weapon.w_dmg) > 0 then round(weapon.w_dmg) else 0 end)
            from ta.v_event_4 cross join unnest(match_end_weapons) as {WEAPON_COLUMNS}
            where {matches} and (weapon.w_kill > 0 or weapon.w_sec > 0)
            group by 1 order by 3 desc, 4 desc""",
        "resources": f"""with e as (select "$part_event" as event_name, coalesce(nullif(source_type, ''), '-') as source_type, resources
                from ta.v_event_4 where "$part_event" in ('resource_earn', 'resource_spend') and {base})
            select case when event_name = 'resource_earn' then 'earn' else 'spend' end, source_type, resource.item_type, resource.item_name, count(*), sum(resource.quantity)
            from e cross join unnest(e.resources) as resource(item_id, item_name, item_type, quantity, final_amount)
            group by 1, 2, 3, 4 order by 1, 6 desc""",
        # The latest day row per currency, so the Career balance tile shows the current balance.
        "balances": f"""with d as ({currency_days_sql(base, 'true')}),
            r as (select *, row_number() over (partition by item_name order by utc_day desc) as recency from d)
            select utc_day, item_name, earned, spent, final_amount from r where recency = 1 order by 1, 2""",
    })
    meta = rows["meta"][0] if rows["meta"] else [None] * 6
    days, modes, maps, buckets = [], [], [], []
    for day, mode, map_name, bucket, count, wins, losses, kills, deaths, first_points, top_points, version, mask in rows["career"]:
        stats = [number(count), number(wins), number(losses), number(kills) or 0, number(deaths) or 0]
        mask = number(mask)
        if mask == 7:
            days.append([day, *stats, number(first_points) or 0, number(top_points) or 0, version])
        elif mask == 11:
            modes.append([mode, *stats])
        elif mask == 13:
            maps.append([map_name, *stats])
        elif mask == 14 and bucket:
            buckets.append([bucket, *stats])
    days.sort(key=lambda row: row[0])
    return {
        "player": {
            "playfabId": playfab_id, "name": name, "firstSeen": meta[0], "lastSeen": meta[1], "os": meta[2], "device": meta[3], "country": meta[4],
            "versions": (meta[5] or "").split(",") if meta[5] else [],
        },
        # The profile holds the current league points, which is the value after the last match.
        "finalLeaguePoints": league_points,
        "career": {"days": days, "modes": modes, "maps": maps, "buckets": buckets},
        "weaponTotals": [[row[0], row[1], number(row[2]), number(row[3]), number(row[4]), number(row[5])] for row in rows["weapon_totals"]],
        "resources": [[row[0], row[1], row[2], row[3], number(row[4]), number(row[5])] for row in rows["resources"]],
        "balances": [currency_row(row) for row in rows["balances"]],
    }


def period(playfab_id, from_day, to_day, with_matches):
    user_id, name, league_points, first_day, last_day = player_row(playfab_id)
    # Partitions are in the phone's local day, so one extra day on each side covers any time zone; the UTC filter does the exact cut.
    base = bounds(user_id, shift_day(from_day, -1), shift_day(to_day, 1))
    inside = f"{UTC_DAY} between '{from_day}' and '{to_day}'"
    inside_b = inside.replace('"#', 'b."#')
    queries = {
        "sessions": f"""select substr(cast({UTC} as varchar), 1, 19), cast(round("#duration") as integer)
            from ta.v_event_4 where "$part_event" = 'ta_app_end' and {base} and {inside} order by 1""",
        "currency_days": f"{currency_days_sql(base, inside)} order by 1, 2",
        "inventory": f"""select substr(cast({UTC} as varchar), 1, 19), action, name, category, rarity, lvl_before, lvl
            from ta.v_event_4 where "$part_event" = 'inventory' and {base} and {inside} order by 1""",
    }
    battle_after = None
    if with_matches:
        queries["battles"] = battles_sql(base, inside_b)
        queries["weapons"] = f"""select substr(cast(b."#event_time" as varchar), 1, 23), weapon.w_name, weapon.w_cat, weapon.w_kill,
                cast(round(weapon.w_sec) as integer), round(weapon.w_dmg), weapon.w_boost
            from ta.v_event_4 b cross join unnest(b.match_end_weapons) as {WEAPON_COLUMNS}
            where b."$part_event" = 'battle_end' and b.{base} and {inside_b} and (weapon.w_kill > 0 or weapon.w_sec > 0)
            order by 1"""
        queries["search_fails"] = f"""select substr(cast({UTC} as varchar), 1, 19), coalesce(fail_reason, '')
            from ta.v_event_4 where "$part_event" = 'battle_search' and action = 'fail' and {base} and {inside} order by 1"""
        # The first battle_end row after the period gives the last match its "after" league points.
        after_base = bounds(user_id, to_day, max(last_day, shift_day(to_day, 2)))
        after_day = UTC_DAY.replace('"#', 'b."#')
        after_rows = run_sql("battle_after", battles_sql(after_base, f"{after_day} > '{to_day}'"), limit=1)
        battle_after = battle_row(after_rows[0]) if after_rows else None
    rows = run_all(queries)
    return {
        "battles": [battle_row(row) for row in rows.get("battles", [])],
        "battleAfter": battle_after,
        "weapons": [[row[0], row[1], row[2], number(row[3]), number(row[4]), number(row[5]), row[6]] for row in rows.get("weapons", [])],
        "sessions": [[row[0], number(row[1])] for row in rows["sessions"]],
        "currencyDays": [currency_row(row) for row in rows["currency_days"]],
        "inventory": [[row[0], row[1], row[2], row[3], row[4], number(row[5]), number(row[6])] for row in rows["inventory"]],
        "searchFails": rows.get("search_fails", []),
    }


def with_te_lock(job):
    if not te_lock.acquire(timeout=LOCK_WAIT_SECONDS):
        raise ApiError(503, "Another search is still running. Try again in a moment.")
    try:
        return job()
    finally:
        te_lock.release()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC, **kwargs)

    def log_message(self, format, *args):
        # No request log: PlayFab IDs never reach the console.
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def guess_type(self, path):
        content_type = super().guess_type(path)
        return f"{content_type}; charset=utf-8" if content_type.startswith("text/") or "javascript" in content_type else content_type

    def list_directory(self, path):
        self.send_error(HTTPStatus.NOT_FOUND)
        return None

    def do_GET(self):
        if self.path.startswith("/api/"):
            self.handle_api(urlparse(self.path))
        else:
            super().do_GET()

    def handle_api(self, url):
        try:
            match = re.fullmatch(r"/api/player/([^/]+)(/period)?", url.path)
            if not match:
                raise ApiError(404, "Unknown API path.")
            playfab_id = match.group(1).upper()
            if not PLAYFAB_ID.fullmatch(playfab_id):
                raise ApiError(400, "A PlayFab ID has 16 characters: digits 0–9 and letters A–F.")
            query = parse_qs(url.query)
            if match.group(2):
                from_day, to_day = query.get("from", [""])[0], query.get("to", [""])[0]
                if not (DAY.fullmatch(from_day) and DAY.fullmatch(to_day)) or from_day > to_day:
                    raise ApiError(400, "Dates must be YYYY-MM-DD, with from on or before to.")
                with_matches = query.get("matches", ["1"])[0] != "0"
                payload = with_te_lock(lambda: period(playfab_id, from_day, to_day, with_matches))
            else:
                payload = with_te_lock(lambda: all_time(playfab_id))
            self.send_json(200, payload)
        except ApiError as error:
            self.send_json(error.status, {"error": str(error)})
        except Exception as error:
            # The class name only: no IDs, no query text on the console.
            print(f"search failed: {error.__class__.__name__}", file=sys.stderr, flush=True)
            self.send_json(502, {"error": "Stats Polygun hit an unexpected error. Try again."})

    def send_json(self, status, payload):
        body = json.dumps(payload, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def lan_address():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(("8.8.8.8", 80))
            return probe.getsockname()[0]
    except OSError:
        return "<this Mac's Wi-Fi address>"


def main():
    if not TE_URL or not TE_TOKEN:
        raise SystemExit("Set TE_MCP_URL and TE_MCP_TOKEN in reflex/.env first.")
    initialize()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Stats Polygun is up: http://{lan_address()}:{PORT} (Ctrl+C stops it)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
