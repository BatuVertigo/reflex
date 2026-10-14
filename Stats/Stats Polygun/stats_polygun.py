"""Stats Polygun: the player page plus a match report, answered with fixed ThinkingData (TE) queries.

/api/match/<match_id> takes a match ID from a community report and returns that match's real players, loadout,
matchmaking, errors and neighbouring matches.

Runs on the office Mac (port 3800 unless STATS_POLYGUN_PORT says otherwise), reads TE_MCP_URL and TE_MCP_TOKEN
from reflex/.env, and stores nothing: no disk writes, no cache. The console gets one line per API call (time, the
teammate's address, what was searched, how it ended; Batuhan's call, 2026-09-18). One TE job runs at a time, so the
shared TE account never sees more than 2 queries at once. All times are UTC+0 (phone clock shifted by #zone_offset).
"""

import concurrent.futures
import datetime
import json
import os
import re
import socket
import threading
import time
import urllib.error
import urllib.request
import uuid
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

from dotenv import load_dotenv

FOLDER = os.path.dirname(os.path.abspath(__file__))
# This folder sits in reflex/Stats/, and the .env is reflex's.
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(FOLDER)), ".env"))
TE_URL = os.environ.get("TE_MCP_URL", "")
TE_TOKEN = os.environ.get("TE_MCP_TOKEN", "")
PORT = int(os.environ.get("STATS_POLYGUN_PORT") or "3800")
# 20,000 is TE's cap. A lower value only serves to test the cut-off error.
ROW_LIMIT = int(os.environ.get("STATS_POLYGUN_ROW_LIMIT") or "20000")
STATIC = os.path.join(FOLDER, "static")
PROJECT_ID = 4
LOCK_WAIT_SECONDS = 120
# PlayFab IDs are hex numbers without leading zeros: 16 characters for most accounts, 11 to 15 for about 6% (TE, 2026-09-18).
PLAYFAB_ID = re.compile(r"[0-9A-F]{11,16}")
# Player names are 1 to 10 characters (the longest among players active in the 30 days before 2026-09-18); control characters are refused.
PLAYER_NAME = re.compile(r"[^\x00-\x1f\x7f]{1,10}")
DAY = re.compile(r"\d{4}-\d{2}-\d{2}")
# Match IDs come in four shapes: F-<uuid>, F-<uuid>_<hex>, F-SquadLocalMatch<PlayFabID><digits> and
# Unknown_<PlayFabID>_<n>_<digits>_<hex>. Only these characters appear in any of them, so no quote can reach the SQL.
MATCH_ID = re.compile(r"[A-Za-z0-9_-]{8,120}")
UTC = 'date_add(\'minute\', -cast(round(coalesce("#zone_offset", 0) * 60) as integer), "#event_time")'
UTC_DAY = f"substr(cast({UTC} as varchar), 1, 10)"
# A match: any non-tutorial, non-trial mode that ended normally. Everything else is a mark on the charts.
MATCH = "game_mode not in ('TutorialMap', 'TrialMap') and game_mode not like 'Tutorial%' and end_reason in ('Success-objective', 'Success-timeout')"
GUNS = "('Primary', 'Backup', 'Ranged', 'Support', 'Melee')"
WEAPON_COLUMNS = "weapon(w_id, w_name, w_cat, w_lvl, w_pow, w_kill, w_sec, w_acc, w_boost, w_dmg)"
BATTLE_NUMBER_COLUMNS = (6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21)
ARMOR_COLUMNS = "armor(a_id, a_name, a_cat, a_lvl, a_pow, a_boost)"
GADGET_COLUMNS = "gadget(g_id, g_name, g_cat, g_lvl, g_pow, g_fill, g_use, g_boost)"
# The events that carry a match_id, so a match can be found from its ID alone.
MATCH_EVENTS = "('battle_start', 'battle_end', 'battle_search', 'player_left', 'match_reconnect')"
# The events that tell what went wrong. Only player_left and match_reconnect carry a match_id, so the whole
# timeline is read by player and time window instead (TE, 2026-09-21).
TIMELINE_EVENTS = ("('error', 'player_left', 'match_reconnect', 'match_reconnect_pawn', 'reconnect_start',"
    " 'reconnect_attempt', 'reconnect_failed', 'reconnect_success', 'ta_app_crash', 'ta_app_bg_start', 'ta_app_end')")
