(() => {
  "use strict";

  // Preview only: answers the two Stats Polygun API calls from the embedded TE rows, in the shapes the server returns.
  // The real page uses source.js, which fetches /api/player/<id> and /api/player/<id>/period; the artifact publishes this file under that name.
  const SP = window.StatsPolygun;
  const SAMPLES = ["D6B0E21AF503CBDA", "3065F15E98D3E8BD", "D4D4D020199FC96E"];
  const loads = new Map();
  const increment = (row, result, kills, deaths) => {
    row[1] += 1;
    row[2] += result === "Victory" ? 1 : 0;
    row[3] += result === "Defeat" ? 1 : 0;
    row[4] += kills ?? 0;
    row[5] += deaths ?? 0;
  };
  const groupRow = (groups, id) => {
    if (!groups.has(id)) groups.set(id, [id, 0, 0, 0, 0, 0]);
    return groups.get(id);
  };

  // Loads data-<id>.js once per visit, so the preview shows a real loading state.
  function load(playfabId) {
    if (!SAMPLES.includes(playfabId)) {
      return Promise.reject(new Error(`${playfabId} is not in this preview. The real Stats Polygun looks up any player in TE; this page only holds the three preview accounts.`));
    }
    if (!loads.has(playfabId)) {
      loads.set(playfabId, new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = `data-${playfabId}.js`;
        script.onload = () => resolve(window.statsPolygunData[playfabId]);
        script.onerror = () => {
          loads.delete(playfabId);
          reject(new Error(`Could not load the preview data for ${playfabId}.`));
        };
        document.head.appendChild(script);
      }));
    }
    return loads.get(playfabId);
  }

  SP.source = {
    badge: "Preview",
    samples: SAMPLES,

    async allTime(playfabId) {
      const raw = await load(playfabId);
      const days = new Map();
      const modes = new Map();
      const maps = new Map();
      const buckets = new Map();
      const matchKeys = new Set();
      for (const [utc, version, mode, map, result, endReason, kills, deaths, , , points, , , , , teamPower, enemyPower, , , , , , eventKey] of raw.battles) {
        if (SP.battleKind(mode, endReason) !== "match") continue;
        matchKeys.add(eventKey);
        const key = utc.slice(0, 10);
        if (!days.has(key)) days.set(key, [key, 0, 0, 0, 0, 0, points ?? 0, points ?? 0, version]);
        const day = days.get(key);
        day[7] = Math.max(day[7], points ?? 0);
        day[8] = version;
        increment(day, result, kills, deaths);
        increment(groupRow(modes, mode), result, kills, deaths);
        increment(groupRow(maps, map), result, kills, deaths);
        const gap = SP.powerGap(teamPower, enemyPower);
        if (gap !== null) increment(groupRow(buckets, SP.POWER_BUCKETS.find(bucket => bucket.test(gap)).id), result, kills, deaths);
      }
      const weapons = new Map();
      for (const [eventKey, name, category, kills, seconds, damage] of raw.weapons) {
        if (!matchKeys.has(eventKey)) continue;
        if (!weapons.has(name)) weapons.set(name, [name, category, 0, 0, 0, 0]);
        const entry = weapons.get(name);
        entry[2] += kills ?? 0;
        entry[3] += 1;
        entry[4] += seconds ?? 0;
        if (SP.GUN_CATEGORIES.has(category) && damage > 0) entry[5] += damage;
      }
      return {
        player: raw.player,
        finalLeaguePoints: raw.finalLeaguePoints,
        career: { days: [...days.values()], modes: [...modes.values()], maps: [...maps.values()], buckets: [...buckets.values()] },
        weaponTotals: [...weapons.values()].sort((left, right) => right[2] - left[2] || right[3] - left[3]),
        resources: raw.resources,
        // The latest day row per currency, so the all-time earnings panel shows the current balance.
        balances: ["SoftCurrency", "HardCurrency"].map(item => raw.currencyDays.filter(row => row[1] === item).pop()).filter(Boolean).sort((left, right) => left[0].localeCompare(right[0])),
      };
    },

    // withMatches is false when the period has too many matches: the server then skips battles, weapons and failed searches.
    async period(playfabId, from, to, withMatches) {
      const raw = await load(playfabId);
      const inside = row => row[0].slice(0, 10) >= from && row[0].slice(0, 10) <= to;
      const battles = withMatches ? raw.battles.filter(inside) : [];
      const eventKeys = new Set(battles.map(row => row[22]));
      return {
        battles,
        battleAfter: withMatches ? raw.battles.find(row => row[0].slice(0, 10) > to) || null : null,
        weapons: raw.weapons.filter(row => eventKeys.has(row[0])),
        sessions: raw.sessions.filter(inside),
        currencyDays: raw.currencyDays.filter(inside),
        inventory: raw.inventory.filter(inside),
        searchFails: withMatches ? raw.searchFails.filter(inside) : [],
      };
    },
  };
})();
