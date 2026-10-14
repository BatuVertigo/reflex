(() => {
  "use strict";

  const SP = window.StatsPolygun;

  const cell = (row, text, className) => {
    const element = SP.htmlElement("td", className || "", row);
    element.textContent = text === null || text === undefined || text === "" ? "–" : String(text);
    if (element.textContent === "–") element.classList.add("muted-cell");
    return element;
  };

  const emptyRow = (body, columns, text) => {
    const only = SP.htmlElement("td", "muted-cell", SP.htmlElement("tr", "", body));
    only.colSpan = columns;
    only.textContent = text;
  };

  const clock = time => (time ? SP.clockLabel(time) : "–");
  const stamp = time => (time ? `${SP.dayLabel(time)}, ${time.slice(11, 19)}` : "–");
  const numberText = value => (value === null || value === undefined ? "–" : SP.formatNumber(value));
  const yesNo = value => (value === null || value === undefined ? "–" : value ? "Yes" : "No");
  const modeName = mode => (mode ? SP.MODE_NAMES[mode] || SP.words(mode) : "");
  // The game's own art, copied from PolygonArena (ui_game_mode_icon and ui_render_map_small). A mode or map with
  // no icon in the game, like the tutorial, simply shows no picture.
  const MODE_ICONS = {
    DeathMatch: "ffa", TeamDeathMatch: "tdm", TutorialTeamDeatchMatchAI: "tdm",
    ControlPoint: "control_point", Heist: "heist", Push: "push", TrialMap: "trial",
  };
  const MAP_ICONS = {
    bank_heist: "bank_heist", construction: "construction_site", farm_house: "farm_house",
    memphis: "memphis", parking_lot: "parking_lot", the_garden: "the_garden", item_trial: "trial",
  };
  const modeIcon = mode => (MODE_ICONS[mode] ? `icons/ui_icon_game_mode_${MODE_ICONS[mode]}.png` : "");
  const mapIcon = map => (MAP_ICONS[map] ? `icons/ui_render_map_${MAP_ICONS[map]}_small.png` : "");

  function showIcon(element, source, label) {
    element.hidden = !source;
    element.alt = source ? label : "";
    if (source) element.src = source;
  }
  // A query TE gave up on arrives as null, so the panel it fills says so instead of looking empty.
  const MISSING = "TE gave up on this one query. Everything else on this page is complete; search the ID again to retry it.";
  // A free-for-all logs the same team score for everyone, so there are no sides to group by.
  const freeForAll = match => (match.players[0] || {}).mode === "DeathMatch";

  // Players with the same result and the same score pair were on the same side. In a free-for-all every player has
  // their own result, so each one gets their own letter, which is what the scoreboard shows too.
  // A draw gives both sides the same result and score, so there the side is told apart by its team power pair instead
  // (each side logs its own average first; Critical Strike F-a06c8283-…, 2026-10-13: 3,601 v 4,720 and 4,720 v 3,601).
  function sideLetters(players) {
    const keys = [];
    const byResult = player => `${player.result}|${player.teamScore}|${player.enemyScore}`;
    const draw = players.length > 1 && players.every(player => byResult(player) === byResult(players[0]) && player.result === "Draw");
    const keyOf = draw ? player => `${player.teamPower}|${player.enemyPower}` : byResult;
    for (const player of players) if (!keys.includes(keyOf(player))) keys.push(keyOf(player));
    return new Map(players.map(player => [player.userId, String.fromCharCode(65 + keys.indexOf(keyOf(player)))]));
  }

  function who(match, userId) {
    const profile = match.profiles[userId];
    return profile && profile.name ? profile.name : "Unknown";
  }

  function playFabId(match, userId) {
    const profile = match.profiles[userId];
    return (profile && profile.playfabId) || "";
  }

  // A number with a bar under it, scaled to the biggest in this match, so two rows compare at a glance.
  // A value that is not zero keeps a sliver of bar, so "tiny" never reads as "none".
  function barCell(row, value, max) {
    const element = cell(row, numberText(value), "num");
    if (!max || value === null || value === undefined) return;
    const track = SP.htmlElement("span", "cell-bar", element);
    track.setAttribute("aria-hidden", "true");
    SP.htmlElement("span", "", track).style.width = `${value ? Math.max(2, (value / max) * 100) : 0}%`;
  }

  // The name, and under it the PlayFab ID as a button that opens that player's own report.
  function playerCell(row, match, userId, openPlayer) {
    const holder = SP.htmlElement("td", "match-player", row);
    SP.htmlElement("span", "", holder).textContent = who(match, userId);
    const id = playFabId(match, userId);
    if (!id) {
      SP.htmlElement("code", "muted-cell", holder).textContent = userId;
      return;
    }
    const button = SP.htmlElement("button", "id-button", holder);
    button.type = "button";
    button.textContent = id;
    button.title = `Open the report for ${id}`;
    button.addEventListener("click", () => openPlayer(id));
  }

  function mostKills(match) {
    const top = Math.max(0, ...match.players.map(player => Number(player.kills) || 0));
    const leaders = match.players.filter(player => (Number(player.kills) || 0) === top).map(player => who(match, player.userId));
    return ["Most kills", match.players.length ? numberText(top) : "–", leaders.join(", ")];
  }

  function renderHead(match) {
    const players = match.players;
    const first = players[0] || {};
    const versions = [...new Set(players.map(player => player.version).filter(Boolean))];
    const real = Math.max(players.length, ...players.map(player => player.playerCount || 0));
    const length = Math.max(0, ...players.map(player => player.duration || 0));
    const mode = first.mode ? modeName(first.mode) : "Unknown mode";
    const map = first.map ? SP.words(first.map) : "Unknown map";
    // The visible heading is two facts side by side; the h1 stays a sentence for screen readers and the tab order.
    SP.byId("match-title").textContent = first.mode ? `${mode} on ${map}` : "Match";
    SP.byId("match-mode").textContent = mode;
    SP.byId("match-map").textContent = map;
    showIcon(SP.byId("match-mode-icon"), modeIcon(first.mode), mode);
    showIcon(SP.byId("match-map-icon"), mapIcon(first.map), map);
    const meta = SP.byId("match-meta");
    meta.replaceChildren();
    SP.htmlElement("code", "", meta).textContent = match.matchId;
    const facts = [
      `${SP.dayLabelWithYear(match.firstSeen)}, ${clock(match.firstSeen)}–${clock(match.lastSeen)} UTC`,
      versions.length ? `Version ${versions.join(", ")}` : "",
      first.privateLobby ? "Private lobby" : "",
      first.privateMatch ? "Private match" : "",
      first.custom ? "Custom match" : "",
      first.squad ? `Squad of ${numberText(first.squadCount)}` : "",
      first.bots ? `Bot difficulty ${first.bots}` : "",
    ].filter(Boolean);
    for (const fact of facts) SP.htmlElement("span", "", meta).textContent = fact;

    const tiles = [
      ["Real players", String(players.length), players.length === real ? "all logged a match end" : `${numberText(real)} logged in the match`],
      // A free-for-all has no sides, and placement is never logged, so the one fair order is kills.
      freeForAll(match) ? mostKills(match)
        : ["Real per side", first.teamCount === null || first.teamCount === undefined ? "–"
          : `${numberText(first.teamCount)} v ${numberText(first.enemyCount)}`, "bots leave no events"],
      ["Score", freeForAll(match) || first.teamScore === null || first.teamScore === undefined ? "–"
        : `${numberText(first.teamScore)} – ${numberText(first.enemyScore)}`,
        freeForAll(match) ? "free-for-all, no team score" : "side A first"],
      ["Length", length ? SP.durationLabel(length) : "–", "longest player"],
      ["End reason", first.endReason || "–", first.result ? `${freeForAll(match) ? who(match, first.userId) : "side A"}: ${first.result}` : ""],
    ];
    const totals = SP.byId("match-totals");
    totals.replaceChildren();
    for (const [label, value, sub] of tiles) {
      const tile = SP.htmlElement("div", "stat", totals);
      SP.htmlElement("p", "stat-label", tile).textContent = label;
      SP.htmlElement("p", "stat-value", tile).textContent = value;
      SP.htmlElement("p", "stat-sub", tile).textContent = sub;
    }
  }

  const sumOf = values => values.reduce((total, value) => total + (Number(value) || 0), 0);
  const averageOf = values => (values.length ? sumOf(values) / values.length : 0);

  function sideGroups(match) {
    const letters = sideLetters(match.players);
    const groups = new Map();
    for (const player of match.players) {
      const letter = letters.get(player.userId);
      if (!groups.has(letter)) groups.set(letter, []);
      groups.get(letter).push(player);
    }
    return groups;
  }

  function sideHead(host, side, alignRight) {
    const holder = SP.htmlElement("div", "versus-side", host);
    const chip = SP.htmlElement("span", `chip chip-${side.outcome}`, holder);
    chip.textContent = SP.OUTCOME_LETTERS[side.outcome];
    chip.setAttribute("aria-hidden", "true");
    SP.htmlElement("b", "", holder).textContent = side.name;
    SP.htmlElement("span", "", holder).textContent = `${side.result || "Unknown"} · ${side.note || SP.plural(side.players.length, "player", "players")}`;
    if (alignRight) holder.style.textAlign = "right";
  }

  function versusRow(host, label, left, right) {
    const row = SP.htmlElement("div", "versus-row", host);
    SP.htmlElement("p", "versus-label", row).textContent = label;
    SP.htmlElement("p", "versus-value", row).textContent = numberText(left.value);
    const bar = SP.htmlElement("div", "versus-bar", row);
    const total = (left.value || 0) + (right.value || 0);
    // Nothing logged on either side splits the bar down the middle rather than leaving it empty and unexplained.
    const share = total ? (left.value || 0) / total : 0.5;
    SP.htmlElement("span", total ? left.outcome : "draw", bar).style.width = `${share * 100}%`;
    SP.htmlElement("span", total ? right.outcome : "draw", bar).style.width = `${(1 - share) * 100}%`;
    SP.htmlElement("p", "versus-value right", row).textContent = numberText(right.value);
    const gap = SP.htmlElement("p", "versus-gap", row);
    gap.textContent = !left.value || !right.value || left.value === right.value ? ""
      : `${left.value >= right.value ? left.letter : right.letter} ${(Math.max(left.value, right.value) / Math.min(left.value, right.value)).toFixed(1)}×`;
  }

  // The two sides as one card: every figure is a bar split between them, so "twice the power" is a shape rather
  // than arithmetic. A free-for-all gives every player their own result, so there are no two sides to compare.
  function renderSides(match) {
    const host = SP.byId("match-versus");
    host.replaceChildren();
    const lede = SP.byId("match-sides-lede");
    if (freeForAll(match)) {
      renderPlayersSideBySide(match, host, lede);
      return;
    }
    const groups = sideGroups(match);
    const oneSide = groups.size === 1;
    if (!oneSide && groups.size !== 2) {
      lede.textContent = "This match has no two sides to weigh against each other. The Players table below compares them one by one.";
      return;
    }
    const sides = [...groups.entries()].map(([letter, players]) => ({
      letter,
      name: `Side ${letter}`,
      players,
      result: players[0].result,
      outcome: SP.OUTCOMES[players[0].result] || "draw",
      teamPower: players[0].teamPower,
      score: players[0].teamScore,
      league: Math.round(averageOf(players.map(player => player.leaguePoints))),
      kills: sumOf(players.map(player => player.kills)),
    }));
    // The other side logged no match end (bots log nothing), so only what side A's own rows say about it is known:
    // its team power and its score. League points and kills stay unknown rather than zero.
    if (oneSide) {
      const first = sides[0].players[0];
      const realEnemies = Number(first.enemyCount) || 0;
      sides.push({
        letter: "B",
        name: "Side B",
        players: [],
        note: realEnemies ? `${SP.plural(realEnemies, "real player", "real players")}, no match end logged` : "bots only",
        result: { Victory: "Defeat", Defeat: "Victory" }[first.result] || first.result,
        outcome: { win: "loss", loss: "win" }[sides[0].outcome] || "draw",
        teamPower: first.enemyPower,
        score: first.enemyScore,
        league: null,
        kills: null,
      });
    }
    const [left, right] = sides;
    const head = SP.htmlElement("div", "versus-head", host);
    sideHead(head, left, false);
    sideHead(head, right, true);
    const rows = [
      ["Team power", "teamPower"],
      ["League points", "league"],
      ["Kills", "kills"],
      ["Score", "score"],
    ].filter(([, key]) => left[key] !== null && right[key] !== null);
    for (const [label, key] of rows) {
      versusRow(host, label, { value: left[key], outcome: left.outcome, letter: left.letter },
        { value: right[key], outcome: right.outcome, letter: right.letter });
    }
    // One sentence per side rather than one per figure, so "1.5x the power; 1.5x the league points" reads as
    // the single fact it is.
    const bySide = new Map();
    for (const [label, key] of rows) {
      const [low, high] = [left[key], right[key]].sort((first, second) => first - second);
      // A side with nothing logged (an all-bot team has no power) gets "all the", since a ratio to zero means nothing.
      if (!high || (low && high / low < 1.15)) continue;
      const name = left[key] > right[key] ? left.name : right.name;
      if (!bySide.has(name)) bySide.set(name, []);
      bySide.get(name).push(low ? `${(high / low).toFixed(1)}× the ${label.toLowerCase()}` : `all the ${label.toLowerCase()}`);
    }
    const gaps = [...bySide.entries()].map(([name, parts]) =>
      `${name} had ${parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0]}`);
    lede.textContent = "Every figure as one bar split between the two sides, coloured by how the match ended. "
      + (oneSide ? "Side B logged no match end, so its league points and kills are unknown. " : "")
      + (gaps.length ? `${gaps.join("; ")}.` : "The two sides were within 15% of each other on every figure.");
  }

  // A free-for-all has players, not sides: every figure is a small bar chart with one bar per player, sorted by
  // kills (the game logs no placement, and more than one player can get Victory).
  function renderPlayersSideBySide(match, host, lede) {
    const players = [...match.players].sort((first, second) =>
      (Number(second.kills) || 0) - (Number(first.kills) || 0) || (Number(first.deaths) || 0) - (Number(second.deaths) || 0));
    if (!players.length) {
      lede.textContent = "No player logged a match end, so there is nothing to compare.";
      return;
    }
    const kd = player => (player.deaths ? player.kills / player.deaths : player.kills);
    const figures = [
      ["Kills", player => player.kills, value => numberText(value)],
      ["K/D", kd, value => (value === null || value === undefined ? "–" : value.toFixed(2))],
      ["Power", player => player.inventoryElo, value => numberText(value)],
      ["League points", player => player.leaguePoints, value => numberText(value)],
    ];
    const grid = SP.htmlElement("div", "ffa-grid", host);
    for (const [label, read, format] of figures) {
      const figure = SP.htmlElement("div", "ffa-figure", grid);
      SP.htmlElement("p", "versus-label", figure).textContent = label;
      const max = Math.max(0, ...players.map(player => Number(read(player)) || 0));
      for (const player of players) {
        const value = read(player);
        const row = SP.htmlElement("div", "ffa-row", figure);
        SP.htmlElement("span", "ffa-name", row).textContent = who(match, player.userId);
        const bar = SP.htmlElement("div", "versus-bar", row);
        const fill = SP.htmlElement("span", SP.OUTCOMES[player.result] || "draw", bar);
        fill.style.width = `${max && value ? Math.max(2, (value / max) * 100) : 0}%`;
        SP.htmlElement("span", "versus-value", row).textContent = format(value);
      }
    }
    const strongest = players.reduce((best, player) => ((player.inventoryElo || 0) > (best.inventoryElo || 0) ? player : best));
    const winners = players.filter(player => player.result === "Victory").length;
    lede.textContent = "Every player, sorted by kills. Each bar is that player's share of the biggest value in this match; "
      + `blue won, red lost. ${who(match, strongest.userId)} had the most power and finished `
      + `${ordinal(players.indexOf(strongest) + 1)} in kills. ${SP.plural(winners, "player", "players")} got Victory.`;
  }

  // shortcut: right up to 10th, which covers every free-for-all lobby; 11th–13th would need the teen rule.
  const ordinal = rank => `${rank}${{ 1: "st", 2: "nd", 3: "rd" }[rank] || "th"}`;

  function renderPlayers(match, openPlayer) {
    const body = SP.byId("match-player-rows");
    body.replaceChildren();
    const sides = sideLetters(match.players);
    const left = new Set((match.leaves || []).map(leave => leave.leftUserId).filter(Boolean));
    const troubled = new Set((match.timeline || []).filter(row => row.event === "error" || row.event === "ta_app_crash").map(row => row.userId));
    SP.byId("match-players-lede").textContent =
      "Every real player who logged a match end. TE holds no events for bots, so they are only a count above. "
      + "The bars under Power and League points are each value's share of the biggest in this match.";
    if (!match.players.length) {
      emptyRow(body, 15, "No player logged a match end for this ID. The matchmaking and trouble panels may still have rows.");
      return;
    }
    const biggest = key => Math.max(0, ...match.players.map(player => Number(player[key]) || 0));
    const powerMax = biggest("inventoryElo");
    const leagueMax = biggest("leaguePoints");
    for (const player of match.players) {
      const row = SP.htmlElement("tr", "", body);
      cell(row, freeForAll(match) ? "" : sides.get(player.userId));
      playerCell(row, match, player.userId, openPlayer);
      const result = SP.htmlElement("td", "", row);
      const outcome = SP.OUTCOMES[player.result] || "draw";
      const chip = SP.htmlElement("span", `chip chip-${outcome}`, result);
      chip.textContent = SP.OUTCOME_LETTERS[outcome];
      chip.setAttribute("aria-hidden", "true");
      result.append(player.result || "Unknown");
      cell(row, player.kills, "num");
      cell(row, player.deaths, "num");
      cell(row, player.deaths === 0 ? `${player.kills}*` : (player.kills / player.deaths).toFixed(2), "num");
      cell(row, player.character ? `${SP.itemName(player.character)} · ${numberText(player.characterLevel)}` : "");
      barCell(row, player.inventoryElo, powerMax);
      barCell(row, player.leaguePoints, leagueMax);
      cell(row, player.version);
      cell(row, player.device);
      cell(row, player.os ? `${player.os} ${player.osVersion || ""}`.trim() : "");
      cell(row, player.country);
      cell(row, player.network);
      const notes = [left.has(String(player.userId)) ? "left" : "", troubled.has(String(player.userId)) ? "errors" : ""].filter(Boolean);
      cell(row, notes.join(", "));
    }
  }

  function renderLoadout(match) {
    const host = SP.byId("match-loadout");
    host.replaceChildren();
    if (match.weapons === null && match.gear === null) {
      SP.htmlElement("p", "footnote", host).textContent = MISSING;
      return;
    }
    const weaponList = match.weapons || [];
    const gearList = match.gear || [];
    const order = match.players.length ? match.players.map(player => player.userId)
      : [...new Set([...weaponList, ...gearList].map(item => item.userId))];
    if (!order.length) {
      SP.htmlElement("p", "footnote", host).textContent = "No loadout logged for this match.";
      return;
    }
    if (match.weapons === null || match.gear === null) {
      SP.htmlElement("p", "footnote", host).textContent =
        `${match.weapons === null ? "Weapons" : "Armor and gadgets"} are missing: ${MISSING}`;
    }
    for (const userId of order) {
      const gear = gearList.filter(item => item.userId === userId);
      // The game logs an ability or grenade that can kill in both lists: kills, time and damage as a weapon, used
      // and filled as a gadget. Each such pair becomes one gadget row.
      const gadgetNames = new Set(gear.filter(item => item.kind === "Gadget").map(item => item.name));
      const asWeapon = new Map(weaponList.filter(item => item.userId === userId && gadgetNames.has(item.name)).map(item => [item.name, item]));
      const weapons = weaponList.filter(item => item.userId === userId && !asWeapon.has(item.name));
      const boosters = ((match.starts || []).find(row => row.userId === userId) || { boosters: [] }).boosters;
      SP.htmlElement("h3", "", host).textContent = `${who(match, userId)} · ${playFabId(match, userId) || userId}`;
      const scroll = SP.htmlElement("div", "table-scroll", host);
      const table = SP.htmlElement("table", "", scroll);
      const head = SP.htmlElement("tr", "", SP.htmlElement("thead", "", table));
      for (const [title, className] of [["Item", ""], ["Kind", ""], ["Category", ""], ["Level", "num"], ["Power", "num"],
        ["Kills", "num"], ["Time", "num"], ["Damage", "num"], ["Used", "num"], ["Boost", ""]]) {
        const header = SP.htmlElement("th", className, head);
        header.scope = "col";
        header.textContent = title;
      }
      const body = SP.htmlElement("tbody", "", table);
      if (!weapons.length && !gear.length && !boosters.length) emptyRow(body, 10, "Nothing logged for this player.");
      for (const weapon of weapons) {
        const row = SP.htmlElement("tr", "", body);
        cell(row, SP.itemName(weapon.name));
        cell(row, "Weapon");
        cell(row, SP.categoryName(weapon.category));
        cell(row, numberText(weapon.level), "num");
        cell(row, numberText(weapon.power), "num");
        cell(row, numberText(weapon.kills), "num");
        cell(row, weapon.seconds ? `${numberText(weapon.seconds)} s` : "–", "num");
        cell(row, numberText(weapon.damage), "num");
        cell(row, "", "num");
        cell(row, weapon.boost === "no_boost" ? "" : SP.words(weapon.boost || ""));
      }
      for (const item of gear) {
        const row = SP.htmlElement("tr", "", body);
        const weapon = item.kind === "Gadget" ? asWeapon.get(item.name) : null;
        cell(row, SP.itemName(item.name));
        cell(row, item.kind);
        cell(row, SP.categoryName(item.category));
        cell(row, numberText(item.level), "num");
        cell(row, numberText(item.power), "num");
        cell(row, weapon ? numberText(weapon.kills) : "", "num");
        cell(row, weapon && weapon.seconds ? `${numberText(weapon.seconds)} s` : "", "num");
        cell(row, weapon ? numberText(weapon.damage) : "", "num");
        cell(row, item.used === null ? "" : `${numberText(item.used)} · filled ${numberText(item.filled)}`, "num");
        cell(row, item.boost === "no_boost" ? "" : SP.words(item.boost || ""));
      }
      for (const [name, amount] of boosters) {
        const row = SP.htmlElement("tr", "", body);
        cell(row, `${SP.itemName(name)}${amount ? ` ×${numberText(amount)}` : ""}`);
        cell(row, "Booster");
        for (let column = 0; column < 8; column += 1) cell(row, "", column < 7 ? "num" : "");
      }
    }
  }

  const EVENT_NAMES = {
    battle_search: "Search", battle_start: "Match start", battle_end: "Match end", error: "Error", player_left: "Left",
    match_reconnect: "Match reconnect", match_reconnect_pawn: "Pawn reconnect", reconnect_start: "Reconnect started",
    reconnect_attempt: "Reconnect attempt", reconnect_failed: "Reconnect failed", reconnect_success: "Reconnected",
    ta_app_crash: "Crash", ta_app_bg_start: "App to background", ta_app_end: "App closed",
  };
  const TROUBLE_EVENTS = new Set(["error", "ta_app_crash", "reconnect_failed", "player_left"]);
  const MATCH_EVENTS = new Set(["battle_search", "battle_start", "battle_end"]);
  const toMillis = time => Date.parse(`${time.replace(" ", "T")}Z`);
  const versus = (left, right) => `${numberText(left)} v ${numberText(right)}`;

  // Every row the matchmaking and trouble tables used to show, as one dot each with its own detail lines.
  function timelineEvents(match) {
    const events = [];
    const add = (time, event, userId, lines, extra) => {
      if (time) events.push({ time, millis: toMillis(time), event, userId, lines: lines.filter(Boolean), ...extra });
    };
    for (const search of match.searches || []) {
      add(search.time, "battle_search", search.userId, [
        search.action ? `Action: ${search.action}` : "",
        search.seconds === null ? "" : `Searched ${numberText(search.seconds)} s`,
        search.failReason ? `Fail reason: ${search.failReason}` : "",
        search.mode ? `Mode: ${modeName(search.mode)}` : "",
        `Slots (team v enemy): ${versus(search.teamCount, search.enemyCount)}`,
        `Power (team v enemy): ${versus(search.teamPower, search.enemyPower)}`,
        search.squad ? `Squad of ${numberText(search.squadCount)}` : "",
        search.matchmakingId ? `Matchmaking ID: ${search.matchmakingId}` : "",
      ]);
    }
    for (const start of match.starts || []) {
      add(start.time, "battle_start", start.userId, [
        `Slots (team v enemy): ${versus(start.teamCount, start.enemyCount)}`,
        `Power (team v enemy): ${versus(start.teamPower, start.enemyPower)}`,
        `Inventory elo: ${numberText(start.inventoryElo)}`,
        `League points: ${numberText(start.leaguePoints)}`,
        start.version ? `Version ${start.version}` : "",
      ]);
    }
    for (const player of match.players) {
      add(player.time, "battle_end", player.userId, [
        `${player.result || "Unknown"} · K ${numberText(player.kills)} · D ${numberText(player.deaths)}`,
        player.endReason ? `End reason: ${player.endReason}` : "",
      ]);
    }
    for (const row of match.timeline || []) {
      // match_reconnect logs the ID without its F- prefix, so only a truly different ID is another match.
      const elsewhere = Boolean(row.matchId) && row.matchId !== match.matchId && !match.matchId.endsWith(row.matchId);
      add(row.time, row.event, row.userId, [
        [row.errorType, row.reason, row.action, row.phase].filter(Boolean).join(" · "),
        [row.function, row.gameState].filter(Boolean).join(" · "),
        row.ping === null || row.ping === undefined ? "" : `Ping ${numberText(row.ping)} ms${row.pingMax ? ` (max ${numberText(row.pingMax)})` : ""}`,
        row.region ? `Region: ${row.region}` : "",
        row.exitSeconds === null || row.exitSeconds === undefined ? "" : `Left at ${numberText(row.exitSeconds)} s`,
        row.reconnectStarted ? "Reconnect started" : "",
        row.event === "ta_app_end" && row.seconds ? `Session ${SP.durationLabel(row.seconds)}` : "",
        row.leftUserId ? `Left user ${row.leftUserId}` : "",
        elsewhere ? `Other match ${row.matchId}` : "",
      ], { phase: row.phase, elsewhere });
    }
    return events.filter(event => !Number.isNaN(event.millis)).sort((first, second) => first.millis - second.millis);
  }

  function renderTimeline(match) {
    const host = SP.byId("match-timeline-chart");
    host.replaceChildren();
    SP.byId("match-timeline-lede").textContent =
      "Every event from the players in this match, from the search to five minutes after the end. Errors, reconnects, "
      + "crashes and app backgrounds carry no match ID, so they are read by player and time; a dot outside the shaded "
      + "match can belong to what happened just before or after. Point at a dot for its details.";
    const missing = [["searches", "searches"], ["starts", "match starts"], ["timeline", "errors and reconnects"]]
      .filter(([key]) => match[key] === null).map(([, label]) => label);
    if (missing.length) SP.htmlElement("p", "footnote", host).textContent = `Missing ${missing.join(", ")}: ${MISSING}`;
    const events = timelineEvents(match);
    if (!events.length) {
      SP.htmlElement("p", "footnote", host).textContent = "Nothing was logged around this match.";
      return;
    }
    const from = events[0].millis;
    const span = Math.max(1, events[events.length - 1].millis - from);
    const percent = millis => ((millis - from) / span) * 100;
    const track = SP.htmlElement("div", "tl-track", host);
    const matchStart = toMillis(match.firstSeen);
    const matchEnd = toMillis(match.lastSeen);
    if (!Number.isNaN(matchStart) && !Number.isNaN(matchEnd)) {
      const band = SP.htmlElement("div", "tl-band", track);
      band.style.left = `${percent(Math.max(from, matchStart))}%`;
      band.style.width = `${Math.max(0.5, percent(Math.min(from + span, matchEnd)) - percent(Math.max(from, matchStart)))}%`;
    }
    // Dots closer than one dot width go to the next row down, so none hides another. Measured once at render:
    // shortcut: a window resize can leave dots touching, a re-search fixes it; recompute on resize if that bites.
    const gap = (18 / Math.max(300, host.clientWidth || 800)) * 100;
    const rowEnds = [];
    for (const event of events) {
      const left = percent(event.millis);
      let row = rowEnds.findIndex(end => left - end >= gap);
      if (row === -1) row = rowEnds.push(left) - 1;
      else rowEnds[row] = left;
      const kind = MATCH_EVENTS.has(event.event) ? "tl-match" : TROUBLE_EVENTS.has(event.event) ? "tl-trouble" : "tl-other";
      const dot = SP.htmlElement("button", `tl-dot ${kind}${event.elsewhere ? " tl-elsewhere" : ""}`, track);
      dot.type = "button";
      dot.style.left = `${left}%`;
      dot.style.top = `${row * 20}px`;
      // A reconnect logs a started and a finished row, so the phase belongs in the name.
      const phase = event.event.startsWith("match_reconnect") && event.phase ? ` ${event.phase}` : "";
      const lines = [`${EVENT_NAMES[event.event] || event.event}${phase} · ${who(match, event.userId)}`,
        `${stamp(event.time)} UTC`, ...event.lines];
      dot.dataset.tip = lines.join("\n");
      dot.setAttribute("aria-label", lines.join(". "));
    }
    track.style.height = `${rowEnds.length * 20}px`;
    const axis = SP.htmlElement("div", "tl-axis", host);
    axis.setAttribute("aria-hidden", "true");
    for (const share of [0, 0.25, 0.5, 0.75, 1]) {
      const label = SP.htmlElement("span", "", axis);
      label.style.left = `${share * 100}%`;
      label.textContent = new Date(from + share * span).toISOString().slice(11, 19);
    }
    // Hover, tap or keyboard focus previews a dot. A click pins its details open so the text can be selected and
    // copied; a click elsewhere, Escape, or the same dot again closes it.
    unpinDot();
    let pinned = null;
    const show = dot => {
      const box = dot.getBoundingClientRect();
      SP.showLines(dot.dataset.tip.split("\n"), box.right, box.top + box.height / 2);
    };
    const hide = () => { if (!pinned) SP.tooltip.hidden = true; };
    track.addEventListener("pointerover", event => {
      const dot = event.target.closest(".tl-dot");
      if (dot && !pinned) show(dot);
    });
    track.addEventListener("pointerleave", hide);
    track.addEventListener("focusin", event => { if (event.target.dataset.tip && !pinned) show(event.target); });
    track.addEventListener("focusout", hide);
    track.addEventListener("click", event => {
      const dot = event.target.closest(".tl-dot");
      if (!dot) return;
      pinned = pinned === dot ? null : dot;
      SP.tooltip.classList.toggle("tip-pinned", Boolean(pinned));
      if (pinned) show(dot);
      else SP.tooltip.hidden = true;
    });
    unpinDot = () => {
      if (!pinned) return;
      pinned = null;
      SP.tooltip.classList.remove("tip-pinned");
      SP.tooltip.hidden = true;
    };
  }

  // Replaced by each timeline render; the two listeners below are added once for the whole page.
  let unpinDot = () => {};
  document.addEventListener("click", event => { if (!event.target.closest(".tl-dot, .tooltip")) unpinDot(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape") unpinDot(); });

  function renderRelated(match, openMatch) {
    const body = SP.byId("match-related-rows");
    body.replaceChildren();
    SP.byId("match-related-lede").textContent =
      "Other matches that share this ID as a prefix — the derived ID the server hands out when it reuses a room — "
      + "and matches the same players played within fifteen minutes.";
    if (match.related === null) {
      emptyRow(body, 7, MISSING);
      return;
    }
    // Item trials run against bots and are not real matches, so they are left out.
    const related = match.related.filter(other => other.mode !== "TrialMap");
    if (!related.length) {
      emptyRow(body, 7, "No derived ID and no other match from these players in that quarter hour.");
      return;
    }
    for (const other of related) {
      const row = SP.htmlElement("tr", "", body);
      const idCell = SP.htmlElement("td", "", row);
      const button = SP.htmlElement("button", "id-button", idCell);
      button.type = "button";
      button.textContent = other.matchId;
      button.title = "Open this match";
      button.addEventListener("click", () => openMatch(other.matchId));
      cell(row, other.matchId.startsWith(match.matchId) ? "Derived ID" : "Same players, nearby");
      cell(row, stamp(other.firstSeen));
      cell(row, clock(other.lastSeen));
      cell(row, modeName(other.mode));
      cell(row, other.map ? SP.words(other.map) : "");
      cell(row, numberText(other.players), "num");
    }
  }

  SP.renderMatch = (match, openPlayer, openMatch) => {
    renderHead(match);
    renderSides(match);
    renderPlayers(match, openPlayer);
    renderLoadout(match);
    renderTimeline(match);
    renderRelated(match, openMatch);
  };
})();