# Minutes on each side of the match: enough for the search before it and the lobby after it.
TROUBLE_MINUTES = 5
# Minutes on each side for neighbouring matches: the derived-ID pattern the team hunts shows up inside this window.
NEIGHBOUR_MINUTES = 15
# LIKE reads _ and % as wildcards, so a match ID prefix needs an explicit escape character.
LIKE_ESCAPE = "escape '\\'"
# TE's warehouse drops a read now and then: a split goes missing, a worker dies mid-query. The same query goes
# through on the next try, so these read like "busy", not like "wrong query". A plain timeout is left out on
# purpose: the query already had its ten minutes, and running it again would only spend ten more.
TRANSIENT_REASONS = ("error reading from", "no more splits", "connection reset", "connection refused",
                     "server refused connection", "remote page", "worker node", "page transport", "corrupted")

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


def short_reason(reason):
    """TE answers a broken query with a whole Java trace; the page only needs the sentence a person can act on."""
    text = reason
    if reason.startswith("{"):
        try:
            text = json.loads(reason).get("message") or reason
        except ValueError:
            pass
    text = text.replace("java.sql.SQLException:", "").strip()
    # The query id and the warehouse path mean nothing to whoever is looking at the page.
    text = re.sub(r"\s*\(#[\w]+\)", "", text)
    text = re.sub(r"hdfs://\S+", "the warehouse", text)
    text = text.splitlines()[0].strip()[:160].rstrip(". ")
    return f"{text}." if text else "TE gave no reason."


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
            # TE's gateway drops a slow query with a 5xx of its own; the same query goes through on the next try.
            if error.code >= 500 and attempt < 2:
                time.sleep(3 + attempt * 2)
                continue
            raise ApiError(504 if error.code == 504 else 502, f"TE answered HTTP {error.code} on the {name} query. Try again.")
        except (urllib.error.URLError, TimeoutError, OSError):
            cancel(request_id)
            if attempt < 2:
                time.sleep(3 + attempt * 2)
                continue
            raise ApiError(504, f"TE did not answer the {name} query in time. Try again.")
        result = (message or {}).get("result", {})
        text = next((part.get("text", "") for part in result.get("content", []) if part.get("type") == "text"), "")
        payload = json.loads(text) if text.startswith("{") else {}
        if result.get("isError") or not payload.get("success"):
            reason = text or json.dumps(message)
            lowered = reason.lower()
            # Waiting out a busy TE is cheap, so that gets five tries; a dropped warehouse read costs a whole
            # query's running time, so it gets two.
            tries = 5 if "concurrency" in lowered else 2 if any(mark in lowered for mark in TRANSIENT_REASONS) else 0
            if attempt < tries:
                time.sleep(3 + attempt * 2)
                continue
            raise ApiError(502, f"TE could not run the {name} query. {short_reason(reason)} Try again.")
        rows = (payload.get("data") or {}).get("rows") or []
        if limit is None and len(rows) >= ROW_LIMIT:
            raise ApiError(502, f"The {name} query was cut off at {ROW_LIMIT:,} rows, so the report would be wrong. This player has too much data for one report.")
        return rows
    raise ApiError(503, "TE stayed busy. Try again in a moment.")


def run_all(queries, finished, optional=()):
    """Runs the queries 2 at a time (TE's concurrency limit) and calls finished() as each one ends. A query named in
    `optional` leaves None behind when it fails, so one flaky panel does not throw away a report that took minutes;
    any other failure cancels the rest."""
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        futures = {pool.submit(run_sql, name, sql): name for name, sql in queries.items()}
        rows = {}
        try:
            for future in concurrent.futures.as_completed(futures):
                name = futures[future]
                try:
                    rows[name] = future.result()
                except ApiError:
                    if name not in optional:
                        raise
                    rows[name] = None
                finished()
        except BaseException:
            for future in futures:
                future.cancel()
            raise
        return rows


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
    # vtd: value to date, the player's purchase total in US dollars.
    rows = run_sql("player", f"""select "#user_id", user_name, league_point,
        substr(cast(date_add('day', -2, created_time) as varchar), 1, 10), substr(cast(date_add('day', 2, last_login_time) as varchar), 1, 10), vtd
        from ta.v_user_4 where "#account_id" = '{playfab_id}'""")
    if not rows:
        raise ApiError(404, f"No player found for {playfab_id}.")
    user_id, name, league_points, first_day, last_day, vtd = rows[0]
    # Profile times use the phone's clock; two days of margin on each side cover any time zone.
    return int(user_id), name, number(league_points), first_day or "2025-01-01", last_day or time.strftime("%Y-%m-%d", time.gmtime()), number(vtd)


