(() => {
  "use strict";

  const SP = (window.StatsPolygun = window.StatsPolygun || {});

  SP.MODE_NAMES = { TeamDeathMatch: "Team Deathmatch", DeathMatch: "Deathmatch", ControlPoint: "Control Point", Heist: "Heist", Push: "Push" };
  SP.OUTCOMES = { Victory: "win", Defeat: "loss", Draw: "draw" };
  SP.OUTCOME_WORDS = { win: "Win", loss: "Loss", draw: "Draw" };
  SP.OUTCOME_LETTERS = { win: "W", loss: "L", draw: "D" };
  const OUTCOME_COUNT_WORDS = { win: ["win", "wins"], loss: ["loss", "losses"], draw: ["draw", "draws"] };
  // A match counts only when it ended normally; everything else is a mark on the charts.
  SP.MATCH_END_REASONS = new Set(["Success-objective", "Success-timeout"]);
  // League floors seen in data: league_index 0..7.
  SP.LEAGUE_FLOORS = [0, 100, 300, 500, 1000, 1500, 2000, 3000];
  SP.GUN_CATEGORIES = new Set(["Primary", "Backup", "Ranged", "Support", "Melee"]);
  const CATEGORY_NAMES = {
    ActiveAbilityCharacterSlot: "Ability", ActiveAbilityArmorSlot: "Armor ability", PassiveAbilityCharacterSlot: "Passive ability",
    ConsumableGrenadeSlot: "Grenade", ConsumableTacticalGrenadeSlot: "Tactical grenade", ConsumableMedkitSlot: "Medkit",
  };
  SP.categoryName = category => CATEGORY_NAMES[category] || SP.words(category || "Other");
  // A period with more matches than this skips the per-match queries; one mark per match would be thinner than a pixel.
  SP.PERIOD_MATCH_LIMIT = 300;
  SP.POWER_BUCKETS = [
    { id: "much_weaker", label: "Much weaker", range: "below −20%", test: gap => gap < -20 },
    { id: "weaker", label: "Weaker", range: "−20% to −5%", test: gap => gap >= -20 && gap < -5 },
    { id: "even", label: "Even", range: "−5% to +5%", test: gap => gap >= -5 && gap <= 5 },
    { id: "stronger", label: "Stronger", range: "+5% to +20%", test: gap => gap > 5 && gap <= 20 },
    { id: "much_stronger", label: "Much stronger", range: "above +20%", test: gap => gap > 20 },
  ];
  SP.TICK_STEP = 10;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const TYPE_PREFIXES = new Set(["support", "special", "ranged", "primary", "backup", "melee", "character", "mask"]);
  const NAME_OVERRIDES = { character_theugly: "The Ugly", character_admiraledward: "Admiral Edward", character_captainmira: "Captain Mira", character_drgrimm: "Dr Grimm", character_uncle_jo: "Uncle Jo" };
  const SVG_NS = "http://www.w3.org/2000/svg";

  SP.formatNumber = value => Number(value).toLocaleString("en-US");
  SP.formatSigned = value => (value > 0 ? "+" : value < 0 ? "−" : "±") + SP.formatNumber(Math.abs(value));
  SP.clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  SP.dayLabel = time => `${MONTHS[Number(time.slice(5, 7)) - 1]} ${Number(time.slice(8, 10))}`;
  SP.dayLabelWithYear = time => `${SP.dayLabel(time)}, ${time.slice(0, 4)}`;
  SP.clockLabel = time => time.slice(11, 16);
  SP.dayIndex = key => Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10))) / 86400000;
  SP.dayKey = index => new Date(index * 86400000).toISOString().slice(0, 10);
  SP.periodLabel = (from, to) => (from === to ? SP.dayLabelWithYear(from)
    : from.slice(0, 4) === to.slice(0, 4) ? `${SP.dayLabel(from)} – ${SP.dayLabelWithYear(to)}`
    : `${SP.dayLabelWithYear(from)} – ${SP.dayLabelWithYear(to)}`);
  SP.plural = (count, one, many) => `${SP.formatNumber(count)} ${count === 1 ? one : many}`;
  SP.countWords = (count, outcome) => `${SP.formatNumber(count)} ${OUTCOME_COUNT_WORDS[outcome][count === 1 ? 0 : 1]}`;
  SP.words = text => {
    const spaced = String(text).replace(/_/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().trim();
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  };
  SP.durationLabel = seconds => (seconds < 60 ? `${seconds} s` : `${SP.formatNumber(Math.round(seconds / 60))} min`);
  SP.median = values => {
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  SP.itemName = id => {
    if (!id) return "Unknown";
    if (NAME_OVERRIDES[id]) return NAME_OVERRIDES[id];
    let text = String(id).replace(/^Consumable /, "").replace(/^Booster /, "");
    if (/^Active Ability /i.test(text)) return `${text.replace(/^Active Ability /i, "")} (ability)`;
    let parts = text.split("_");
    if (parts[0] === "armor" && parts.length > 2) parts = parts.slice(2);
    else if (TYPE_PREFIXES.has(parts[0]) && parts.length > 1) parts = parts.slice(1);
    return parts.map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
  };

  SP.htmlElement = (tag, className, parent) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (parent) parent.appendChild(element);
    return element;
  };
  SP.svgElement = (tag, attributes, parent) => {
    const element = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
    if (parent) parent.appendChild(element);
    return element;
  };
  SP.byId = id => document.getElementById(id);

  SP.countOutcomes = list => list.reduce((sum, match) => {
    sum[match.outcome] += 1;
    sum.kills += match.kills;
    sum.deaths += match.deaths;
    return sum;
  }, { win: 0, loss: 0, draw: 0, kills: 0, deaths: 0 });

  SP.roundedTopBar = (left, top, barWidth, bottom, radius) =>
    `M${left},${bottom} V${top + radius} Q${left},${top} ${left + radius},${top} H${left + barWidth - radius} Q${left + barWidth},${top} ${left + barWidth},${top + radius} V${bottom} Z`;
  SP.roundedBottomBar = (left, top, barWidth, bottom, radius) =>
    `M${left},${top} V${bottom - radius} Q${left},${bottom} ${left + radius},${bottom} H${left + barWidth - radius} Q${left + barWidth},${bottom} ${left + barWidth},${bottom - radius} V${top} Z`;

  // --- tooltip, shared match cursor, keyboard ---

  SP.tooltip = SP.byId("tooltip");
  SP.announcer = SP.byId("announcer");
  SP.views = {};
  SP.activeNumber = null;

  SP.resetViews = () => {
    SP.views = {};
    SP.activeNumber = null;
    SP.tooltip.hidden = true;
  };

  SP.setActive = position => {
    if (position === SP.activeNumber) return;
    SP.activeNumber = position;
    for (const view of Object.values(SP.views)) view.highlight(position);
  };

  SP.clearActive = () => {
    SP.setActive(null);
    SP.tooltip.hidden = true;
  };

  SP.placeTooltip = (clientX, clientY) => {
    const tooltip = SP.tooltip;
    tooltip.hidden = false;
    const box = tooltip.getBoundingClientRect();
    let left = clientX + 14;
    let top = clientY + 14;
    if (left + box.width > window.innerWidth - 8) left = clientX - box.width - 14;
    if (top + box.height > window.innerHeight - 8) top = clientY - box.height - 14;
    tooltip.style.left = `${Math.max(8, left)}px`;
    tooltip.style.top = `${Math.max(8, top)}px`;
  };

  SP.tooltipLine = (className, text) => {
    SP.htmlElement("div", className, SP.tooltip).textContent = text;
  };

  SP.showLines = (lines, clientX, clientY) => {
    SP.tooltip.replaceChildren();
    lines.forEach((line, index) => SP.tooltipLine(index === 0 ? "tip-head" : "tip-data", line));
    SP.placeTooltip(clientX, clientY);
  };

  SP.bindTips = (container, selector) => {
    container.addEventListener("pointerover", event => {
      const target = event.target.closest(selector);
      if (!target || !target.dataset.tip) return;
      const box = target.getBoundingClientRect();
      SP.showLines(target.dataset.tip.split("\n"), box.right, box.top + box.height / 2);
    });
    container.addEventListener("pointerleave", () => { SP.tooltip.hidden = true; });
  };

  SP.kdText = match => (match.deaths === 0 ? `${match.kills} (no deaths)` : match.kd.toFixed(2));

  SP.showMatchTooltip = (match, clientX, clientY, extraLines = []) => {
    SP.tooltip.replaceChildren();
    const head = SP.htmlElement("div", "tip-head", SP.tooltip);
    SP.htmlElement("span", `tip-key tip-key-${match.outcome}`, head);
    SP.htmlElement("span", "", head).textContent = match.scoreText === "–" ? SP.OUTCOME_WORDS[match.outcome] : `${SP.OUTCOME_WORDS[match.outcome]} ${match.scoreText}`;
    SP.tooltipLine("tip-data", `K ${match.kills} · D ${match.deaths} · KD ${SP.kdText(match)}`);
    SP.tooltipLine("tip-data", `LP ${SP.formatNumber(match.lpStart)} → ${SP.formatNumber(match.lpEnd)} (${SP.formatSigned(match.lpEnd - match.lpStart)})`);
    for (const line of extraLines) SP.tooltipLine("tip-data", line);
    SP.tooltipLine("tip-muted", `#${match.number} · ${SP.dayLabel(match.utc)}, ${SP.clockLabel(match.utc)} UTC · ${match.modeName} · ${SP.words(match.map)} · v${match.version}`);
    SP.placeTooltip(clientX, clientY);
  };

  SP.showMarkTooltip = (mark, clientX, clientY) => {
    SP.tooltip.replaceChildren();
    const head = SP.htmlElement("div", "tip-head", SP.tooltip);
    SP.htmlElement("span", "tip-key tip-key-mark", head);
    SP.htmlElement("span", "", head).textContent = mark.kind === "earlyExit" ? "Left early" : mark.kind === "disconnect" ? "Disconnect" : SP.words(mark.endReason || "Not counted");
    SP.tooltipLine("tip-data", mark.penalty === 0 ? "No league point change" : `LP ${SP.formatNumber(mark.lpStart)} → ${SP.formatNumber(mark.lpEnd)} (${SP.formatSigned(mark.penalty)})`);
    SP.tooltipLine("tip-muted", `${SP.dayLabel(mark.utc)}, ${SP.clockLabel(mark.utc)} UTC · ${mark.modeName} · after ${mark.seconds} s · v${mark.version}`);
    SP.placeTooltip(clientX, clientY);
  };

  SP.describeMatch = match =>
    `Match ${match.number}, ${SP.dayLabel(match.utc)} ${SP.clockLabel(match.utc)} UTC, ${match.modeName} on ${SP.words(match.map)}: ${SP.OUTCOME_WORDS[match.outcome]}, `
    + `${match.kills} kills, ${match.deaths} deaths, league points ${match.lpStart} to ${match.lpEnd}.`;

  SP.attachKeyboard = (element, viewName) => {
    element.addEventListener("keydown", event => {
      const count = SP.report.shown.length;
      if (!count) return;
      let next;
      if (event.key === "ArrowRight") next = (SP.activeNumber ?? 0) + 1;
      else if (event.key === "ArrowLeft") next = (SP.activeNumber ?? 2) - 1;
      else if (event.key === "Home") next = 1;
      else if (event.key === "End") next = count;
      else if (event.key === "Escape") { SP.clearActive(); return; }
      else return;
      event.preventDefault();
      next = SP.clamp(next, 1, count);
      SP.setActive(next);
      const view = SP.views[viewName];
      const match = SP.report.shown[next - 1];
      if (view && view.anchor) {
        const anchor = view.anchor(next);
        SP.showMatchTooltip(match, anchor.x, anchor.y, view.extraLines ? view.extraLines(match) : []);
      }
      SP.announcer.textContent = SP.describeMatch(match);
    });
    element.addEventListener("blur", SP.clearActive);
  };

  SP.positionAtPointer = (svg, event, marginLeft, band) => {
    const box = svg.getBoundingClientRect();
    return SP.clamp(Math.floor((event.clientX - box.left - marginLeft) / band) + 1, 1, SP.report.shown.length);
  };

  SP.drawMatchTicks = (svg, xCenter, baselineY, marginLeft) => {
    const shown = SP.report.shown;
    const count = shown.length;
    const every = count > 60 ? 20 : count > 25 ? 10 : count > 12 ? 5 : 1;
    const positions = new Set([1, count]);
    for (let position = every; position < count; position += every) positions.add(position);
    for (const position of positions) {
      if (position !== count && count - position < every / 2 && position !== 1) continue;
      const text = String(shown[position - 1].number);
      // A 4-digit first number would run into the "Match" title, so it moves right just enough to clear it.
      SP.svgElement("text", { x: Math.max(xCenter(position), marginLeft - 4 + text.length * 3.3), y: baselineY + 18, "text-anchor": "middle" }, svg).textContent = text;
    }
    SP.svgElement("text", { x: marginLeft - 10, y: baselineY + 18, "text-anchor": "end" }, svg).textContent = "Match";
  };

  // Labels on cut bars share one row; a label that would overlap the previous one is skipped and left to the tooltip.
  SP.labelRow = () => {
    let rowEnd = -Infinity;
    return (left, right) => {
      if (left < rowEnd + 4) return false;
      rowEnd = right;
      return true;
    };
  };

  SP.drawVersionMarkers = (svg, xBoundary, top, bottom, labelY) => {
    SP.drawVersionRules(svg, SP.report.versionMarkers.map(marker => ({ x: xBoundary(marker.position - 1), version: marker.version })), top, bottom, labelY);
  };

  // Labels are drawn after every rule, so their surface-colored outline hides the rules that cross them.
  SP.drawVersionRules = (svg, rules, top, bottom, labelY) => {
    const labels = [];
    const svgWidth = Number(svg.getAttribute("width"));
    let lastLabelEnd = -Infinity;
    for (const rule of rules) {
      SP.svgElement("line", { x1: rule.x, x2: rule.x, y1: top, y2: bottom, class: "version-rule" }, svg);
      const text = `v${rule.version}`;
      const textWidth = text.length * 6.4;
      // A rule near the right edge gets its label on the left side, so the label is not cut off.
      const start = rule.x + 3 + textWidth > svgWidth ? rule.x - 3 - textWidth : rule.x + 3;
      if (start < lastLabelEnd + 6) continue;
      labels.push({ x: start, text });
      lastLabelEnd = start + textWidth;
    }
    for (const label of labels) SP.svgElement("text", { x: label.x, y: labelY, class: "version-label" }, svg).textContent = label.text;
  };

  // --- translator: raw TE rows to one shape for every game version ---

  SP.battleKind = (mode, endReason) => (mode === "TutorialMap" ? "walkthrough"
    : String(mode).startsWith("Tutorial") ? "tutorial"
    : mode === "TrialMap" ? "trialMap"
    : endReason === "Disconnect" ? "disconnect"
    : endReason === "EarlyExit" ? "earlyExit"
    : SP.MATCH_END_REASONS.has(endReason) ? "match"
    : "other");

  SP.powerGap = (teamPower, enemyPower) => (teamPower > 0 && enemyPower > 0 ? ((teamPower - enemyPower) / enemyPower) * 100 : null);

  // All-time rows: the career query (one row per day, mode, map and power bucket) and the weapon totals.
  SP.buildCareer = allTime => {
    const player = allTime.player;
    const days = allTime.career.days.map(([key, count, wins, losses, kills, deaths, firstPoints, highestPoints, version], index, all) => ({
      key, count, wins, losses, draws: count - wins - losses, kills, deaths, firstPoints, highestPoints, version,
      // Points are logged before each match, so a day ends on the next match day's first value.
      endPoints: index + 1 < all.length ? all[index + 1][6] : (allTime.finalLeaguePoints ?? highestPoints),
    }));
    const groups = rows => rows.map(([id, count, wins, losses, kills, deaths]) => ({ id, total: count, counts: { win: wins, loss: losses, draw: count - wins - losses, kills, deaths } }));
    const totals = { win: 0, loss: 0, draw: 0, kills: 0, deaths: 0 };
    for (const day of days) {
      totals.win += day.wins;
      totals.loss += day.losses;
      totals.draw += day.draws;
      totals.kills += day.kills;
      totals.deaths += day.deaths;
    }
    const seenFirst = (player.firstSeen || "").slice(0, 10);
    const seenLast = (player.lastSeen || "").slice(0, 10);
    const lastMatchDay = days.length ? days[days.length - 1].key : seenLast;
    const firstDay = [seenFirst, days.length ? days[0].key : ""].filter(Boolean).sort()[0] || "";
    const lastDay = [seenLast, lastMatchDay].filter(Boolean).sort().pop() || "";
    return {
      days, totals, firstDay, lastDay, lastMatchDay,
      matchCount: totals.win + totals.loss + totals.draw,
      modes: groups(allTime.career.modes),
      maps: groups(allTime.career.maps),
      buckets: groups(allTime.career.buckets),
      weaponTotals: allTime.weaponTotals.map(([name, category, kills, used, seconds, damage]) => ({ name, category, kills, used, seconds, damage })),
    };
  };

  // Period rows: everything inside the picked UTC days, plus the first battle_end row after them.
  SP.buildReport = (allTime, career, periodRows, period) => {
    let rows = periodRows.battles;
    let firstNumber = 1 + career.days.reduce((sum, day) => (day.key < period.from ? sum + day.count : sum), 0);
    if (period.lastMatches) {
      // A "last N matches" period loads whole days, so the rows start at the Nth-last match.
      let seen = 0;
      let start = 0;
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (SP.battleKind(rows[index][2], rows[index][5]) !== "match") continue;
        seen += 1;
        if (seen === period.lastMatches) {
          start = index;
          break;
        }
      }
      rows = rows.slice(start);
      firstNumber = career.matchCount - rows.filter(row => SP.battleKind(row[2], row[5]) === "match").length + 1;
    }
    const battles = rows.map((row, index, all) => {
      const [utc, version, mode, map, result, endReason, kills, deaths, teamScore, enemyScore, lpStart, leagueIndex, seconds,
        character, characterLevel, teamPower, enemyPower, endTeam, endEnemies, startTeam, startEnemies, searchSeconds, eventKey] = row;
      const next = all[index + 1] || periodRows.battleAfter;
      const teamHumans = startTeam ?? endTeam ?? 0;
      const enemyHumans = startEnemies ?? endEnemies ?? 0;
      return {
        utc, version, mode, modeName: SP.MODE_NAMES[mode] || SP.words(mode), map, result, endReason,
        kills: kills ?? 0, deaths: deaths ?? 0, teamScore, enemyScore,
        scoreText: mode === "DeathMatch" ? "–" : `${teamScore ?? "?"}–${enemyScore ?? "?"}`,
        lpStart: lpStart ?? 0, lpEnd: next ? (next[10] ?? 0) : (allTime.finalLeaguePoints ?? lpStart ?? 0),
        leagueIndex, seconds: seconds ?? 0, character, characterLevel,
        characterLabel: !character ? "Unknown" : characterLevel === 0 ? `${SP.itemName(character)} (trial)` : `${SP.itemName(character)} lvl ${characterLevel}`,
        teamPower: teamPower ?? 0, enemyPower: enemyPower ?? 0, teamHumans, enemyHumans,
        gapPercent: SP.powerGap(teamPower, enemyPower),
        gapNote: enemyHumans === 0 ? "No human enemies" : !(teamPower > 0) ? "Power not logged" : !(enemyPower > 0) ? "Enemies left before the end" : null,
        searchSeconds, eventKey, kind: SP.battleKind(mode, endReason),
      };
    });

    const weaponsByKey = new Map();
    for (const [eventKey, name, category, kills, seconds, damage, boost] of periodRows.weapons) {
      if (!weaponsByKey.has(eventKey)) weaponsByKey.set(eventKey, []);
      weaponsByKey.get(eventKey).push({ name, category, kills: kills ?? 0, seconds: seconds ?? 0, damage, boost });
    }

    const matches = [];
    const marks = [];
    for (const battle of battles) {
      if (battle.kind === "match") {
        matches.push({
          ...battle,
          number: firstNumber + matches.length,
          position: matches.length + 1,
          outcome: SP.OUTCOMES[battle.result] || "draw",
          kd: battle.deaths === 0 ? battle.kills : battle.kills / battle.deaths,
          weapons: weaponsByKey.get(battle.eventKey) || [],
        });
      } else if (battle.kind === "disconnect" || battle.kind === "earlyExit" || battle.kind === "other") {
        marks.push({ ...battle, boundary: matches.length, penalty: battle.lpEnd - battle.lpStart });
      }
    }

    const versionMarkers = [];
    matches.forEach((match, index) => {
      if (index > 0 && matches[index - 1].version !== match.version) versionMarkers.push({ position: match.position, version: match.version });
    });

    const days = [];
    for (const match of matches) {
      const key = match.utc.slice(0, 10);
      let day = days[days.length - 1];
      if (!day || day.key !== key) {
        day = { key, label: SP.dayLabel(key), matches: [] };
        days.push(day);
      }
      day.matches.push(match);
    }

    const matchesNote = period.tooMany
      ? `${SP.formatNumber(period.matchCount)} matches in this period. Pick a shorter period or click a day on the strip.`
      : "No matches in this period.";
    return {
      raw: { ...periodRows, resources: allTime.resources }, player: allTime.player, finalLeaguePoints: allTime.finalLeaguePoints, career, period,
      battles, matches, shown: matches, marks, shownMarks: marks, versionMarkers, days, matchesNote,
    };
  };
})();
