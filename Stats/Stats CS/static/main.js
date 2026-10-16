(() => {
  "use strict";

  const SP = window.StatsPolygun;
  // PlayFab IDs are hex numbers without leading zeros: 16 characters for most accounts, 11 to 15 for about 6% (TE, 2026-09-18).
  const PLAYFAB_ID = /^[0-9A-F]{11,16}$/;
  // Critical Strike names run up to 23 characters (TE, 2026-10-14), so they overlap PlayFab IDs in length: a PlayFab ID is
  // checked first, and an F- or Bot_ match ID is never read as a name.
  const NAME_MAX = 23;
  // A match ID is anything longer than a name that is not a PlayFab ID: F-<uuid>, the same with a _<hex> tail,
  // F-SquadLocalMatch<PlayFabID><digits> or Unknown_<PlayFabID>_<n>_<digits>_<hex>. The server checks it again.
  const MATCH_ID = /^[A-Za-z0-9_-]{8,120}$/;
  const SHORT_MATCH_WINDOW = 100;

  const page = document.querySelector(".page");
  const form = SP.byId("search-form");
  const input = SP.byId("playfab-id");
  const searchButton = form.querySelector("button");
  const status = SP.byId("status");
  const badge = SP.byId("badge");
  const toTop = SP.byId("to-top");
  const rail = SP.byId("rail");
  const playersHost = SP.byId("rail-players");
  const top = SP.byId("player-top");
  const matchZone = SP.byId("match-zone");
  const matchTop = SP.byId("match-top");
  const periodTop = SP.byId("period-top");
  const zone = SP.byId("period-zone");
  const host = SP.byId("report");
  const playerTemplate = SP.byId("player-template");
  const periodTemplate = SP.byId("period-template");
  const reportTemplate = SP.byId("report-template");
  const matchTemplate = SP.byId("match-template");
  const railGroups = { player: ["rail-career", "rail-period"], match: ["rail-match"] };

  const chartRenderers = [SP.renderLevelChart, SP.renderLeagueChart, SP.renderKdChart, SP.renderWeaponHeat, SP.renderPowerGap, SP.renderSearchTimeline, SP.renderTimePerDay, SP.renderHourGrid];
  // Open or closed per card for this visit, so a card keeps its state when the period or the player changes.
  const cardOpen = new Map();
  // Everything searched this visit, players and matches together, in search order, so the rail moves between both.
  // The key carries the kind, so a match ID can never collide with a PlayFab ID. Page memory only; a refresh clears it.
  const held = new Map();
  const heldKey = (kind, id) => `${kind}:${id}`;
  // A match ID is far longer than the rail is wide, and the tail is the part that tells two of them apart.
  const shortId = id => (id.length > 24 ? `${id.slice(0, 12)}…${id.slice(-9)}` : id);
  let current = null;
  let allTime = null;
  let career = null;
  let period = null;
  let busy = false;
  let lastWidth = 0;
  let frame = 0;
  let spyFrame = 0;

  const dayName = days => (days === 1 ? "Last day" : `Last ${SP.formatNumber(days)} days`);
  const matchName = count => (count === 1 ? "Last match" : `Last ${SP.formatNumber(count)} matches`);
  const periodKey = option => `${option.from}..${option.to}`;

  function makePeriod(from, to, preset, name) {
    const matchCount = career.days.reduce((sum, day) => (day.key >= from && day.key <= to ? sum + day.count : sum), 0);
    return { from, to, preset, name, matchCount, tooMany: matchCount > SP.PERIOD_MATCH_LIMIT, label: SP.periodLabel(from, to), lastMatches: null };
  }

  // Day and match options count back from the player's last match, so a player who stopped months ago still opens on real matches.
  function daysPeriod(days) {
    const from = SP.dayKey(Math.max(SP.dayIndex(career.firstDay), SP.dayIndex(career.lastMatchDay) - days + 1));
    return makePeriod(from, career.lastMatchDay, `days-${days}`, dayName(days));
  }

  function matchesPeriod(count) {
    let remaining = count;
    let from = career.lastMatchDay;
    for (let index = career.days.length - 1; index >= 0 && remaining > 0; index -= 1) {
      remaining -= career.days[index].count;
      from = career.days[index].key;
    }
    return { ...makePeriod(from, career.lastMatchDay, `matches-${count}`, matchName(count)), matchCount: count, tooMany: count > SP.PERIOD_MATCH_LIMIT, lastMatches: count };
  }

  // Day options follow how many days the career spans, match options follow how many matches it has; All time is always there.
  function periodOptions() {
    const span = SP.dayIndex(career.lastMatchDay) - SP.dayIndex(career.firstDay) + 1;
    const limit = SP.PERIOD_MATCH_LIMIT;
    const dayCounts = span > 30 ? [7, 30] : span > 7 ? [7, span] : [span];
    const matchCounts = career.matchCount > limit ? [SHORT_MATCH_WINDOW, limit]
      : career.matchCount > SHORT_MATCH_WINDOW ? [SHORT_MATCH_WINDOW, career.matchCount]
      : career.matchCount ? [career.matchCount] : [];
    return {
      days: dayCounts.map(daysPeriod),
      matches: matchCounts.map(matchesPeriod),
      all: makePeriod(career.firstDay, career.lastDay, "all", "All time"),
    };
  }

  // All time up to 300 matches; otherwise the first day option when it fits the match charts; otherwise Last 100 matches.
  function defaultPeriod(options) {
    if (career.matchCount <= SP.PERIOD_MATCH_LIMIT) return options.all;
    return options.days[0].matchCount <= SP.PERIOD_MATCH_LIMIT ? options.days[0] : options.matches[0];
  }

  function renderPresets(options) {
    const presetsHost = SP.byId("period-presets");
    for (const group of [options.days, options.matches, [options.all]]) {
      if (!group.length) continue;
      const groupElement = SP.htmlElement("div", "preset-group", presetsHost);
      for (const option of group) {
        const button = SP.htmlElement("button", "chip-button", groupElement);
        button.type = "button";
        button.dataset.preset = option.preset;
        button.textContent = option.name;
        button.addEventListener("click", () => setPeriod(option));
      }
    }
  }

  function bindDates() {
    const fromInput = SP.byId("period-from");
    const toInput = SP.byId("period-to");
    const clampDay = day => (day < career.firstDay ? career.firstDay : day > career.lastDay ? career.lastDay : day);
    for (const field of [fromInput, toInput]) {
      field.min = career.firstDay;
      field.max = career.lastDay;
      field.addEventListener("change", () => {
        if (!fromInput.value || !toInput.value) return;
        const [from, to] = [fromInput.value, toInput.value].sort();
        setPeriod(makePeriod(clampDay(from), clampDay(to), "custom", null));
      });
    }
  }

  function prepareCards(container) {
    for (const card of container.querySelectorAll("details[data-card]")) {
      if (cardOpen.has(card.dataset.card)) card.open = cardOpen.get(card.dataset.card);
      card.addEventListener("toggle", () => {
        cardOpen.set(card.dataset.card, card.open);
        // A chart in a closed card has no width, so it draws when its card opens; one frame covers several toggles.
        if (!card.open || !card.querySelector(".chart")) return;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(renderCharts);
      });
    }
  }

  function renderCharts() {
    SP.renderCareerStrip(career, period, key => setPeriod(makePeriod(key, key, "day", null)));
    for (const render of chartRenderers) render(SP.report);
  }

  // Shows "Reflex verileri getiriyor · N s" and a loading bar in an element while a request runs. The server's finished queries
  // move the bar; while another search holds the server, the bar stands still and a chip says this one is in line.
  // The texts are Turkish (Batuhan's call) on an English page, so they carry lang="tr" for screen readers.
  // `firstLabel` replaces the usual label until the first {done, total} line: a match search spends its first ~5 s
  // finding the match across the whole history, and the bar cannot move before that.
  function ticker(element, firstLabel) {
    const started = Date.now();
    let opening = firstLabel;
    element.replaceChildren();
    const label = SP.htmlElement("span", "", element);
    const inLine = SP.htmlElement("span", "in-line", element);
    inLine.hidden = true;
    SP.svgElement("use", { href: "#icon-info" }, SP.svgElement("svg", { "aria-hidden": "true" }, inLine));
    inLine.append("Şu anda sıradasınız");
    const track = SP.htmlElement("span", "loading-track", element);
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-label", "Yükleniyor");
    for (const part of [label, inLine, track]) part.lang = "tr";
    const fill = SP.htmlElement("span", "loading-fill", track);
    const paint = () => { label.textContent = `${opening || "Reflex verileri getiriyor"} · ${Math.round((Date.now() - started) / 1000)} s`; };
    const fillTo = fraction => {
      fill.style.width = `${fraction * 100}%`;
      track.setAttribute("aria-valuenow", String(Math.round(fraction * 100)));
    };
    paint();
    fillTo(0);
    const timer = setInterval(paint, 1000);
    return {
      // One server event: {waiting} shows or hides the chip, {done, total} fills this request's share of the bar, from `from` to `to`.
      step(event, from, to) {
        inLine.hidden = !event.waiting;
        if (event.total) {
          fillTo(from + (to - from) * event.done / event.total);
          if (opening) {
            opening = "";
            paint();
          }
        }
      },
      stop() { clearInterval(timer); },
    };
  }

  // One request in flight at a time: every control that could start another one is disabled meanwhile.
  function setBusy(value) {
    busy = value;
    page.setAttribute("aria-busy", String(value));
    for (const control of [input, searchButton, ...document.querySelectorAll(".chip-button, .rail-player, .period-dates input")]) control.disabled = value;
  }

  function renderHeld() {
    playersHost.replaceChildren();
    for (const entry of held.values()) {
      const button = SP.htmlElement("button", "rail-player", SP.htmlElement("li", "", playersHost));
      button.type = "button";
      button.setAttribute("aria-pressed", String(entry === current));
      const name = SP.htmlElement("span", "rail-player-name", button);
      SP.svgElement("use", { href: entry.kind === "match" ? "#icon-gamepad" : "#icon-id-badge" },
        SP.svgElement("svg", { class: "rail-icon", "aria-hidden": "true" }, name));
      SP.htmlElement("span", "", name).textContent = entry.label;
      SP.htmlElement("code", "", button).textContent = shortId(entry.id);
      button.title = `${entry.kind === "match" ? "Match" : "Player"} ${entry.id}`;
      button.addEventListener("click", () => {
        if (busy || entry === current) return;
        switchTo(entry);
      });
    }
  }

  // Marks the rail link of the last section whose top is within 40 px of the window top; anchor jumps land 16 to 24 px down.
  function markSection() {
    let currentLink = null;
    // Only the rail groups on screen count: the other report's links still point at elements that are merely hidden.
    const links = [...rail.querySelectorAll("a[href^='#']")].filter(link => !link.closest(".rail-group").hidden);
    for (const link of links) {
      const target = document.querySelector(link.getAttribute("href"));
      if (target && target.getBoundingClientRect().top <= 40) currentLink = link;
    }
    // At the very top nothing has passed the line yet; the first link stands for the player header and totals.
    if (!currentLink) currentLink = links[0];
    for (const link of links) link.setAttribute("aria-current", String(link === currentLink));
    for (const group of rail.querySelectorAll(".rail-group")) group.classList.toggle("is-active", group.contains(currentLink));
  }

  function renderPeriod() {
    const scroll = window.scrollY;
    SP.resetViews();
    SP.report = SP.buildReport(allTime, career, current.periods.get(periodKey(period)), period);
    host.replaceChildren(reportTemplate.content.cloneNode(true));
    prepareCards(host);
    const title = period.name ? `${period.name} · ${period.label}` : period.label;
    const presetButtons = [...periodTop.querySelectorAll("[data-preset]")];
    for (const button of presetButtons) button.setAttribute("aria-pressed", String(button.dataset.preset === period.preset));
    // A hand-picked range (From/To or a day on the strip) has no button, so the date boxes carry the mark.
    periodTop.querySelector(".period-dates").classList.toggle("is-picked", !presetButtons.some(button => button.dataset.preset === period.preset));
    SP.byId("period-from").value = period.from;
    SP.byId("period-to").value = period.to;
    SP.byId("period-summary").textContent = (period.lastMatches ? title : `${title} · ${SP.plural(period.matchCount, "match", "matches")}`)
      + (period.tooMany ? `. Match charts need ${SP.PERIOD_MATCH_LIMIT} or fewer; pick a shorter period.` : "");

    const report = SP.report;
    SP.renderForm(report);
    SP.renderMatchTable(report);
    SP.renderHeatLegend();
    SP.renderUpgrades(report);
    SP.renderDayTable(report);
    renderCharts();
    for (const [id, view] of [["level-chart", "level"], ["lp-chart", "lp"], ["kd-chart", "kd"], ["weapon-heat", "weapons"], ["power-gap", "power"]]) SP.attachKeyboard(SP.byId(id), view);
    lastWidth = SP.byId("career-strip").clientWidth;
    window.scrollTo(0, scroll);
    markSection();
  }

  // A period seen before shows from memory; a new one loads first, and the old one stays on screen if that fails.
  async function setPeriod(next) {
    if (busy) return;
    const entry = current;
    if (!entry.periods.has(periodKey(next))) {
      setBusy(true);
      const progress = ticker(SP.byId("period-summary"));
      try {
        entry.periods.set(periodKey(next), await SP.source.period(entry.id, next.from, next.to, !next.tooMany, event => progress.step(event, 0, 1)));
      } catch (error) {
        progress.stop();
        setBusy(false);
        SP.byId("period-summary").textContent = error.message;
        return;
      }
      progress.stop();
      setBusy(false);
    }
    period = next;
    entry.period = next;
    renderPeriod();
  }

  // The page shows one report at a time, a player's or a match's, and the rail shows only that report's links.
  function showZone(which) {
    rail.hidden = false;
    top.hidden = which !== "player";
    zone.hidden = which !== "player";
    matchZone.hidden = which !== "match";
    SP.byId("rail-players-group").hidden = held.size === 0;
    for (const [name, ids] of Object.entries(railGroups)) {
      for (const id of ids) SP.byId(id).hidden = name !== which;
    }
  }

  // What the rail calls a match: its mode and map, the two facts the heading shows.
  function matchLabel(match) {
    const first = match.players[0];
    if (!first || !first.mode) return "Match";
    return `${SP.MODE_NAMES[first.mode] || SP.words(first.mode)} · ${SP.words(first.map || "")}`.trim();
  }

  // Typing a match ID always asks the server again and replaces the held copy, exactly like a player ID;
  // a rail click never does, because it goes straight to switchTo.
  async function showMatch(matchId) {
    if (busy) return;
    setBusy(true);
    const progress = ticker(status, "Maç aranıyor");
    try {
      const data = await SP.source.match(matchId, event => progress.step(event, 0, 1));
      const key = heldKey("match", matchId);
      const entry = { kind: "match", key, id: matchId, data, label: matchLabel(data), scrollY: 0 };
      held.set(key, entry);
      progress.stop();
      setBusy(false);
      switchTo(entry);
    } catch (error) {
      progress.stop();
      setBusy(false);
      status.textContent = error.message;
    }
  }

  function showHeldMatch(entry) {
    matchTop.replaceChildren(matchTemplate.content.cloneNode(true));
    prepareCards(matchTop);
    showZone("match");
    SP.renderMatch(entry.data, search, showMatch);
  }

  function showHeldPlayer(entry) {
    allTime = entry.allTime;
    career = entry.career;
    period = entry.period;
    top.replaceChildren(playerTemplate.content.cloneNode(true));
    periodTop.replaceChildren(periodTemplate.content.cloneNode(true));
    prepareCards(top);
    showZone("player");
    SP.renderPlayer(allTime);
    SP.renderSummary(career, allTime.finalLeaguePoints, allTime.vtd, allTime.level);
    // The Career group never changes with the period, so it renders once per player.
    const careerReport = { career, raw: { resources: allTime.resources, currencyDays: allTime.balances } };
    SP.renderBreakdowns(careerReport);
    SP.renderPowerBuckets(careerReport);
    SP.renderWeapons(careerReport);
    SP.renderEconomy(careerReport);
    SP.renderPurchases(career, allTime.vtd);
    renderPresets(entry.options);
    bindDates();
    renderPeriod();
  }

  function switchTo(entry) {
    // Where the page was left, so coming back to this player or match through the rail lands where it was.
    if (current) current.scrollY = window.scrollY;
    status.textContent = "";
    current = entry;
    input.value = entry.id;
    if (entry.kind === "match") showHeldMatch(entry);
    else showHeldPlayer(entry);
    renderHeld();
    // renderPeriod puts the old report's scroll back before this runs, so this has the last word.
    window.scrollTo(0, entry.scrollY || 0);
    markSection();
  }

  // Typing a name or an ID always asks the source again and replaces the held copy; a player click in the rail never does.
  async function search(value) {
    const text = String(value || "").trim();
    // Code points, like the server and TE count them.
    const isPlayer = PLAYFAB_ID.test(text.toUpperCase());
    const isName = !isPlayer && text.length > 0 && [...text].length <= NAME_MAX && !/^(F-|Bot_)/.test(text);
    if (!isName && !isPlayer) {
      if (MATCH_ID.test(text)) {
        await showMatch(text);
        return;
      }
      status.textContent = `Type a player name (up to ${NAME_MAX} characters), a PlayFab ID (11 to 16 characters: digits 0–9 and letters A–F), or a match ID.`;
      return;
    }
    if (busy) return;
    if (!isName) input.value = text.toUpperCase();
    setBusy(true);
    const progress = ticker(status);
    try {
      let id = text.toUpperCase();
      let note = "";
      // A name is looked up first and then searched like its ID; the lookup does not move the bar.
      if (isName) {
        const found = await SP.source.find(text, event => progress.step(event, 0, 0));
        id = found.playfabId;
        if (found.shared > 1) note = `${SP.formatNumber(found.shared)} accounts have used the name ${text}; this is the one that played last. For another one, search by PlayFab ID.`;
      }
      // The career answer fills the first half of the bar, the period answer the second half.
      const key = heldKey("player", id);
      const entry = { kind: "player", key, id, label: "", scrollY: 0,
        allTime: await SP.source.allTime(id, event => progress.step(event, 0, 0.5)), career: null, options: null, period: null, periods: new Map() };
      entry.label = entry.allTime.player.name || "Unknown";
      // periodOptions and defaultPeriod read the module-level career, which switchTo sets again from the entry.
      career = entry.career = SP.buildCareer(entry.allTime);
      entry.options = periodOptions();
      const first = defaultPeriod(entry.options);
      entry.periods.set(periodKey(first), await SP.source.period(id, first.from, first.to, !first.tooMany, event => progress.step(event, 0.5, 1)));
      entry.period = first;
      held.set(key, entry);
      progress.stop();
      setBusy(false);
      switchTo(entry);
      status.textContent = note;
    } catch (error) {
      progress.stop();
      setBusy(false);
      if (current) career = current.career;
      status.textContent = error.message;
    }
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    SP.source.begin();
    search(input.value);
  });

  // A section link opens its card first, so the jump never lands on a closed card.
  rail.addEventListener("click", event => {
    const link = event.target.closest("a[href^='#']");
    const target = link && document.querySelector(link.getAttribute("href"));
    const card = target && target.closest("details");
    if (card) card.open = true;
  });

  window.addEventListener("scroll", () => {
    toTop.hidden = window.scrollY < window.innerHeight;
    if (!current) return;
    cancelAnimationFrame(spyFrame);
    spyFrame = requestAnimationFrame(markSection);
  }, { passive: true });

  toTop.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });

  new ResizeObserver(() => {
    const strip = SP.byId("career-strip");
    if (!strip || !SP.report || strip.clientWidth === lastWidth) return;
    lastWidth = strip.clientWidth;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(renderCharts);
  }).observe(page);

  // The home page opens the last game picked here; storage can be blocked, and then it just shows the cards again.
  try {
    localStorage.setItem("stats-game", "cs");
  } catch (error) {
    // Nothing to keep.
  }

  badge.textContent = SP.source.badge || "";
  badge.hidden = !SP.source.badge;

  // The preview source lists its accounts; they load at start and the first one shows. The real page starts empty.
  (async () => {
    for (const id of SP.source.samples || []) await search(id);
    const first = held.get(heldKey("player", (SP.source.samples || [])[0]));
    if (first && first !== current) switchTo(first);
    if (!current) input.focus();
  })();
})();