def find_player(name):
    """The account with this name in any case, the one who played last. The game keeps names unique ignoring case, but TE keeps the
    last name it saw on an abandoned account, so an old account can still hold a spelling its owner reused on a new one (keremmain,
    2026-08 v KeremMain, 2026-09; checked 2026-10-14). Names under 10 characters are almost all unique (339 of 984k shared,
    2026-09-18); shared ones are mostly 10-character default names, so the answer says how many share it."""
    literal = name.replace("'", "''")
    rows = run_sql("find", f"""select "#account_id", user_name, count(*) over ()
        from ta.v_user_4 where lower(user_name) = lower('{literal}') and "#account_id" is not null
        order by last_login_time desc""", limit=1)
    if not rows:
        raise ApiError(404, f"No player named {name}.")
    playfab_id, found_name, shared = rows[0]
    return {"playfabId": playfab_id, "name": found_name, "shared": number(shared)}


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


def purchases_sql(base, matches):
    """One row per real-money purchase, with the match that ended before it and the one that started after it.

    Store buys are iap_verify, one row per order_id (TE logs some orders twice). Web store buys are the server's
    webshop_purchase row (webshop_item_sku set, payment time, one per webshop_order_id); the row the game adds when the
    buy reaches it only exists since 2026-08 and is left out, so nothing counts twice. USD is the price paid when it was
    paid in USD; otherwise the product's median USD price over the last 90 days (so a price that changed since reads at
    today's price), else what the row itself says."""
    book_from = shift_day(time.strftime("%Y-%m-%d", time.gmtime()), -90)
    return f"""with raw as (
            select {UTC} as utc_time, "$part_event" as event_name, coalesce(product_id, webshop_item_sku) as product_id,
                if("$part_event" = 'webshop_purchase', try_cast(webshop_amount_decimal as double), try_cast(price as double)) as price,
                if("$part_event" = 'webshop_purchase', webshop_currency, currency) as currency,
                if("$part_event" = 'webshop_purchase', try_cast(webshop_total_amount_decimal_usd as double), nullif(vtd_addition, 0)) as fallback_usd,
                placement, popup, "window" as window_name, "trigger" as trigger_name,
                row_number() over (partition by "$part_event", coalesce(nullif(order_id, ''), nullif(webshop_order_id, ''), cast("#event_time" as varchar))
                    order by "#event_time") as copy
            from ta.v_event_4 where ("$part_event" = 'iap_verify' or ("$part_event" = 'webshop_purchase' and webshop_item_sku is not null)) and {base}
        ), p as (select *, row_number() over (order by utc_time) as id from raw where copy = 1
        ), book as (
            select product_id, approx_percentile(try_cast(coalesce(price, iap_price) as double), 0.5) as usd
            from ta.v_event_4 where "$part_event" in ('iap_verify', 'webshop_purchase') and "$part_date" >= '{book_from}'
                and coalesce(currency, iap_currency) = 'USD' and product_id in (select product_id from p)
            group by 1
        ), m as (
            select {UTC} as end_time, date_add('second', -cast(coalesce(passed_duration, 0) as integer), {UTC}) as start_time, result
            from ta.v_event_4 where {matches}
        ), before as (
            select p.id, max_by(m.result, m.end_time) as result, max(m.end_time) as end_time from p join m on m.end_time <= p.utc_time group by 1
        ), after as (
            select p.id, min(m.start_time) as start_time from p join m on m.start_time >= p.utc_time group by 1
        )
        select substr(cast(p.utc_time as varchar), 1, 19), case when p.event_name = 'webshop_purchase' then 'web' else 'store' end,
            p.product_id, p.price, p.currency,
            round(if(p.currency = 'USD', p.price, coalesce(book.usd, p.fallback_usd)), 2),
            p.placement, p.popup, p.window_name, p.trigger_name, before.result,
            date_diff('second', before.end_time, p.utc_time), date_diff('second', p.utc_time, after.start_time)
        from p left join book on book.product_id = p.product_id left join before on before.id = p.id left join after on after.id = p.id
        order by p.utc_time"""


