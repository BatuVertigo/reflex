(() => {
  "use strict";

  const SP = window.StatsPolygun;
  // PlayFab IDs are hex numbers without leading zeros: 16 characters for most accounts, 11 to 15 for about 6% (TE, 2026-09-18).
  const PLAYFAB_ID = /^[0-9A-F]{11,16}$/;
  // Batuhan's rule: up to 10 characters is a player name (the longest in TE is 10), 11 to 16 hex characters is a PlayFab ID, anything else is refused.
  const NAME_MAX = 10;
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
  const periodTop = SP.byId("period-top");
  const zone = SP.byId("period-zone");
  const host = SP.byId("report");
  const playerTemplate = SP.byId("player-template");
  const periodTemplate = SP.byId("period-template");
  const reportTemplate = SP.byId("report-template");

  const chartRenderers = [SP.renderLeagueChart, SP.renderKdChart, SP.renderWeaponHeat, SP.renderPowerGap, SP.renderSearchTimeline, SP.renderTimePerDay, SP.renderHourGrid];
  // Open or closed per card for this visit, so a card keeps its state when the period or the player changes.
  const cardOpen = new Map();
  // Every player searched this visit, by PlayFab ID, in search order. Page memory only, so a refresh clears it.
  const held = new Map();
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
  function ticker(element) {
    const started = Date.now();
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
    const paint = () => { label.textContent = `Reflex verileri getiriyor · ${Math.round((Date.now() - started) / 1000)} s`; };
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
        if (event.total) fillTo(from + (to - from) * event.done / event.total);
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

  function renderPlayers() {
    playersHost.replaceChildren();
    for (const entry of held.values()) {
      const button = SP.htmlElement("button", "rail-player", SP.htmlElement("li", "", playersHost));
      button.type = "button";
      button.setAttribute("aria-pressed", String(entry === current));
      SP.htmlElement("span", "", button).textContent = entry.allTime.player.name || "Unknown";
      SP.htmlElement("code", "", button).textContent = entry.id;
      button.addEventListener("click", () => {
        if (busy || entry === current) return;
        switchTo(entry);
      });
    }
  }

  // Marks the rail link of the last section whose top is within 40 px of the window top; anchor jumps land 16 to 24 px down.
  function markSection() {
    let currentLink = null;
    const links = [...rail.querySelectorAll("a[href^='#']")];
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
    for (const [id, view] of [["lp-chart", "lp"], ["kd-chart", "kd"], ["weapon-heat", "weapons"], ["power-gap", "power"]]) SP.attachKeyboard(SP.byId(id), view);
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

  function switchTo(entry) {
    status.textContent = "";
    current = entry;
    allTime = entry.allTime;
    career = entry.career;
    period = entry.period;
    input.value = entry.id;
    top.replaceChildren(playerTemplate.content.cloneNode(true));
    periodTop.replaceChildren(periodTemplate.content.cloneNode(true));
    prepareCards(top);
    for (const element of [rail, zone]) element.hidden = false;
    SP.renderPlayer(allTime);
    SP.renderSummary(career, allTime.finalLeaguePoints, allTime.vtd);
    // The Career group never changes with the period, so it renders once per player.
    const careerReport = { career, raw: { resources: allTime.resources, currencyDays: allTime.balances } };
    SP.renderBreakdowns(careerReport);
    SP.renderPowerBuckets(careerReport);
    SP.renderWeapons(careerReport);
    SP.renderEconomy(careerReport);
    renderPresets(entry.options);
    bindDates();
    renderPlayers();
    renderPeriod();
    window.scrollTo(0, 0);
  }

  // Typing a name or an ID always asks the source again and replaces the held copy; a player click in the rail never does.
  async function search(value) {
    const text = String(value || "").trim();
    // Code points, like the server and TE count them.
    const isName = text.length > 0 && [...text].length <= NAME_MAX;
    if (!isName && !PLAYFAB_ID.test(text.toUpperCase())) {
      status.textContent = `Type a player name (up to ${NAME_MAX} characters) or a PlayFab ID (11 to 16 characters: digits 0–9 and letters A–F).`;
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
        if (found.shared > 1) note = `${SP.formatNumber(found.shared)} players share the name ${text}; this is the closest match. For another one, search by PlayFab ID.`;
      }
      // The career answer fills the first half of the bar, the period answer the second half.
      const entry = { id, allTime: await SP.source.allTime(id, event => progress.step(event, 0, 0.5)), career: null, options: null, period: null, periods: new Map() };
      // periodOptions and defaultPeriod read the module-level career, which switchTo sets again from the entry.
      career = entry.career = SP.buildCareer(entry.allTime);
      entry.options = periodOptions();
      const first = defaultPeriod(entry.options);
      entry.periods.set(periodKey(first), await SP.source.period(id, first.from, first.to, !first.tooMany, event => progress.step(event, 0.5, 1)));
      entry.period = first;
      held.set(id, entry);
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

  badge.textContent = SP.source.badge || "";
  badge.hidden = !SP.source.badge;

  // The preview source lists its accounts; they load at start and the first one shows. The real page starts empty.
  (async () => {
    for (const id of SP.source.samples || []) await search(id);
    const first = held.get((SP.source.samples || [])[0]);
    if (first && first !== current) switchTo(first);
    if (!current) input.focus();
  })();
})();
