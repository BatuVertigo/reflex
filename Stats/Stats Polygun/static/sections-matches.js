(() => {
  "use strict";

  const SP = window.StatsPolygun;
  const { htmlElement, svgElement, formatNumber, formatSigned, clamp, byId } = SP;

  SP.renderPlayer = report => {
    const player = report.player;
    byId("player-name").textContent = player.name || player.playfabId;
    const meta = byId("player-meta");
    const versions = player.versions || [];
    const parts = [
      `PlayFab ID ${player.playfabId}`,
      [player.os, player.device, player.country].filter(Boolean).join(" · ") || "Device not logged",
      versions.length > 1 ? `v${versions[0]} → v${versions[versions.length - 1]}` : versions.length ? `v${versions[0]}` : "",
      player.firstSeen ? `Seen ${SP.dayLabelWithYear(player.firstSeen)} – ${SP.dayLabelWithYear(player.lastSeen)} (UTC)` : "",
    ];
    for (const part of parts.filter(Boolean)) htmlElement("span", "", meta).textContent = part;
  };

  SP.longestRun = (matches, outcome) => {
    let best = { length: 0, from: 0, to: 0 };
    let runStart = null;
    matches.forEach((match, index) => {
      if (match.outcome !== outcome) {
        runStart = null;
        return;
      }
      if (runStart === null) runStart = index;
      const length = index - runStart + 1;
      if (length > best.length) best = { length, from: matches[runStart].number, to: match.number };
    });
    return best;
  };

  SP.renderSummary = (career, finalLeaguePoints, vtd) => {
    const { totals, matchCount, days } = career;
    const first = days[0];
    const last = days[days.length - 1];
    const points = finalLeaguePoints ?? 0;
    byId("stat-matches").textContent = formatNumber(matchCount);
    byId("stat-matches-sub").textContent = first ? `${SP.dayLabel(first.key)} – ${SP.dayLabelWithYear(last.key)} (UTC)` : "No finished matches yet";
    byId("stat-win-rate").textContent = matchCount ? `${Math.round((totals.win / matchCount) * 100)}%` : "–";
    byId("stat-win-rate-sub").textContent = `${SP.countWords(totals.win, "win")} · ${SP.countWords(totals.loss, "loss")} · ${SP.countWords(totals.draw, "draw")}`;
    for (const outcome of ["win", "draw", "loss"]) {
      if (totals[outcome]) htmlElement("span", `seg seg-${outcome}`, byId("record-bar")).style.flexGrow = String(totals[outcome]);
    }
    byId("stat-kd").textContent = totals.deaths ? (totals.kills / totals.deaths).toFixed(2) : totals.kills ? String(totals.kills) : "–";
    byId("stat-kd-sub").textContent = `${formatNumber(totals.kills)} kills · ${formatNumber(totals.deaths)} deaths`;
    byId("stat-lp").textContent = formatNumber(points);
    const peak = Math.max(points, ...days.map(day => day.highestPoints));
    byId("stat-lp-sub").textContent = first ? `${formatSigned(points - first.firstPoints)} since match 1 · peak ${formatNumber(peak)}` : "No matches yet";
    // Whole dollars; a dash when TE has no value (the preview data has none).
    byId("stat-vtd").textContent = vtd == null ? "–" : `$${formatNumber(Math.round(vtd))}`;
  };

  // The career strip: every UTC day from first to last activity, with the picked period shaded. Clicking a day picks it.
  SP.renderCareerStrip = (career, period, onPickDay) => {
    const host = byId("career-strip");
    if (!host) return;
    if (!career.days.length) {
      emptyChart(host, "No finished matches yet.");
      return;
    }
    const width = host.clientWidth;
    if (!width) return;
    const margin = { top: 26, right: 16, bottom: 26, left: 64 };
    const lineHeight = 70;
    const barsTop = margin.top + lineHeight + 12;
    const barsHeight = 30;
    const height = barsTop + barsHeight + margin.bottom;
    const firstIndex = SP.dayIndex(career.firstDay);
    const dayCount = SP.dayIndex(career.lastDay) - firstIndex + 1;
    const plotWidth = width - margin.left - margin.right;
    const band = plotWidth / dayCount;
    const xLeft = key => margin.left + (SP.dayIndex(key) - firstIndex) * band;
    const dayByKey = new Map(career.days.map(day => [day.key, day]));
    const pointValues = career.days.map(day => day.endPoints);
    const lowest = Math.min(...pointValues);
    const highest = Math.max(...pointValues, lowest + 100);
    const padding = (highest - lowest) * 0.08;
    const domainMin = Math.max(0, Math.floor((lowest - padding) / 100) * 100);
    const domainMax = Math.ceil((highest + padding) / 100) * 100;
    const yFor = value => margin.top + lineHeight * (1 - (value - domainMin) / (domainMax - domainMin));
    const mostMatches = Math.max(...career.days.map(day => day.count));
    const barWidth = clamp(band - 1, 1, 12);

    const svg = svgElement("svg", {
      width, height, viewBox: `0 0 ${width} ${height}`, class: "chart-svg", role: "img",
      "aria-label": `Career from ${SP.dayLabelWithYear(career.firstDay)} to ${SP.dayLabelWithYear(career.lastDay)}: league points at the end of each day and matches per day. The shaded days are the picked period.`,
    });
    const periodLeft = xLeft(period.from < career.firstDay ? career.firstDay : period.from);
    const periodRight = xLeft(period.to > career.lastDay ? career.lastDay : period.to) + band;
    svgElement("rect", { x: periodLeft, y: margin.top - 8, width: Math.max(periodRight - periodLeft, 2), height: barsTop + barsHeight - margin.top + 8, class: "period-band" }, svg);
    for (const value of [domainMin, domainMax]) {
      svgElement("line", { x1: margin.left, x2: margin.left + plotWidth, y1: yFor(value), y2: yFor(value), class: "grid" }, svg);
      svgElement("text", { x: margin.left - 10, y: yFor(value) + 4, "text-anchor": "end" }, svg).textContent = formatNumber(value);
    }
    svgElement("text", { x: margin.left - 10, y: barsTop + barsHeight - 2, "text-anchor": "end", class: "row-label" }, svg).textContent = "Matches";
    svgElement("line", { x1: margin.left, x2: margin.left + plotWidth, y1: barsTop + barsHeight, y2: barsTop + barsHeight, class: "axis-base" }, svg);

    const rules = [];
    career.days.forEach((day, index) => {
      if (index > 0 && career.days[index - 1].version !== day.version) rules.push({ x: xLeft(day.key), version: day.version });
      const barHeight = Math.max((day.count / mostMatches) * barsHeight, 1.5);
      svgElement("rect", { x: xLeft(day.key) + (band - barWidth) / 2, y: barsTop + barsHeight - barHeight, width: barWidth, height: barHeight, class: "strip-bar" }, svg);
    });
    SP.drawVersionRules(svg, rules, margin.top - 8, barsTop + barsHeight, 14);
    const pathData = career.days.map((day, index) => `${index ? "L" : "M"}${xLeft(day.key) + band / 2},${yFor(day.endPoints)}`).join(" ");
    svgElement("path", { d: pathData, class: "lp-line" }, svg);
    const lastDay = career.days[career.days.length - 1];
    svgElement("circle", { cx: xLeft(lastDay.key) + band / 2, cy: yFor(lastDay.endPoints), r: 3.5, class: "dot-start" }, svg);

    const every = Math.max(1, Math.ceil(64 / band));
    for (let index = dayCount - 1; index >= 0; index -= every) {
      svgElement("text", { x: margin.left + (index + 0.5) * band, y: height - 8, "text-anchor": "middle" }, svg).textContent = SP.dayLabel(SP.dayKey(firstIndex + index));
    }
    const wash = svgElement("rect", { x: 0, y: margin.top - 8, width: Math.max(band, 2), height: barsTop + barsHeight - margin.top + 8, class: "column-wash", visibility: "hidden" }, svg);

    const keyAt = event => {
      const box = svg.getBoundingClientRect();
      const index = Math.floor((event.clientX - box.left - margin.left) / band);
      return index >= 0 && index < dayCount ? SP.dayKey(firstIndex + index) : null;
    };
    svg.addEventListener("pointermove", event => {
      const key = keyAt(event);
      if (!key) {
        wash.setAttribute("visibility", "hidden");
        SP.tooltip.hidden = true;
        return;
      }
      wash.setAttribute("visibility", "visible");
      wash.setAttribute("x", xLeft(key));
      const day = dayByKey.get(key);
      SP.showLines(day ? [
        `${SP.dayLabelWithYear(key)} (UTC)`,
        `${SP.plural(day.count, "match", "matches")} · ${day.wins}–${day.losses}–${day.draws} · KD ${(day.kills / Math.max(day.deaths, 1)).toFixed(2)}`,
        `League points at day end: ${formatNumber(day.endPoints)} · v${day.version}`,
        "Click to open this day",
      ] : [`${SP.dayLabelWithYear(key)} (UTC)`, "No matches", "Click to open this day"], event.clientX, event.clientY);
    });
    svg.addEventListener("pointerleave", () => {
      wash.setAttribute("visibility", "hidden");
      SP.tooltip.hidden = true;
    });
    svg.addEventListener("click", event => {
      const key = keyAt(event);
      if (key) onPickDay(key);
    });
    host.replaceChildren(svg);
  };

  SP.renderForm = report => {
    const { shown, matches, days } = report;
    byId("form-lede").textContent = "Every match in the period, one square each, grouped by UTC day.";
    const strip = byId("form-strip");
    const chipByPosition = new Map();
    for (const day of days) {
      const counts = SP.countOutcomes(day.matches);
      const group = htmlElement("div", "day", strip);
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", `${day.label}: ${SP.countWords(counts.win, "win")}, ${SP.countWords(counts.loss, "loss")}, ${SP.countWords(counts.draw, "draw")}`);
      const head = htmlElement("p", "day-head", group);
      htmlElement("span", "day-name", head).textContent = day.label;
      htmlElement("span", "day-record", head).textContent = [counts.win && `${counts.win}W`, counts.loss && `${counts.loss}L`, counts.draw && `${counts.draw}D`].filter(Boolean).join(" ");
      const chips = htmlElement("div", "chips", group);
      chips.setAttribute("aria-hidden", "true");
      for (const match of day.matches) {
        const chip = htmlElement("span", `chip chip-${match.outcome}`, chips);
        chip.textContent = SP.OUTCOME_LETTERS[match.outcome];
        chip.dataset.position = String(match.position);
        chipByPosition.set(match.position, chip);
      }
    }
    if (!shown.length) htmlElement("p", "empty-note", strip).textContent = report.matchesNote;
    strip.addEventListener("pointerover", event => {
      const chip = event.target.closest(".chip");
      if (!chip) return;
      const position = Number(chip.dataset.position);
      SP.setActive(position);
      const box = chip.getBoundingClientRect();
      SP.showMatchTooltip(shown[position - 1], box.right, box.bottom);
    });
    strip.addEventListener("pointerleave", SP.clearActive);
    SP.views.form = {
      highlight(position) {
        for (const [chipPosition, chip] of chipByPosition) chip.classList.toggle("is-active", chipPosition === position);
      },
      anchor(position) {
        const box = chipByPosition.get(position).getBoundingClientRect();
        return { x: box.right, y: box.bottom };
      },
    };
    SP.attachKeyboard(strip, "form");

    const streaks = byId("streaks");
    for (const [label, run] of [["Best win streak", SP.longestRun(matches, "win")], ["Longest losing streak", SP.longestRun(matches, "loss")]]) {
      if (!run.length) continue;
      const item = htmlElement("span", "", streaks);
      item.append(`${label}: `);
      htmlElement("strong", "", item).textContent = SP.plural(run.length, "match", "matches");
      item.append(` (#${run.from}–${run.to})`);
    }
  };

  function emptyChart(host, text) {
    const note = document.createElement("p");
    note.className = "empty-note";
    note.textContent = text;
    host.replaceChildren(note);
  }

  SP.renderLeagueChart = report => {
    const host = byId("lp-chart");
    const { shown, shownMarks } = report;
    if (!shown.length) {
      emptyChart(host, report.matchesNote);
      return;
    }
    const width = host.clientWidth;
    if (!width) return;
    const height = 390;
    const margin = { top: 62, right: 76, bottom: 40, left: 52 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const band = plotWidth / shown.length;
    // The axis fits the shown matches: from 0, a player at 18,000 points is a flat strip under a pile of league labels.
    const plotted = shown.flatMap(match => [match.lpStart, match.lpEnd]).concat(shownMarks.map(mark => mark.lpEnd));
    const lowest = Math.min(...plotted);
    const highest = Math.max(...plotted, 100);
    const padding = Math.max((highest - lowest) * 0.06, 50);
    const domainMin = Math.max(0, Math.floor((lowest - padding) / 250) * 250);
    const domainMax = Math.ceil((highest + padding) / 250) * 250;
    const span = domainMax - domainMin;
    const xCenter = position => margin.left + (position - 0.5) * band;
    const xBoundary = count => margin.left + count * band;
    const yFor = points => margin.top + plotHeight * (1 - (clamp(points, domainMin, domainMax) - domainMin) / span);
    const baselineY = yFor(domainMin);

    const svg = svgElement("svg", { width, height, viewBox: `0 0 ${width} ${height}`, class: "chart-svg", role: "img", "aria-label": `League points after each of the ${shown.length} matches in the period.` });
    const floors = SP.LEAGUE_FLOORS;
    floors.forEach((floor, league) => {
      const ceiling = floors[league + 1] ?? Infinity;
      if (ceiling <= domainMin || floor >= domainMax) return;
      const top = yFor(Math.min(ceiling, domainMax));
      const bottom = yFor(Math.max(floor, domainMin));
      svgElement("rect", { x: margin.left, y: top, width: plotWidth, height: bottom - top, class: league % 2 === 1 ? "band band-alt" : "band" }, svg);
      if (bottom - top >= 12) svgElement("text", { x: margin.left + plotWidth + 10, y: (top + bottom) / 2 + 3.5, class: "band-label" }, svg).textContent = `LEAGUE ${league}`;
    });
    // League floors label the axis; round values fill the space above the top floor, so a player inside one league still gets a scale.
    const ticks = floors.filter(floor => floor > domainMin && floor < domainMax);
    const roundFrom = ticks.length ? ticks[ticks.length - 1] : domainMin;
    if (domainMax - roundFrom > span * 0.5) {
      const step = [100, 250, 500, 1000, 2500, 5000].find(size => span / size <= 6) ?? 10000;
      for (let value = (Math.floor(roundFrom / step) + 1) * step; value < domainMax; value += step) ticks.push(value);
    }
    let lastLabelY = baselineY;
    for (const value of ticks) {
      const y = yFor(value);
      if (lastLabelY - y < 14) continue;
      svgElement("line", { x1: margin.left, x2: margin.left + plotWidth, y1: y, y2: y, class: "grid" }, svg);
      svgElement("text", { x: margin.left - 10, y: y + 4, "text-anchor": "end" }, svg).textContent = formatNumber(value);
      lastLabelY = y;
    }
    svgElement("line", { x1: margin.left, x2: margin.left + plotWidth, y1: baselineY, y2: baselineY, class: "axis-base" }, svg);
    svgElement("text", { x: margin.left - 10, y: baselineY + 4, "text-anchor": "end" }, svg).textContent = formatNumber(domainMin);

    const labelRowEnds = [-Infinity, -Infinity];
    report.days.forEach((day, dayIndex) => {
      const x = xBoundary(day.matches[0].position - 1);
      if (dayIndex > 0) svgElement("line", { x1: x, x2: x, y1: 10, y2: baselineY, class: "day-rule" }, svg);
      const labelStart = x + 4;
      const row = labelStart >= labelRowEnds[0] + 8 ? 0 : 1;
      if (row === 1 && labelStart < labelRowEnds[1] + 8) return;
      labelRowEnds[row] = labelStart + day.label.length * 6.7;
      svgElement("text", { x: labelStart, y: 20 + row * 12, class: "day-label" }, svg).textContent = day.label;
    });
    SP.drawVersionMarkers(svg, xBoundary, 38, baselineY, 50);

    const cursorLine = svgElement("line", { x1: 0, x2: 0, y1: margin.top - 4, y2: baselineY, class: "cursor-line", visibility: "hidden" }, svg);
    const penaltyAfter = new Map();
    for (const mark of shownMarks) {
      if (mark.penalty !== 0) penaltyAfter.set(mark.boundary, (penaltyAfter.get(mark.boundary) || []).concat(mark));
    }
    let pathData = `M${xBoundary(0)},${yFor(shown[0].lpStart)}`;
    for (const match of shown) {
      for (const mark of penaltyAfter.get(match.position - 1) || []) pathData += ` L${xBoundary(match.position - 1)},${yFor(mark.lpEnd)}`;
      pathData += ` L${xCenter(match.position)},${yFor(match.lpEnd)}`;
    }
    svgElement("path", { d: pathData, class: "lp-line" }, svg);
    svgElement("circle", { cx: xBoundary(0), cy: yFor(shown[0].lpStart), r: 3.5, class: "dot-start" }, svg);
    const dotRadius = band >= 11 ? 4.5 : 3.5;
    // Wins are most matches, so they are small plain dots that do not pile up; losses and draws keep the ringed circles, drawn on top.
    const winRadius = clamp(band * 0.35, 1.2, 4);
    for (const match of shown) {
      if (match.outcome === "win") svgElement("circle", { cx: xCenter(match.position), cy: yFor(match.lpEnd), r: winRadius, class: "dot-win" }, svg);
    }
    for (const match of shown) {
      if (match.outcome !== "win") svgElement("circle", { cx: xCenter(match.position), cy: yFor(match.lpEnd), r: dotRadius, class: `dot dot-${match.outcome}` }, svg);
    }
    const peak = shown.reduce((best, match) => (match.lpEnd > best.lpEnd ? match : best), shown[0]);
    svgElement("text", { x: clamp(xCenter(peak.position), margin.left + 30, margin.left + plotWidth - 30), y: yFor(peak.lpEnd) - 13, "text-anchor": "middle", class: "label-strong" }, svg).textContent = `Peak ${formatNumber(peak.lpEnd)}`;

    const markY = yFor(domainMin + Math.min(50, span * 0.04));
    shownMarks.forEach((mark, index) => {
      const x = xBoundary(mark.boundary);
      const glyph = mark.kind === "earlyExit"
        ? `M${x - 4},${markY - 3.5} H${x + 4} L${x},${markY + 3.5} Z`
        : `M${x - 3.5},${markY - 3.5} L${x + 3.5},${markY + 3.5} M${x + 3.5},${markY - 3.5} L${x - 3.5},${markY + 3.5}`;
      svgElement("path", { d: glyph, class: "mark-glyph" }, svg);
      if (mark.penalty !== 0 && band >= 9) svgElement("text", { x: x + 8, y: markY + 4, class: "label-strong" }, svg).textContent = formatSigned(mark.penalty);
      svgElement("rect", { x: x - 12, y: markY - 12, width: 24, height: 24, class: "hit", "data-mark": index }, svg);
    });

    const cursorHalo = svgElement("circle", { cx: 0, cy: 0, r: dotRadius + 4, class: "cursor-halo", visibility: "hidden" }, svg);
    SP.drawMatchTicks(svg, xCenter, baselineY, margin.left);

    const handlePointer = event => {
      const markHit = event.target.closest("[data-mark]");
      if (markHit) {
        SP.setActive(null);
        SP.showMarkTooltip(shownMarks[Number(markHit.dataset.mark)], event.clientX, event.clientY);
        return;
      }
      const position = SP.positionAtPointer(svg, event, margin.left, band);
      SP.setActive(position);
      SP.showMatchTooltip(shown[position - 1], event.clientX, event.clientY);
    };
    svg.addEventListener("pointermove", handlePointer);
    svg.addEventListener("pointerdown", handlePointer);
    svg.addEventListener("pointerleave", SP.clearActive);
    host.replaceChildren(svg);

    SP.views.lp = {
      highlight(position) {
        const visibility = position === null ? "hidden" : "visible";
        cursorLine.setAttribute("visibility", visibility);
        cursorHalo.setAttribute("visibility", visibility);
        if (position === null) return;
        cursorLine.setAttribute("x1", xCenter(position));
        cursorLine.setAttribute("x2", xCenter(position));
        cursorHalo.setAttribute("cx", xCenter(position));
        cursorHalo.setAttribute("cy", yFor(shown[position - 1].lpEnd));
      },
      anchor(position) {
        const box = svg.getBoundingClientRect();
        return { x: box.left + xCenter(position), y: box.top + yFor(shown[position - 1].lpEnd) };
      },
    };
    SP.views.lp.highlight(SP.activeNumber);
  };

  SP.renderKdChart = report => {
    const host = byId("kd-chart");
    const { shown, matches } = report;
    if (!shown.length) {
      emptyChart(host, report.matchesNote);
      return;
    }
    const width = host.clientWidth;
    if (!width) return;
    const height = 300;
    const margin = { top: 44, right: 76, bottom: 40, left: 52 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const band = plotWidth / shown.length;
    const barWidth = clamp(band - 2, 2, 24);
    const cap = 12;
    const xCenter = position => margin.left + (position - 0.5) * band;
    const xBoundary = count => margin.left + count * band;
    const yFor = value => margin.top + plotHeight * (1 - Math.min(value, cap) / cap);
    const baselineY = yFor(0);
    const totals = SP.countOutcomes(matches);
    const averageKd = totals.deaths ? totals.kills / totals.deaths : 0;

    const svg = svgElement("svg", { width, height, viewBox: `0 0 ${width} ${height}`, class: "chart-svg", role: "img", "aria-label": `KD for each of the ${shown.length} matches in the period.` });
    for (const tick of [4, 8, 12]) {
      svgElement("line", { x1: margin.left, x2: margin.left + plotWidth, y1: yFor(tick), y2: yFor(tick), class: "grid" }, svg);
      svgElement("text", { x: margin.left - 10, y: yFor(tick) + 4, "text-anchor": "end" }, svg).textContent = tick === cap ? "12+" : String(tick);
    }
    svgElement("text", { x: margin.left - 10, y: baselineY + 4, "text-anchor": "end" }, svg).textContent = "0";
    SP.drawVersionMarkers(svg, xBoundary, 10, baselineY, 20);
    const wash = svgElement("rect", { x: 0, y: margin.top, width: band, height: plotHeight, class: "column-wash", visibility: "hidden" }, svg);
    const capLabels = SP.labelRow();
    for (const match of shown) {
      const left = xCenter(match.position) - barWidth / 2;
      const top = yFor(match.kd);
      const radius = Math.min(4, barWidth / 2, baselineY - top);
      if (baselineY - top > 0) svgElement("path", { d: SP.roundedTopBar(left, top, barWidth, baselineY, radius), class: `bar bar-${match.outcome}` }, svg);
      if (match.kd > cap) {
        svgElement("path", { d: `M${left - 1},${top + 16} L${left + barWidth + 1},${top + 10}`, class: "break" }, svg);
        const text = formatNumber(Math.round(match.kd * 10) / 10);
        const center = xCenter(match.position);
        if (capLabels(center - text.length * 3.3, center + text.length * 3.3)) {
          svgElement("text", { x: center, y: top - 7, "text-anchor": "middle", class: "label-strong" }, svg).textContent = text;
        }
      }
    }
    svgElement("line", { x1: margin.left, x2: margin.left + plotWidth, y1: baselineY, y2: baselineY, class: "axis-base" }, svg);
    svgElement("line", { x1: margin.left, x2: margin.left + plotWidth, y1: yFor(1), y2: yFor(1), class: "ref-even" }, svg);
    svgElement("text", { x: margin.left + plotWidth + 8, y: yFor(1) + 4 }, svg).textContent = "1.0 even";
    if (averageKd > 0) {
      svgElement("line", { x1: margin.left, x2: margin.left + plotWidth, y1: yFor(averageKd), y2: yFor(averageKd), class: "ref-average" }, svg);
      if (Math.abs(yFor(averageKd) - yFor(1)) >= 12) svgElement("text", { x: margin.left + plotWidth + 8, y: yFor(averageKd) + 4, class: "ref-label" }, svg).textContent = `${averageKd.toFixed(2)} avg`;
    }
    SP.drawMatchTicks(svg, xCenter, baselineY, margin.left);

    const handlePointer = event => {
      const position = SP.positionAtPointer(svg, event, margin.left, band);
      SP.setActive(position);
      SP.showMatchTooltip(shown[position - 1], event.clientX, event.clientY);
    };
    svg.addEventListener("pointermove", handlePointer);
    svg.addEventListener("pointerdown", handlePointer);
    svg.addEventListener("pointerleave", SP.clearActive);
    host.replaceChildren(svg);
    SP.views.kd = {
      highlight(position) {
        wash.setAttribute("visibility", position === null ? "hidden" : "visible");
        if (position !== null) wash.setAttribute("x", xBoundary(position - 1));
      },
      anchor(position) {
        const box = svg.getBoundingClientRect();
        return { x: box.left + xCenter(position), y: box.top + yFor(shown[position - 1].kd) };
      },
    };
    SP.views.kd.highlight(SP.activeNumber);
  };

  SP.renderSplitRows = (hostId, rows) => {
    const host = byId(hostId);
    if (!rows.length) {
      htmlElement("p", "empty-note", host).textContent = "No finished matches yet.";
      return;
    }
    for (const group of rows) {
      const { counts, total } = group;
      const row = htmlElement("div", "split-row", host);
      const name = htmlElement("div", "split-name", row);
      name.append(group.name);
      htmlElement("span", "split-count", name).textContent = group.sublabel || SP.plural(total, "match", "matches");
      const bar = htmlElement("div", "split-bar", row);
      bar.setAttribute("role", "img");
      bar.setAttribute("aria-label", `${group.name}: ${SP.countWords(counts.win, "win")}, ${SP.countWords(counts.draw, "draw")}, ${SP.countWords(counts.loss, "loss")}`);
      for (const outcome of ["win", "draw", "loss"]) {
        if (!counts[outcome]) continue;
        const segment = htmlElement("span", `seg seg-${outcome}`, bar);
        segment.style.flexGrow = String(counts[outcome]);
        segment.dataset.tip = `${group.name}\n${SP.countWords(counts[outcome], outcome)} of ${total}`;
      }
      const figures = htmlElement("div", "split-figures", row);
      htmlElement("strong", "", figures).textContent = `${counts.win}–${counts.loss}–${counts.draw}`;
      const rate = total ? `${Math.round((counts.win / total) * 100)}%` : "–";
      figures.append(group.showKd === false ? `${rate} won` : `${rate} · KD ${(counts.kills / Math.max(counts.deaths, 1)).toFixed(2)}`);
    }
    SP.bindTips(host, ".seg");
  };

  SP.renderBreakdowns = report => {
    const mostFirst = (left, right) => right.total - left.total;
    SP.renderSplitRows("by-mode", report.career.modes.map(group => ({ ...group, name: SP.MODE_NAMES[group.id] || SP.words(group.id) })).sort(mostFirst));
    SP.renderSplitRows("by-map", report.career.maps.map(group => ({ ...group, name: SP.words(group.id) })).sort(mostFirst));
  };

  SP.renderMatchTable = report => {
    const { shown } = report;
    byId("table-lede").textContent = "Every match in the period. Point at a row to find the match in the charts. Humans are players at match start, your team v enemy team. A KD marked * had no deaths.";
    const body = byId("match-rows");
    const rowByPosition = new Map();
    const addCell = (row, text, className) => {
      const cell = htmlElement("td", className || "", row);
      cell.textContent = text;
      return cell;
    };
    if (!shown.length) {
      const cell = addCell(htmlElement("tr", "", body), report.matchesNote, "muted-cell");
      cell.colSpan = 12;
    }
    for (const match of shown) {
      const row = htmlElement("tr", "", body);
      row.dataset.position = String(match.position);
      addCell(row, `#${match.number}`, "num");
      addCell(row, `${SP.dayLabel(match.utc)}, ${SP.clockLabel(match.utc)}`);
      addCell(row, match.version);
      addCell(row, match.modeName);
      addCell(row, SP.words(match.map));
      const result = htmlElement("span", "result", htmlElement("td", "", row));
      const chip = htmlElement("span", `chip chip-${match.outcome}`, result);
      chip.textContent = SP.OUTCOME_LETTERS[match.outcome];
      chip.setAttribute("aria-hidden", "true");
      result.append(SP.OUTCOME_WORDS[match.outcome]);
      addCell(row, match.scoreText, match.scoreText === "–" ? "num muted-cell" : "num");
      addCell(row, String(match.kills), "num");
      addCell(row, String(match.deaths), "num");
      addCell(row, match.deaths === 0 ? `${match.kills}*` : match.kd.toFixed(2), "num");
      addCell(row, `${match.teamHumans} v ${match.enemyHumans}`, "num");
      const lpCell = addCell(row, `${formatNumber(match.lpStart)} → ${formatNumber(match.lpEnd)}`, "num");
      htmlElement("span", "lp-delta", lpCell).textContent = formatSigned(match.lpEnd - match.lpStart);
      rowByPosition.set(match.position, row);
    }
    body.addEventListener("pointerover", event => {
      const row = event.target.closest("tr");
      if (row && row.dataset.position) SP.setActive(Number(row.dataset.position));
    });
    body.addEventListener("pointerleave", () => SP.setActive(null));
    SP.views.table = {
      highlight(position) {
        for (const [rowPosition, row] of rowByPosition) row.classList.toggle("is-active", rowPosition === position);
      },
    };
  };
})();