def all_time(playfab_id, step):
    user_id, name, league_points, first_day, last_day, vtd = player_row(playfab_id)
    base = bounds(user_id, first_day, last_day)
    matches = f"\"$part_event\" = 'battle_end' and {base} and {MATCH}"
    queries = {
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
        "purchases": purchases_sql(base, matches),
    }
    # The player query, then these: the page's loading bar counts them.
    total = 1 + len(queries)
    step(total)
    # A failed purchases query leaves the panel empty instead of throwing away the whole career.
    rows = run_all(queries, lambda: step(total), optional=("purchases",))
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
        "vtd": vtd,
        "career": {"days": days, "modes": modes, "maps": maps, "buckets": buckets},
        "weaponTotals": [[row[0], row[1], number(row[2]), number(row[3]), number(row[4]), number(row[5])] for row in rows["weapon_totals"]],
        "resources": [[row[0], row[1], row[2], row[3], number(row[4]), number(row[5])] for row in rows["resources"]],
        "balances": [currency_row(row) for row in rows["balances"]],
        # None when the query failed, so the page can say so instead of showing a player who never paid.
        "purchases": None if rows["purchases"] is None else [
            [row[0], row[1], row[2], number(row[3]), row[4], number(row[5]), row[6], row[7], row[8], row[9], row[10], number(row[11]), number(row[12])]
            for row in rows["purchases"]],
    }


def period(playfab_id, from_day, to_day, with_matches, step):
    user_id, name, league_points, first_day, last_day, vtd = player_row(playfab_id)
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
    # The player query, battle_after when matches load, then the queries above: the page's loading bar counts them.
    total = (2 if with_matches else 1) + len(queries)
    step(total)
    if with_matches:
        # The first battle_end row after the period gives the last match its "after" league points.
        after_base = bounds(user_id, to_day, max(last_day, shift_day(to_day, 2)))
        after_day = UTC_DAY.replace('"#', 'b."#')
        after_rows = run_sql("battle_after", battles_sql(after_base, f"{after_day} > '{to_day}'"), limit=1)
        battle_after = battle_row(after_rows[0]) if after_rows else None
        step(total)
    rows = run_all(queries, lambda: step(total))
    return {
        "battles": [battle_row(row) for row in rows.get("battles", [])],
        "battleAfter": battle_after,
        "weapons": [[row[0], row[1], row[2], number(row[3]), number(row[4]), number(row[5]), row[6]] for row in rows.get("weapons", [])],
        "sessions": [[row[0], number(row[1])] for row in rows["sessions"]],
        "currencyDays": [currency_row(row) for row in rows["currency_days"]],
        "inventory": [[row[0], row[1], row[2], row[3], row[4], number(row[5]), number(row[6])] for row in rows["inventory"]],
        "searchFails": rows.get("search_fails", []),
    }


def like_prefix(text):
    """A LIKE pattern for every ID starting with this one; _ and % are wildcards in LIKE, so they are escaped."""
    return text.replace("\\", "\\\\").replace("_", "\\_").replace("%", "\\%") + "%"


def shift_minutes(stamp, minutes):
    return (datetime.datetime.fromisoformat(stamp) + datetime.timedelta(minutes=minutes)).isoformat(sep=" ")


def booster_list(text):
    """boosters holds one JSON object per booster; the page only needs each name and how many were carried."""
    try:
        items = json.loads(text) if text else []
    except ValueError:
        return []
    names = []
    for item in items:
        entry = json.loads(item) if isinstance(item, str) else item
        names.append([entry.get("name"), number(entry.get("amount"))] if isinstance(entry, dict) else [str(item), None])
    return names


def flag(value):
    """TE answers a boolean as the text 'true' or 'false', and leaves it out entirely when the client never sent it."""
    if value is None or value == "":
        return None
    return str(value).lower() in ("true", "1")


