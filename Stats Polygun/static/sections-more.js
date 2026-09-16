(() => {
  "use strict";

  const SP = window.StatsPolygun;
  const { htmlElement, svgElement, formatNumber, formatSigned, clamp, byId } = SP;

  const HEAT_STEPS = [
    { label: "Used, no kills", opacity: 0.12, test: kills => kills === 0 },
    { label: "1–2", opacity: 0.3, test: kills => kills <= 2 },
    { label: "3–5", opacity: 0.5, test: kills => kills <= 5 },
    { label: "6–9", opacity: 0.7, test: kills => kills <= 9 },
    { label: "10–14", opacity: 0.85, test: kills => kills <= 14 },
    { label: "15+", opacity: 1, test: () => true },
  ];

  const compact = value => (value >= 1e6 ? `${(value / 1e6).toFixed(1)}M` : value >= 1e4 ? `${(value / 1e3).toFixed(1)}K` : formatNumber(Math.round(value)));
  const percentText = gap => `${gap > 0 ? "+" : gap < 0 ? "−" : "±"}${Math.abs(gap).toFixed(gap !== 0 && Math.abs(gap) < 10 ? 1 : 0)}%`;

  function emptyChart(host, text) {
    const note = document.createElement("p");
    note.className = "empty-note";
    note.textContent = text;
    host.replaceChildren(note);
  }

  SP.renderBarList = (host, rows, emptyText = "Nothing logged.") => {
    if (!rows.length) {
      htmlElement("p", "empty-note", host).textContent = emptyText;
      return;
    }
    const largest = Math.max(1, ...rows.map(row => row.value));
    const list = htmlElement("div", "bar-list", host);
    for (const row of rows) {
      const item = htmlElement("div", "bar-row", list);
      if (row.tip) item.dataset.tip = row.tip;
      const label = htmlElement("div", "bar-label", item);
      label.append(row.label);
      if (row.tag) htmlElement("span", "tag", label).textContent = row.tag;
      if (row.sublabel) htmlElement("span", "bar-sublabel", label).textContent = row.sublabel;
      const track = htmlElement("div", "bar-track", item);
      htmlElement("span", `bar-fill ${row.fillClass || ""}`, track).style.width = `${Math.max((row.value / largest) * 100, 1)}%`;
      htmlElement("span", "bar-value", item).textContent = row.valueText ?? formatNumber(row.value);
    }
    SP.bindTips(list, ".bar-row");
  };

  // --- weapons ---

  SP.weaponTotals = matches => {
    const totals = new Map();
    for (const match of matches) {
      for (const weapon of match.weapons) {
        const entry = totals.get(weapon.name) || { name: weapon.name, category: weapon.category, kills: 0, seconds: 0, used: 0, damage: 0 };
        entry.kills += weapon.kills;
        entry.seconds += weapon.seconds;
        entry.used += 1;
        if (SP.GUN_CATEGORIES.has(weapon.category) && weapon.damage > 0) entry.damage += weapon.damage;
        totals.set(weapon.name, entry);
      }
    }
    return [...totals.values()].sort((left, right) => right.kills - left.kills || right.used - left.used);
  };

  SP.renderWeapons = report => {
    const totals = report.career.weaponTotals;
    const hasDamage = totals.some(entry => entry.damage > 0);
    byId("weapons-lede").textContent = `Kills with each weapon across all ${SP.plural(report.career.matchCount, "match", "matches")}. `
      + (hasDamage ? "Damage is shown for guns." : "Damage is not logged in this player's game versions.");
    SP.renderBarList(byId("weapon-kills"), totals.filter(entry => entry.kills > 0).slice(0, 15).map(entry => ({
      label: SP.itemName(entry.name),
      sublabel: `${SP.categoryName(entry.category)} · used in ${SP.plural(entry.used, "match", "matches")}${entry.damage > 0 ? ` · ${compact(entry.damage)} damage` : ""}`,
      value: entry.kills,
      tip: [SP.itemName(entry.name), `${SP.plural(entry.kills, "kill", "kills")} in ${SP.plural(entry.used, "match", "matches")} (${(entry.kills / entry.used).toFixed(1)} per match)`,
        entry.damage > 0 ? `${formatNumber(Math.round(entry.damage))} damage (${formatNumber(Math.round(entry.damage / entry.used))} per match)` : "No damage logged", `Used for ${SP.durationLabel(entry.seconds)}`].join("\n"),
    })), "No weapon kills logged.");
  };

  SP.renderHeatLegend = () => {
    const legend = byId("weapon-heat-legend");
    for (const step of HEAT_STEPS) {
      const item = htmlElement("li", "", legend);
      htmlElement("span", "key key-rect key-accent", item).style.opacity = String(step.opacity);
      item.append(step.label);
    }
  };

  const weaponLines = match => {
    const kills = match.weapons.filter(weapon => weapon.kills > 0).sort((left, right) => right.kills - left.kills).slice(0, 3);
    const lines = kills.length ? [`Kills: ${kills.map(weapon => `${SP.itemName(weapon.name)} ${weapon.kills}`).join(" · ")}`] : [];
    return [...lines, `Character: ${match.characterLabel}`];
  };

  SP.renderWeaponHeat = report => {
    const host = byId("weapon-heat");
    const { shown } = report;
    if (!shown.length) {
      emptyChart(host, report.matchesNote);
      return;
    }
    const topWeapons = SP.weaponTotals(shown).filter(entry => entry.kills > 0 || entry.used > 0).slice(0, 8).map(entry => entry.name);
    const width = host.clientWidth;
    if (!width) return;
    const margin = { top: 6, right: 16, bottom: 30, left: 132 };
    const trackHeight = 22;
    const rowHeight = 18;
    const rowGap = 4;
    const plotWidth = width - margin.left - margin.right;
    const band = plotWidth / shown.length;
    const cellWidth = Math.max(band - 2, 1.5);
    const gridTop = margin.top + trackHeight + 12;
    const gridBottom = gridTop + Math.max(topWeapons.length, 1) * (rowHeight + rowGap) - rowGap;
    const height = gridBottom + margin.bottom;
    const xLeft = position => margin.left + (position - 1) * band;
    const xCenter = position => margin.left + (position - 0.5) * band;

    const svg = svgElement("svg", { width, height, viewBox: `0 0 ${width} ${height}`, class: "chart-svg", role: "img", "aria-label": "Kills with the top weapons in each match, with the character used." });
    const wash = svgElement("rect", { x: 0, y: margin.top, width: band, height: gridBottom - margin.top, class: "column-wash", visibility: "hidden" }, svg);

    svgElement("text", { x: margin.left - 10, y: margin.top + 15, "text-anchor": "end", class: "row-label" }, svg).textContent = "Character";
    const segments = [];
    for (const match of shown) {
      const last = segments[segments.length - 1];
      const trial = match.characterLevel === 0;
      if (last && last.character === match.character && last.trial === trial) {
        last.to = match.position;
        last.maxLevel = Math.max(last.maxLevel, match.characterLevel ?? 0);
      } else {
        segments.push({ character: match.character, trial, from: match.position, to: match.position, minLevel: match.characterLevel ?? 0, maxLevel: match.characterLevel ?? 0 });
      }
    }
    for (const segment of segments) {
      const x = xLeft(segment.from) + 1;
      const segmentWidth = Math.max((segment.to - segment.from + 1) * band - 2, 1);
      svgElement("rect", { x, y: margin.top, width: segmentWidth, height: trackHeight, rx: 4, class: segment.trial ? "track track-trial" : "track" }, svg);
      const name = SP.itemName(segment.character);
      const full = segment.trial ? `${name} · trial` : `${name} · lvl ${segment.minLevel === segment.maxLevel ? segment.minLevel : `${segment.minLevel}–${segment.maxLevel}`}`;
      const text = segmentWidth >= full.length * 6.2 + 12 ? full : segmentWidth >= name.length * 6.2 + 10 ? name : "";
      if (text) svgElement("text", { x: x + 6, y: margin.top + 15, class: "track-label" }, svg).textContent = text;
    }

    const entryFor = (match, name) => match.weapons.find(weapon => weapon.name === name);
    topWeapons.forEach((name, rowIndex) => {
      const y = gridTop + rowIndex * (rowHeight + rowGap);
      const rowLabel = SP.itemName(name).replace(" (ability)", "");
      svgElement("text", { x: margin.left - 10, y: y + 13, "text-anchor": "end", class: "row-label" }, svg).textContent = rowLabel.length > 17 ? `${rowLabel.slice(0, 16)}…` : rowLabel;
      for (const match of shown) {
        const entry = entryFor(match, name);
        if (!entry || (entry.kills === 0 && entry.seconds === 0)) continue;
        svgElement("rect", {
          x: xLeft(match.position) + (band - cellWidth) / 2, y, width: cellWidth, height: rowHeight,
          rx: Math.min(3, cellWidth / 2), class: "heat", "fill-opacity": HEAT_STEPS.find(step => step.test(entry.kills)).opacity,
        }, svg);
      }
    });
    for (const marker of report.versionMarkers) {
      const x = xLeft(marker.position);
      svgElement("line", { x1: x, x2: x, y1: gridTop - 6, y2: gridBottom, class: "version-rule" }, svg);
    }
    SP.drawMatchTicks(svg, xCenter, gridBottom, margin.left);

    const handlePointer = event => {
      const position = SP.positionAtPointer(svg, event, margin.left, band);
      SP.setActive(position);
      SP.showMatchTooltip(shown[position - 1], event.clientX, event.clientY, weaponLines(shown[position - 1]));
    };
    svg.addEventListener("pointermove", handlePointer);
    svg.addEventListener("pointerdown", handlePointer);
    svg.addEventListener("pointerleave", SP.clearActive);
    host.replaceChildren(svg);
    SP.views.weapons = {
      highlight(position) {
        wash.setAttribute("visibility", position === null ? "hidden" : "visible");
        if (position !== null) wash.setAttribute("x", xLeft(position));
      },
      anchor(position) {
        const box = svg.getBoundingClientRect();
        return { x: box.left + xCenter(position), y: box.top + gridTop };
      },
      extraLines: weaponLines,
    };
    SP.views.weapons.highlight(SP.activeNumber);
  };

  // --- power & matchmaking ---

  const powerLines = match => [
    match.gapPercent === null
      ? `Power: your team ${formatNumber(match.teamPower)} · ${match.gapNote}`
      : `Power: your team ${formatNumber(match.teamPower)} vs ${formatNumber(match.enemyPower)} (${percentText(match.gapPercent)})`,
    `Humans at start: ${match.teamHumans} v ${match.enemyHumans}${match.searchSeconds != null ? ` · search ${match.searchSeconds} s` : ""}`,
  ];

  SP.renderPowerGap = report => {
    const host = byId("power-gap");
    const { shown } = report;
    if (!shown.length) {
      emptyChart(host, report.matchesNote);
      return;
    }
    const width = host.clientWidth;
    if (!width) return;
    const height = 300;
    const margin = { top: 36, right: 76, bottom: 40, left: 52 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const band = plotWidth / shown.length;
    const barWidth = clamp(band - 2, 2, 24);
    const cap = 50;
    const xCenter = position => margin.left + (position - 0.5) * band;
    const xBoundary = count => margin.left + count * band;
    const yFor = gap => margin.top + plotHeight * (1 - (clamp(gap, -cap, cap) + cap) / (2 * cap));
    const zeroY = yFor(0);

    const svg = svgElement("svg", { width, height, viewBox: `0 0 ${width} ${height}`, class: "chart-svg", role: "img", "aria-label": "Power gap in percent for each match, colored by result." });
    for (const tick of [-50, -25, 25, 50]) {
      svgElement("line", { x1: margin.left, x2: margin.left + plotWidth, y1: yFor(tick), y2: yFor(tick), class: "grid" }, svg);
      svgElement("text", { x: margin.left - 10, y: yFor(tick) + 4, "text-anchor": "end" }, svg).textContent = `${formatSigned(tick)}%`;
    }
    svgElement("text", { x: margin.left - 10, y: zeroY + 4, "text-anchor": "end" }, svg).textContent = "0";
    svgElement("text", { x: margin.left + plotWidth + 8, y: yFor(37) + 4, class: "ref-label" }, svg).textContent = "Stronger";
    svgElement("text", { x: margin.left + plotWidth + 8, y: yFor(-37) + 4, class: "ref-label" }, svg).textContent = "Weaker";
    SP.drawVersionMarkers(svg, xBoundary, 8, yFor(-cap), 18);
    const wash = svgElement("rect", { x: 0, y: margin.top, width: band, height: plotHeight, class: "column-wash", visibility: "hidden" }, svg);
    const upperLabels = SP.labelRow();
    const lowerLabels = SP.labelRow();

    for (const match of shown) {
      const center = xCenter(match.position);
      const gap = match.gapPercent;
      if (gap === null) {
        svgElement("circle", { cx: center, cy: zeroY, r: Math.min(4, Math.max(band / 2 - 1, 2)), class: "no-data" }, svg);
        continue;
      }
      const end = yFor(gap);
      if (Math.abs(end - zeroY) < 0.5) continue;
      const left = center - barWidth / 2;
      const radius = Math.min(4, barWidth / 2, Math.abs(end - zeroY));
      svgElement("path", { d: gap > 0 ? SP.roundedTopBar(left, end, barWidth, zeroY, radius) : SP.roundedBottomBar(left, zeroY, barWidth, end, radius), class: `bar bar-${match.outcome}` }, svg);
      if (Math.abs(gap) > cap) {
        const breakY = gap > 0 ? end + 14 : end - 14;
        svgElement("path", { d: `M${left - 1},${breakY + 3} L${left + barWidth + 1},${breakY - 3}`, class: "break" }, svg);
        const text = percentText(gap);
        const textWidth = text.length * 6.6;
        const fits = gap > 0
          ? upperLabels(center - textWidth / 2, center + textWidth / 2)
          : lowerLabels(center + barWidth / 2 + 4, center + barWidth / 2 + 4 + textWidth);
        if (fits) svgElement("text", gap > 0 ? { x: center, y: end - 6, "text-anchor": "middle", class: "label-strong" } : { x: center + barWidth / 2 + 4, y: end - 2, class: "label-strong" }, svg).textContent = text;
      }
    }
    svgElement("line", { x1: margin.left, x2: margin.left + plotWidth, y1: zeroY, y2: zeroY, class: "axis-base" }, svg);
    SP.drawMatchTicks(svg, xCenter, yFor(-cap), margin.left);

    const handlePointer = event => {
      const position = SP.positionAtPointer(svg, event, margin.left, band);
      SP.setActive(position);
      SP.showMatchTooltip(shown[position - 1], event.clientX, event.clientY, powerLines(shown[position - 1]));
    };
    svg.addEventListener("pointermove", handlePointer);
    svg.addEventListener("pointerdown", handlePointer);
    svg.addEventListener("pointerleave", SP.clearActive);
    host.replaceChildren(svg);
    SP.views.power = {
      highlight(position) {
        wash.setAttribute("visibility", position === null ? "hidden" : "visible");
        if (position !== null) wash.setAttribute("x", xBoundary(position - 1));
      },
      anchor(position) {
        const box = svg.getBoundingClientRect();
        const gap = shown[position - 1].gapPercent;
        return { x: box.left + xCenter(position), y: box.top + yFor(gap === null ? 0 : gap) };
      },
      extraLines: powerLines,
    };
    SP.views.power.highlight(SP.activeNumber);
  };

  SP.renderPowerBuckets = report => {
    const groupsById = new Map(report.career.buckets.map(group => [group.id, group]));
    SP.renderSplitRows("power-buckets", SP.POWER_BUCKETS.map(bucket => {
      const group = groupsById.get(bucket.id) || { total: 0, counts: { win: 0, loss: 0, draw: 0, kills: 0, deaths: 0 } };
      return { ...group, name: bucket.label, sublabel: `${bucket.range} · ${SP.plural(group.total, "match", "matches")}`, showKd: false };
    }));
  };

  SP.rollingMedian = (values, windowSize) => values.map((value, index) => {
    const recent = values.slice(Math.max(0, index - windowSize + 1), index + 1).filter(item => item !== null);
    return recent.length ? SP.median(recent) : null;
  });

  SP.renderSearchTimeline = report => {
    const host = byId("search-timeline");
    const summary = byId("search-summary");
    const matches = report.matches;
    const values = matches.map(match => (match.searchSeconds === null || match.searchSeconds === undefined ? null : match.searchSeconds));
    const timed = values.filter(value => value !== null);
    const failed = (report.raw.searchFails || []).filter(row => row[1] !== "User clicked cancel button").length;
    const failText = failed ? ` ${SP.plural(failed, "search", "searches")} failed (cancels not counted).` : "";
    if (!timed.length) {
      emptyChart(host, matches.length ? "No search times logged." : report.matchesNote);
      summary.textContent = failText.trim();
      return;
    }

    const windowSize = 10;
    const edge = Math.max(1, Math.min(10, Math.floor(timed.length / 2)));
    const firstTypical = SP.median(timed.slice(0, edge));
    const lastTypical = SP.median(timed.slice(-edge));
    const change = lastTypical - firstTypical;
    const changeText = change === 0 ? "no change" : `${change > 0 ? "+" : "−"}${Math.abs(change)} s, ${change > 0 ? "slower" : "faster"}`;
    summary.textContent = timed.length >= 2
      ? `First ${SP.plural(edge, "match", "matches")}: typical ${firstTypical} s. Last ${SP.plural(edge, "match", "matches")}: typical ${lastTypical} s (${changeText}). All ${formatNumber(timed.length)}: typical ${SP.median(timed)} s, longest ${Math.max(...timed)} s.${failText}`
      : `One match: ${timed[0]} s.${failText}`;

    const typical = SP.rollingMedian(values, windowSize);
    const width = host.clientWidth;
    if (!width) return;
    const height = 270;
    const margin = { top: 46, right: 60, bottom: 40, left: 52 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const count = matches.length;
    const band = plotWidth / count;
    const tallest = Math.max(...timed);
    const step = tallest > 80 ? 20 : 10;
    const yMax = Math.max(step * 2, Math.ceil((tallest * 1.08) / step) * step);
    const xCenter = index => margin.left + (index + 0.5) * band;
    const xBoundary = index => margin.left + index * band;
    const yFor = seconds => margin.top + plotHeight * (1 - seconds / yMax);
    const baselineY = yFor(0);

    const svg = svgElement("svg", { width, height, viewBox: `0 0 ${width} ${height}`, class: "chart-svg", role: "img", "aria-label": `Time to find a match for the ${count} matches in the period, with the typical time of the last ${windowSize} matches.` });
    for (let tick = step; tick <= yMax; tick += step) {
      svgElement("line", { x1: margin.left, x2: margin.left + plotWidth, y1: yFor(tick), y2: yFor(tick), class: "grid" }, svg);
      svgElement("text", { x: margin.left - 10, y: yFor(tick) + 4, "text-anchor": "end" }, svg).textContent = tick === yMax ? `${tick} s` : String(tick);
    }
    svgElement("line", { x1: margin.left, x2: margin.left + plotWidth, y1: baselineY, y2: baselineY, class: "axis-base" }, svg);
    svgElement("text", { x: margin.left - 10, y: baselineY + 4, "text-anchor": "end" }, svg).textContent = "0";

    const labelRowEnds = [-Infinity, -Infinity];
    report.days.forEach((day, dayNumber) => {
      const x = xBoundary(day.matches[0].position - 1);
      if (dayNumber > 0) svgElement("line", { x1: x, x2: x, y1: 8, y2: baselineY, class: "day-rule" }, svg);
      const labelStart = x + 4;
      const row = labelStart >= labelRowEnds[0] + 8 ? 0 : 1;
      if (row === 1 && labelStart < labelRowEnds[1] + 8) return;
      labelRowEnds[row] = labelStart + day.label.length * 6.7;
      svgElement("text", { x: labelStart, y: 18 + row * 12, class: "day-label" }, svg).textContent = day.label;
    });
    SP.drawVersionRules(svg, report.versionMarkers.map(marker => ({ x: xBoundary(marker.position - 1), version: marker.version })), 32, baselineY, 42);

    const radius = band >= 8 ? 3.5 : band >= 4 ? 2.5 : 1.5;
    values.forEach((value, index) => {
      if (value === null) return;
      svgElement("circle", { cx: xCenter(index), cy: yFor(Math.min(value, yMax)), r: radius, class: "search-dot" }, svg);
    });
    let pathData = "";
    typical.forEach((value, index) => {
      if (value === null) return;
      pathData += `${pathData ? " L" : "M"}${xCenter(index)},${yFor(Math.min(value, yMax))}`;
    });
    if (pathData.includes(" L")) svgElement("path", { d: pathData, class: "search-line" }, svg);
    const activeDot = svgElement("circle", { cx: 0, cy: 0, r: Math.max(radius + 1.5, 4), class: "search-dot-active", visibility: "hidden" }, svg);

    const tickEvery = count > 120 ? 50 : count > 60 ? 20 : count > 25 ? 10 : count > 12 ? 5 : 1;
    const ticks = new Set([0, count - 1]);
    for (let index = tickEvery - 1; index < count - 1; index += tickEvery) {
      if (count - 1 - index >= tickEvery / 2) ticks.add(index);
    }
    for (const index of ticks) {
      const text = String(matches[index].number);
      svgElement("text", { x: Math.max(xCenter(index), margin.left - 4 + text.length * 3.3), y: baselineY + 18, "text-anchor": "middle" }, svg).textContent = text;
    }
    svgElement("text", { x: margin.left - 10, y: baselineY + 18, "text-anchor": "end" }, svg).textContent = "Match";

    const showActive = index => {
      if (index === null || values[index] === null) {
        activeDot.setAttribute("visibility", "hidden");
        return;
      }
      activeDot.setAttribute("visibility", "visible");
      activeDot.setAttribute("cx", xCenter(index));
      activeDot.setAttribute("cy", yFor(Math.min(values[index], yMax)));
    };
    svg.addEventListener("pointermove", event => {
      const box = svg.getBoundingClientRect();
      const index = SP.clamp(Math.floor((event.clientX - box.left - margin.left) / band), 0, count - 1);
      const match = matches[index];
      SP.setActive(match.position);
      showActive(index);
      SP.showLines([
        values[index] === null ? "Search time not logged" : `Search ${values[index]} s`,
        typical[index] === null ? "" : `Typical for the last ${Math.min(windowSize, index + 1)} matches: ${typical[index]} s`,
        `#${match.number} · ${SP.dayLabel(match.utc)}, ${SP.clockLabel(match.utc)} UTC · ${match.modeName} · v${match.version}`,
      ].filter(Boolean), event.clientX, event.clientY);
    });
    svg.addEventListener("pointerleave", SP.clearActive);
    host.replaceChildren(svg);

    SP.views.search = {
      highlight(position) {
        showActive(position === null ? null : position - 1);
      },
    };
    SP.views.search.highlight(SP.activeNumber);
  };

  // --- play time ---

  SP.sessionsByDay = report => {
    const days = new Map();
    for (const [utc, seconds] of report.raw.sessions) {
      const key = utc.slice(0, 10);
      const entry = days.get(key) || { seconds: 0, sessions: 0 };
      entry.seconds += seconds || 0;
      entry.sessions += 1;
      days.set(key, entry);
    }
    return days;
  };

  SP.matchesByDay = report => {
    const days = new Map();
    for (const match of report.matches) {
      const key = match.utc.slice(0, 10);
      if (!days.has(key)) days.set(key, []);
      days.get(key).push(match);
    }
    return days;
  };

  SP.renderTimePerDay = report => {
    const host = byId("time-per-day");
    const sessions = SP.sessionsByDay(report);
    const totalSeconds = [...sessions.values()].reduce((sum, entry) => sum + entry.seconds, 0);
    byId("playtime-lede").textContent = `Minutes the app was open each UTC day in the period, from ${SP.plural(report.raw.sessions.length, "app session", "app sessions")} (${SP.durationLabel(totalSeconds)} in total).`;
    if (!sessions.size) {
      emptyChart(host, "No app sessions in this period.");
      return;
    }
    const lastIndex = SP.dayIndex(report.period.to);
    const firstIndex = Math.min(SP.dayIndex(report.period.from), lastIndex - 6);
    const dayCount = lastIndex - firstIndex + 1;
    // Career counts, so the tooltip still has match counts when a long period skips the match rows.
    const matchCounts = new Map(report.career.days.map(day => [day.key, day.count]));
    const width = host.clientWidth;
    if (!width) return;
    const height = 240;
    const margin = { top: 26, right: 16, bottom: 34, left: 52 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const band = plotWidth / dayCount;
    const barWidth = clamp(band - 2, 2, 24);
    const minutesOn = key => (sessions.get(key)?.seconds || 0) / 60;
    const step = Math.max(...[...sessions.values()].map(entry => entry.seconds / 60)) > 120 ? 50 : 20;
    const yMax = Math.max(step, Math.ceil(Math.max(...[...sessions.values()].map(entry => entry.seconds / 60)) / step) * step);
    const yFor = value => margin.top + plotHeight * (1 - value / yMax);
    const baseY = yFor(0);
    const svg = svgElement("svg", { width, height, viewBox: `0 0 ${width} ${height}`, class: "chart-svg", role: "img", "aria-label": "Minutes in the app per UTC day." });
    for (let tick = step; tick <= yMax; tick += step) {
      svgElement("line", { x1: margin.left, x2: margin.left + plotWidth, y1: yFor(tick), y2: yFor(tick), class: "grid" }, svg);
      svgElement("text", { x: margin.left - 10, y: yFor(tick) + 4, "text-anchor": "end" }, svg).textContent = String(tick);
    }
    svgElement("text", { x: margin.left - 10, y: baseY + 4, "text-anchor": "end" }, svg).textContent = "0";
    let peakKey = null;
    for (let index = 0; index < dayCount; index += 1) {
      const key = SP.dayKey(firstIndex + index);
      const minutes = minutesOn(key);
      if (minutes <= 0) continue;
      if (peakKey === null || minutes > minutesOn(peakKey)) peakKey = key;
      const top = yFor(minutes);
      const center = margin.left + (index + 0.5) * band;
      if (baseY - top > 0.3) svgElement("path", { d: SP.roundedTopBar(center - barWidth / 2, top, barWidth, baseY, Math.min(4, barWidth / 2, baseY - top)), class: "bar-accent" }, svg);
    }
    if (peakKey) {
      const peakCenter = margin.left + (SP.dayIndex(peakKey) - firstIndex + 0.5) * band;
      const anchor = peakCenter > margin.left + plotWidth * 0.6 ? "end" : "start";
      svgElement("text", { x: peakCenter, y: yFor(minutesOn(peakKey)) - 7, "text-anchor": anchor, class: "label-strong" }, svg).textContent = `${SP.dayLabel(peakKey)}: ${Math.round(minutesOn(peakKey))} min`;
    }
    svgElement("line", { x1: margin.left, x2: margin.left + plotWidth, y1: baseY, y2: baseY, class: "axis-base" }, svg);
    const tickEvery = dayCount > 70 ? 14 : dayCount > 10 ? 7 : 1;
    for (let index = dayCount - 1; index >= 0; index -= tickEvery) {
      svgElement("text", { x: margin.left + (index + 0.5) * band, y: baseY + 18, "text-anchor": "middle" }, svg).textContent = SP.dayLabel(SP.dayKey(firstIndex + index));
    }
    svg.addEventListener("pointermove", event => {
      const box = svg.getBoundingClientRect();
      const index = Math.floor((event.clientX - box.left - margin.left) / band);
      const key = SP.dayKey(firstIndex + index);
      const entry = sessions.get(key);
      const matchCount = matchCounts.get(key) || 0;
      if (index < 0 || index >= dayCount || (!entry && !matchCount)) {
        SP.tooltip.hidden = true;
        return;
      }
      SP.showLines([
        `${SP.dayLabel(key)} (UTC)`,
        entry ? `${(entry.seconds / 60).toFixed(1)} min in app · ${SP.plural(entry.sessions, "session", "sessions")}` : "No app session logged",
        SP.plural(matchCount, "match", "matches"),
      ], event.clientX, event.clientY);
    });
    svg.addEventListener("pointerleave", () => { SP.tooltip.hidden = true; });
    host.replaceChildren(svg);
  };

  SP.renderHourGrid = report => {
    const host = byId("hour-grid");
    const matchDays = [...SP.matchesByDay(report).entries()].sort((left, right) => left[0].localeCompare(right[0])).slice(-14);
    if (!matchDays.length) {
      emptyChart(host, report.matchesNote);
      return;
    }
    const width = host.clientWidth;
    if (!width) return;
    const margin = { top: 22, right: 16, bottom: 6, left: 64 };
    const rowHeight = 24;
    const rowGap = 3;
    const plotWidth = width - margin.left - margin.right;
    const column = plotWidth / 24;
    const cellWidth = Math.max(column - 3, 2);
    const height = margin.top + matchDays.length * (rowHeight + rowGap) - rowGap + margin.bottom;
    const hourText = hour => String(hour).padStart(2, "0");
    const svg = svgElement("svg", { width, height, viewBox: `0 0 ${width} ${height}`, class: "chart-svg", role: "img", "aria-label": "Matches in each UTC hour, one row per day with matches." });
    for (let hour = 0; hour < 24; hour += 3) {
      svgElement("text", { x: margin.left + (hour + 0.5) * column, y: 13, "text-anchor": "middle" }, svg).textContent = `${hourText(hour)}:00`;
    }
    matchDays.forEach(([key, dayMatches], rowIndex) => {
      const y = margin.top + rowIndex * (rowHeight + rowGap);
      svgElement("text", { x: margin.left - 10, y: y + 16, "text-anchor": "end", class: "row-label" }, svg).textContent = SP.dayLabel(key);
      const counts = new Array(24).fill(0);
      for (const match of dayMatches) counts[Number(match.utc.slice(11, 13))] += 1;
      counts.forEach((count, hour) => {
        const x = margin.left + hour * column + (column - cellWidth) / 2;
        if (count === 0) {
          svgElement("rect", { x, y, width: cellWidth, height: rowHeight, rx: 3, class: "cell-empty" }, svg);
          return;
        }
        const opacity = count >= 6 ? 1 : count >= 4 ? 0.8 : count >= 2 ? 0.55 : 0.3;
        svgElement("rect", { x, y, width: cellWidth, height: rowHeight, rx: 3, class: "heat", "fill-opacity": opacity, "data-tip": `${SP.dayLabel(key)}, ${hourText(hour)}:00–${hourText(hour + 1)}:00 UTC\n${SP.plural(count, "match", "matches")}` }, svg);
        if (cellWidth >= 14) svgElement("text", { x: x + cellWidth / 2, y: y + 16, "text-anchor": "middle", class: opacity >= 0.55 ? "cell-label cell-label-on" : "cell-label" }, svg).textContent = String(count);
      });
    });
    SP.bindTips(svg, "[data-tip]");
    host.replaceChildren(svg);
  };
})();