def match_detail(match_id, step):
    """Everything TE holds about one match: its real players, their loadout, matchmaking, what went wrong, and the matches around it."""
    # No date filter on purpose: a community report never says which day the match was on, and match_id is selective
    # enough that TE answers this one in seconds even across the whole history (measured 2026-09-21).
    found = run_sql("match", f"""select min("$part_date"), max("$part_date"),
        substr(cast(min({UTC}) as varchar), 1, 19), substr(cast(max({UTC}) as varchar), 1, 19)
        from ta.v_event_4 where "$part_event" in {MATCH_EVENTS} and match_id = '{match_id}'""", limit=1)
    first_date, last_date, first_time, last_time = found[0] if found else (None, None, None, None)
    if not first_date or not first_time:
        raise ApiError(404, f"No match found for {match_id}. Check the ID; TE only holds matches real players logged.")
    # The locator, then six match queries, then three player queries: the page's loading bar counts them.
    total = 10
    step(total)
    # Partitions are in the phone's local day, so one extra day on each side covers any time zone.
    days = f"\"$part_date\" between '{shift_day(first_date, -1)}' and '{shift_day(last_date, 1)}'"
    base = f"{days} and match_id = '{match_id}'"
    queries = {
        "ends": f"""select "#user_id", "#account_id", substr(cast({UTC} as varchar), 1, 19), result, end_reason, placement,
                kill_count, deaths_count, team_score, enemy_team_score, passed_duration,
                league_point, league_index, mm_league_point, mm_trophy_point, game_mode, map,
                team_power_avg, enemy_team_power_avg, team_player_count, enemy_team_player_count, player_count,
                "equipped_character"."name", "equipped_character"."lvl", "equipped_character"."power", inventory_elo,
                "#app_version", "#os", "#os_version", "#device_model", "#country_code",
                coalesce(nullif(network_type, ''), "#network_type"), "#fps", "#zone_offset",
                is_custom_match, is_private_lobby, is_squad_mm, squad_player_count, isprivatematch, auto_aim,
                array_join(bot_difficulties, ', ')
            from ta.v_event_4 where "$part_event" = 'battle_end' and {base} order by 3""",
        "starts": f"""select "#user_id", substr(cast({UTC} as varchar), 1, 19), game_mode, map,
                team_player_count, enemy_team_player_count, team_power_avg, enemy_team_power_avg,
                league_point, mm_league_point, "#app_version", cast(boosters as json), inventory_elo
            from ta.v_event_4 where "$part_event" = 'battle_start' and {base} order by 2""",
        "searches": f"""select "#user_id", substr(cast({UTC} as varchar), 1, 19), action, coalesce(fail_reason, ''),
                cast(round(elapsed_time) as integer), coalesce(matchmaking_id, ''), game_mode,
                team_player_count, enemy_team_player_count, team_power_avg, enemy_team_power_avg,
                is_squad_mm, squad_player_count, is_private_lobby, mm_league_point, mm_trophy_point
            from ta.v_event_4 where "$part_event" = 'battle_search' and {base} order by 2""",
        "leaves": f"""select "#user_id", substr(cast({UTC} as varchar), 1, 19), coalesce(left_user_id, ''),
                cast(round(exit_time) as integer), reconnect_started, kill_count, deaths_count
            from ta.v_event_4 where "$part_event" = 'player_left' and {base} order by 2""",
        "weapons": f"""select b."#user_id", weapon.w_name, weapon.w_cat, weapon.w_lvl, weapon.w_pow, weapon.w_kill,
                cast(round(weapon.w_sec) as integer), round(weapon.w_dmg), weapon.w_boost
            from ta.v_event_4 b cross join unnest(b.match_end_weapons) as {WEAPON_COLUMNS}
            where b."$part_event" = 'battle_end' and b.{base} and (weapon.w_kill > 0 or weapon.w_sec > 0)
            order by 1, 6 desc, 7 desc""",
        "gear": f"""select b."#user_id", 'Armor', armor.a_name, armor.a_cat, armor.a_lvl, armor.a_pow, armor.a_boost, null, null
                from ta.v_event_4 b cross join unnest(b.match_end_armors) as {ARMOR_COLUMNS}
                where b."$part_event" = 'battle_end' and b.{base}
            union all
            select b."#user_id", 'Gadget', gadget.g_name, gadget.g_cat, gadget.g_lvl, gadget.g_pow, gadget.g_boost, gadget.g_use, gadget.g_fill
                from ta.v_event_4 b cross join unnest(b.match_end_gadgets) as {GADGET_COLUMNS}
                where b."$part_event" = 'battle_end' and b.{base}
            order by 1, 2, 3""",
    }
    # battle_end carries the players, so it has to work; the other five are panels the report can go without.
    rows = run_all(queries, lambda: step(total), optional=("starts", "searches", "leaves", "weapons", "gear"))

    # Only real players log events, so every list here is a real account.
    user_ids = sorted({str(row[0]) for name in ("ends", "starts", "searches", "leaves")
                       for row in (rows[name] or []) if row[0]})
    if not all(user_id.isdigit() for user_id in user_ids):
        raise ApiError(502, "TE answered with a user ID that is not a number.")
    if not user_ids:
        raise ApiError(404, f"No player events found for {match_id}.")
    people = ", ".join(user_ids)
    inside = lambda start, end: f"{UTC} between timestamp '{start}' and timestamp '{end}'"
    more = {
        "names": f"""select "#user_id", "#account_id", user_name, vtd, league_point
            from ta.v_user_4 where "#user_id" in ({people})""",
        "timeline": f"""select "#user_id", substr(cast({UTC} as varchar), 1, 19), "$part_event",
                coalesce(nullif(error_type, ''), ''), coalesce(nullif(reason, ''), ''), coalesce(nullif(action, ''), ''),
                coalesce(nullif(game_state, ''), ''), coalesce(nullif("function", ''), ''), coalesce(nullif(region, ''), ''),
                ping, ping_max, coalesce(nullif(phase, ''), ''), coalesce(nullif(left_user_id, ''), ''),
                cast(round(exit_time) as integer), reconnect_started, cast(round("#duration") as integer),
                coalesce(nullif(match_id, ''), '')
            from ta.v_event_4 where "$part_event" in {TIMELINE_EVENTS} and {days} and "#user_id" in ({people})
                and {inside(shift_minutes(first_time, -TROUBLE_MINUTES), shift_minutes(last_time, TROUBLE_MINUTES))}
            order by 2""",
    }
    extra = run_all(more, lambda: step(total), optional=("timeline",))
    # The widest scan in the report: the prefix branch reads every match of those days, not just these players'.
    # It runs on the match's own partition days, so a neighbour that fell on the next local day can be missed.
    related_sql = f"""select match_id, substr(cast(min({UTC}) as varchar), 1, 19), substr(cast(max({UTC}) as varchar), 1, 19),
            count(*), count(distinct "#user_id"), arbitrary(game_mode), arbitrary(map)
        from ta.v_event_4 where "$part_event" in ('battle_start', 'battle_end')
            and "$part_date" between '{first_date}' and '{last_date}'
            and match_id <> '{match_id}' and match_id is not null and match_id <> ''
            and (match_id like '{like_prefix(match_id)}' {LIKE_ESCAPE}
                or ("#user_id" in ({people})
                    and {inside(shift_minutes(first_time, -NEIGHBOUR_MINUTES), shift_minutes(last_time, NEIGHBOUR_MINUTES))}))
        group by 1 order by 2"""
    try:
        related = run_sql("related", related_sql, limit=200)
    except ApiError:
        # Everything else in the report is already in hand, and this panel is the only one that can be left out.
        related = None
    step(total)
    profiles = {str(row[0]): {"playfabId": row[1], "name": row[2], "vtd": number(row[3]), "leaguePoints": number(row[4])}
                for row in extra["names"]}

    def listed(source, name, build):
        """A query TE gave up on stays None all the way to the page, so a panel can say so instead of looking empty."""
        return None if source.get(name) is None else [build(row) for row in source[name]]

    def player_row_of(row):
        profile = profiles.get(str(row[0]), {})
        return {
            "userId": str(row[0]), "playfabId": row[1], "name": profile.get("name"), "vtd": profile.get("vtd"),
            "time": row[2], "result": row[3], "endReason": row[4], "placement": row[5],
            "kills": number(row[6]) or 0, "deaths": number(row[7]) or 0,
            "teamScore": number(row[8]), "enemyScore": number(row[9]), "duration": number(row[10]),
            "leaguePoints": number(row[11]), "leagueIndex": number(row[12]),
            "mmLeaguePoints": number(row[13]), "mmTrophyPoints": number(row[14]),
            "mode": row[15], "map": row[16],
            "teamPower": number(row[17]), "enemyPower": number(row[18]),
            "teamCount": number(row[19]), "enemyCount": number(row[20]), "playerCount": number(row[21]),
            "character": row[22], "characterLevel": number(row[23]), "characterPower": number(row[24]),
            "inventoryElo": number(row[25]), "version": row[26], "os": row[27], "osVersion": row[28],
            "device": row[29], "country": row[30], "network": row[31], "fps": number(row[32]),
            "zoneOffset": number(row[33]),
            "custom": flag(row[34]), "privateLobby": flag(row[35]), "squad": flag(row[36]),
            "squadCount": number(row[37]), "privateMatch": flag(row[38]), "autoAim": flag(row[39]),
            "bots": row[40] or "",
        }

    return {
        "matchId": match_id,
        "firstSeen": first_time,
        "lastSeen": last_time,
        "players": [player_row_of(row) for row in rows["ends"]],
        # A player who never reached battle_end still appears here, in the searches, the leaves and the timeline.
        "profiles": profiles,
        "starts": listed(rows, "starts", lambda row: {
            "userId": str(row[0]), "time": row[1], "mode": row[2], "map": row[3],
            "teamCount": number(row[4]), "enemyCount": number(row[5]),
            "teamPower": number(row[6]), "enemyPower": number(row[7]),
            "leaguePoints": number(row[8]), "mmLeaguePoints": number(row[9]),
            "version": row[10], "boosters": booster_list(row[11]), "inventoryElo": number(row[12])}),
        "searches": listed(rows, "searches", lambda row: {
            "userId": str(row[0]), "time": row[1], "action": row[2], "failReason": row[3],
            "seconds": number(row[4]), "matchmakingId": row[5], "mode": row[6],
            "teamCount": number(row[7]), "enemyCount": number(row[8]),
            "teamPower": number(row[9]), "enemyPower": number(row[10]),
            "squad": flag(row[11]), "squadCount": number(row[12]), "privateLobby": flag(row[13]),
            "mmLeaguePoints": number(row[14]), "mmTrophyPoints": number(row[15])}),
        "leaves": listed(rows, "leaves", lambda row: {
            "userId": str(row[0]), "time": row[1], "leftUserId": row[2], "exitSeconds": number(row[3]),
            "reconnectStarted": number(row[4]), "kills": number(row[5]), "deaths": number(row[6])}),
        "weapons": listed(rows, "weapons", lambda row: {
            "userId": str(row[0]), "name": row[1], "category": row[2], "level": number(row[3]),
            "power": number(row[4]), "kills": number(row[5]) or 0, "seconds": number(row[6]) or 0,
            "damage": number(row[7]) or 0, "boost": row[8]}),
        "gear": listed(rows, "gear", lambda row: {
            "userId": str(row[0]), "kind": row[1], "name": row[2], "category": row[3], "level": number(row[4]),
            "power": number(row[5]), "boost": row[6], "used": number(row[7]), "filled": number(row[8])}),
        "timeline": listed(extra, "timeline", lambda row: {
            "userId": str(row[0]), "time": row[1], "event": row[2], "errorType": row[3], "reason": row[4],
            "action": row[5], "gameState": row[6], "function": row[7], "region": row[8],
            "ping": number(row[9]), "pingMax": number(row[10]), "phase": row[11], "leftUserId": row[12],
            "exitSeconds": number(row[13]), "reconnectStarted": number(row[14]),
            "seconds": number(row[15]), "matchId": row[16]}),
        # None, not an empty list: TE gave up on this one query and the page says so instead of "nothing found".
        "related": None if related is None else [
            {"matchId": row[0], "firstSeen": row[1], "lastSeen": row[2], "events": number(row[3]),
             "players": number(row[4]), "mode": row[5], "map": row[6]}
            for row in related],
    }


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC, **kwargs)

    def handle(self):
        # Browsers open spare connections and drop them unused (tab closed, phone locked); that is no error worth a traceback.
        try:
            super().handle()
        except ConnectionError:
            pass

    def log_message(self, format, *args):
        # Raw request lines and static files stay quiet; stream_job prints one readable line per API call instead.
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
        elif urlparse(self.path).path in ("/", "/index.html"):
            self.send_page()
        else:
            super().do_GET()

    def send_page(self):
        # index.html carries no doctype because the artifact host wraps it; without one browsers render in quirks mode.
        with open(os.path.join(STATIC, "index.html"), "rb") as file:
            body = b'<!doctype html>\n<html lang="en">\n' + file.read() + b"\n</html>\n"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_api(self, url):
        if url.path == "/api/find":
            name = parse_qs(url.query).get("name", [""])[0].strip()
            if not PLAYER_NAME.fullmatch(name):
                self.send_json(400, {"error": "A player name has 1 to 10 characters."})
                return
            self.stream_job(lambda step: find_player(name), f'find "{name}"')
            return
        if url.path.startswith("/api/match/"):
            match_id = unquote(url.path[len("/api/match/"):])
            if not MATCH_ID.fullmatch(match_id):
                self.send_json(400, {"error": "A match ID is 8 to 120 characters: letters, digits, - and _."})
                return
            self.stream_job(lambda step: match_detail(match_id, step), f"match {match_id}")
            return
        try:
            match = re.fullmatch(r"/api/player/([^/]+)(/period)?", url.path)
            if not match:
                raise ApiError(404, "Unknown API path.")
            playfab_id = match.group(1).upper()
            if not PLAYFAB_ID.fullmatch(playfab_id):
                raise ApiError(400, "A PlayFab ID has 11 to 16 characters: digits 0–9 and letters A–F.")
            query = parse_qs(url.query)
            if match.group(2):
                from_day, to_day = query.get("from", [""])[0], query.get("to", [""])[0]
                if not (DAY.fullmatch(from_day) and DAY.fullmatch(to_day)) or from_day > to_day:
                    raise ApiError(400, "Dates must be YYYY-MM-DD, with from on or before to.")
                with_matches = query.get("matches", ["1"])[0] != "0"
                job = lambda step: period(playfab_id, from_day, to_day, with_matches, step)
                what = f"period {playfab_id} {from_day}..{to_day}"
            else:
                job = lambda step: all_time(playfab_id, step)
                what = f"career {playfab_id}"
        except ApiError as error:
            self.send_json(error.status, {"error": str(error)})
            return
        self.stream_job(job, what)

    def stream_job(self, job, what):
        """Answers with one JSON line per event, so the page can show progress: waiting in line, each finished TE query, then the result or the error.
        When the call ends, prints one console line: time, the teammate's address, what was asked, and OK, FAILED or STOPPED."""
        started = time.monotonic()
        outcome = "OK"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
        self.end_headers()
        write = lambda event: self.wfile.write(json.dumps(event, separators=(",", ":")).encode() + b"\n")
        done = 0

        def step(total):
            nonlocal done
            done += 1
            write({"done": done, "total": total})

        try:
            try:
                waited = not te_lock.acquire(blocking=False)
                if waited:
                    write({"waiting": True})
                    if not te_lock.acquire(timeout=LOCK_WAIT_SECONDS):
                        raise ApiError(503, "Another search is still running. Try again in a moment.")
                try:
                    if waited:
                        write({"waiting": False})
                    result = job(step)
                finally:
                    te_lock.release()
                write({"result": result})
            except ApiError as error:
                outcome = f"FAILED {error}"
                write({"error": str(error)})
            except ConnectionError:
                raise
            except Exception as error:
                # The class name only, never the query text.
                outcome = f"FAILED unexpected {error.__class__.__name__}"
                write({"error": "Stats Polygun hit an unexpected error. Try again."})
        except ConnectionError:
            # The page closed or reloaded mid-search: nobody is left to answer, and the lock is already free.
            outcome = "STOPPED the page closed before the answer"
        status, _, detail = outcome.partition(" ")
        print(f"{time.strftime('%H:%M:%S')}  {self.client_address[0]}  {what}  {status} {time.monotonic() - started:.1f} s  {detail}".rstrip(), flush=True)

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
