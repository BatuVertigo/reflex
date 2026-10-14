(() => {
  "use strict";

  const SP = window.StatsPolygun;
  const { htmlElement, svgElement, formatNumber, byId } = SP;

  const RARITIES = ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic"];
  const SOURCE_NAMES = {
    chest_open: "Opening chests", collect_milestone: "Milestones", weekly_offer: "Weekly offer", mission: "Missions", daily_login: "Daily login",
    battle_end_rewards: "Match rewards", battle_end_rewards_ad: "Match rewards (ad)", rewarded_offer: "Rewarded offer", new_player_items: "New player gift",
    timed_item_collect: "Timed reward", daily_deal_free: "Free daily deal", daily_deal_purchase: "Daily deal purchase", live_game_mode: "Live game mode",
    free_chest: "Free chest", free_booster: "Free booster", daily_spin: "Daily spin", clan: "Clan", draw: "Lucky draw", upgrade: "Upgrades",
    buy_attachment: "Attachment", buy: "Buying an item", iap: "Purchases", insufficient_card_buy: "Buying missing cards", booster_open: "Opening booster packs",
    win_streak_recover: "Win streak recovery", temporary_boost: "Temporary boost", rent: "Renting", login_recover_streak: "Login streak recovery",
    battle_pass_level_buy: "Battle pass levels", currency_based_offer: "Currency offer", chest_buy: "Buying chests", booster_buy: "Buying booster packs",
    name_change: "Name change", inbox_rewards: "Inbox rewards", clan_treasure_autocollect: "Clan treasure", lucky_draw_compensation: "Lucky draw compensation",
  };
  const ACTION_WORDS = { boost: "Boost", equip_trial: "Trial", rent: "Rent", buy: "Buy", unlock: "Unlock" };
  const CURRENCY_WORDS = { SoftCurrency: "soft", HardCurrency: "hard", LuckyDraw: "lucky draw tickets" };
  const sourceName = source => (/^clan_treasure/.test(source) ? "Clan treasure" : SOURCE_NAMES[source] || SP.words(source));

  // --- earnings & spending ---

  SP.renderEconomy = report => {
    const resources = report.raw.resources;
    const total = (event, item) => resources.filter(row => row[0] === event && row[3] === item).reduce((sum, row) => sum + (row[5] || 0), 0);
    const currencyDays = report.raw.currencyDays;
    const lastBalance = item => {
      const rows = currencyDays.filter(row => row[1] === item);
      return rows.length ? rows[rows.length - 1][4] : null;
    };
    const balanceText = item => (lastBalance(item) === null ? "" : ` · ${formatNumber(lastBalance(item))} now`);
    const packCount = itemType => resources.filter(row => row[0] === "earn" && row[2] === itemType).reduce((sum, row) => sum + (row[5] || 0), 0);

    // The four tiles are tabs: one pane shows at a time, soft currency first.
    const tabsHost = byId("economy-tabs");
    const tabs = [
      ["soft", "Soft currency earned", formatNumber(total("earn", "SoftCurrency")), `${formatNumber(total("spend", "SoftCurrency"))} spent${balanceText("SoftCurrency")}`],
      ["hard", "Hard currency earned", formatNumber(total("earn", "HardCurrency")), `${formatNumber(total("spend", "HardCurrency"))} spent${balanceText("HardCurrency")}`],
      ["chests", "Chests and booster packs", formatNumber(packCount("Chest") + packCount("BoosterPack")), `${SP.plural(packCount("Chest"), "chest", "chests")} · ${SP.plural(packCount("BoosterPack"), "pack", "packs")}`],
      ["spent", "Spent on", `${formatNumber(total("spend", "SoftCurrency"))} soft`, `${formatNumber(total("spend", "HardCurrency"))} hard`],
    ];
    const select = key => {
      for (const [id] of tabs) {
        byId(`economy-tab-${id}`).setAttribute("aria-selected", String(id === key));
        byId(`economy-${id}`).hidden = id !== key;
      }
    };
    for (const [id, label, value, sub] of tabs) {
      const tab = htmlElement("button", "mini-stat economy-tab", tabsHost);
      tab.type = "button";
      tab.id = `economy-tab-${id}`;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", `economy-${id}`);
      htmlElement("p", "stat-label", tab).textContent = label;
      htmlElement("p", "mini-value", tab).textContent = value;
      htmlElement("p", "mini-sub", tab).textContent = sub;
      tab.addEventListener("click", () => select(id));
    }
    select("soft");

    const earnSources = item => {
      const sources = new Map();
      for (const [event, source, , rowItem, rows, quantity] of resources) {
        if (event !== "earn" || rowItem !== item) continue;
        const name = sourceName(source);
        const entry = sources.get(name) || { name, rows: 0, quantity: 0 };
        entry.rows += rows || 0;
        entry.quantity += quantity || 0;
        sources.set(name, entry);
      }
      return [...sources.values()].filter(entry => entry.quantity > 0).sort((left, right) => right.quantity - left.quantity).map(entry => ({
        label: entry.name,
        sublabel: SP.plural(entry.rows, "time", "times"),
        value: entry.quantity,
        tip: `${entry.name}\n${formatNumber(entry.quantity)} ${CURRENCY_WORDS[item]} currency from ${SP.plural(entry.rows, "reward", "rewards")}`,
      }));
    };
    SP.renderBarList(byId("economy-soft"), earnSources("SoftCurrency"), "No soft currency logged.");
    SP.renderBarList(byId("economy-hard"), earnSources("HardCurrency"), "No hard currency logged.");

    const packs = new Map();
    for (const [event, source, itemType, item, , quantity] of resources) {
      if (event !== "earn" || (itemType !== "Chest" && itemType !== "BoosterPack")) continue;
      const entry = packs.get(item) || { item, itemType, rarity: String(item).split(" ")[0], quantity: 0, sources: new Map() };
      entry.quantity += quantity || 0;
      entry.sources.set(sourceName(source), (entry.sources.get(sourceName(source)) || 0) + (quantity || 0));
      packs.set(item, entry);
    }
    const rarityRank = rarity => (RARITIES.includes(rarity) ? RARITIES.indexOf(rarity) : RARITIES.length);
    SP.renderBarList(byId("economy-chests"), [...packs.values()]
      .sort((left, right) => (left.itemType === right.itemType ? 0 : left.itemType === "Chest" ? -1 : 1) || rarityRank(left.rarity) - rarityRank(right.rarity))
      .map(entry => {
        const sources = [...entry.sources.entries()].sort((left, right) => right[1] - left[1]);
        return {
          label: SP.words(entry.item),
          sublabel: sources.slice(0, 2).map(([name, quantity]) => `${name} ${quantity}`).join(" · "),
          value: entry.quantity,
          fillClass: RARITIES.includes(entry.rarity) ? `rarity-${rarityRank(entry.rarity) + 1}` : "",
          tip: [SP.words(entry.item), ...sources.map(([name, quantity]) => `${name}: ${quantity}`)].join("\n"),
        };
      }), "No chests or booster packs logged.");

    const spentHost = byId("economy-spent");
    const spendBySource = new Map();
    for (const [event, source, itemType, item, , quantity] of resources) {
      if (event !== "spend" || itemType !== "Currency") continue;
      const name = sourceName(source);
      const entry = spendBySource.get(name) || { source, parts: new Map() };
      entry.parts.set(item, (entry.parts.get(item) || 0) + (quantity || 0));
      spendBySource.set(name, entry);
    }
    // Earnings are all time, so upgrade and buy counts come from the all-time resources rows, not the period's inventory.
    const spendCount = source => Math.max(0, ...resources.filter(row => row[0] === "spend" && row[1] === source && row[2] === "Currency").map(row => row[4] || 0));
    const upgradeCount = spendCount("upgrade");
    const buyCount = spendCount("buy");
    if (!spendBySource.size) htmlElement("p", "empty-note", spentHost).textContent = "No spending logged.";
    for (const [name, entry] of spendBySource) {
      const row = htmlElement("div", "spend-row", spentHost);
      const nameCell = htmlElement("span", "spend-name", row);
      nameCell.append(name);
      let detail = "";
      if (entry.source === "upgrade") detail = SP.plural(upgradeCount, "upgrade", "upgrades");
      if (entry.source === "buy" && buyCount) detail = SP.plural(buyCount, "buy", "buys");
      if (detail) htmlElement("span", "bar-sublabel", nameCell).textContent = detail;
      htmlElement("span", "spend-value", row).textContent = [...entry.parts.entries()].map(([item, quantity]) => `${formatNumber(quantity)} ${CURRENCY_WORDS[item] || SP.words(item)}`).join(" + ");
    }
  };

  // --- purchases ---

  // A buy this close to a match counts as right after it or right before the next one (Batuhan, 2026-10-14).
  const NEAR_MATCH_SECONDS = 15 * 60;
  // The game logs these where it has no placement.
  const NO_PLACEMENT = new Set(["NO_DATA", "NONE", "None", "none", ""]);
  const money = value => `$${formatNumber(Math.round(value * 100) / 100)}`;
  const gapLabel = seconds => (seconds < 3600 ? `${Math.max(1, Math.round(seconds / 60))} min`
    : seconds < 48 * 3600 ? `${Math.round(seconds / 3600)} h` : `${formatNumber(Math.round(seconds / 86400))} days`);

  SP.renderPurchases = (career, vtd) => {
    const purchases = career.purchases;
    const usdTotal = purchases.reduce((sum, purchase) => sum + (purchase.usd || 0), 0);
    const afterMatch = purchases.filter(purchase => purchase.outcomeBefore && purchase.secondsSinceMatch !== null && purchase.secondsSinceMatch <= NEAR_MATCH_SECONDS);
    const beforeMatch = purchases.filter(purchase => !afterMatch.includes(purchase) && purchase.secondsToMatch !== null && purchase.secondsToMatch <= NEAR_MATCH_SECONDS);
    const afterCount = outcome => afterMatch.filter(purchase => purchase.outcomeBefore === outcome).length;
    const share = count => (purchases.length ? `${Math.round((count / purchases.length) * 100)}%` : "–");
    const webCount = purchases.filter(purchase => purchase.store === "web").length;

    byId("purchases-lede").textContent = career.purchasesFailed ? "Purchases did not load this time. Search the player again in a moment."
      : `Real-money buys logged in TE, in the app stores and the web store. USD is the price paid in dollars, or today's dollar price of the product when paid in another currency. `
        // VTD also counts buys TE never logged (before TE started, or lost); it leaves subscriptions out.
        + (vtd && usdTotal < vtd - 1 ? `TE logged ${money(usdTotal)} of the player's ${money(vtd)} VTD; the rest was bought before TE logged buys, or the event was lost. ` : "")
        + "Near a match means within 15 minutes.";

    const statsHost = byId("purchase-stats");
    const tiles = [
      ["Purchases", formatNumber(purchases.length), `${money(usdTotal)} · ${formatNumber(purchases.length - webCount)} app store, ${formatNumber(webCount)} web`],
      ["First and last", purchases.length ? SP.dayLabelWithYear(purchases[0].utc) : "–", purchases.length ? `last ${SP.dayLabelWithYear(purchases[purchases.length - 1].utc)}` : "No purchases"],
      ["Right after a match", share(afterMatch.length), `${afterCount("win")} after a win · ${afterCount("loss")} after a loss · ${afterCount("draw")} after a draw`],
      ["Right before a match", share(beforeMatch.length), `${formatNumber(purchases.length - afterMatch.length - beforeMatch.length)} not near a match`],
    ];
    for (const [label, value, sub] of tiles) {
      const tile = htmlElement("div", "mini-stat", statsHost);
      htmlElement("p", "stat-label", tile).textContent = label;
      htmlElement("p", "mini-value", tile).textContent = value;
      htmlElement("p", "mini-sub", tile).textContent = sub;
    }

    const body = byId("purchase-rows");
    const addCell = (row, text, className) => {
      const cell = htmlElement("td", className || "", row);
      cell.textContent = text;
      return cell;
    };
    if (!purchases.length) {
      addCell(htmlElement("tr", "", body), career.purchasesFailed ? "Purchases did not load." : "No purchases logged.", "muted-cell").colSpan = 8;
    }
    // Newest first: the latest buys are what someone looking at a whale asks about.
    for (const purchase of [...purchases].reverse()) {
      const row = htmlElement("tr", "", body);
      addCell(row, `${SP.dayLabelWithYear(purchase.utc)}, ${SP.clockLabel(purchase.utc)}`);
      addCell(row, purchase.product);
      addCell(row, purchase.store === "web" ? "Web" : "App store");
      addCell(row, purchase.price === null ? "–" : `${formatNumber(purchase.price)} ${purchase.currency || ""}`.trim(), "num");
      addCell(row, purchase.usd === null ? "–" : money(purchase.usd), purchase.usd === null ? "num muted-cell" : "num money-value");
      const where = [purchase.placement, purchase.windowName].filter(part => part && !NO_PLACEMENT.has(part)).map(SP.words);
      addCell(row, purchase.store === "web" ? "Web store" : where.join(" · ") || "–", where.length || purchase.store === "web" ? "" : "muted-cell");
      const near = seconds => seconds !== null && seconds <= NEAR_MATCH_SECONDS;
      if (purchase.outcomeBefore && purchase.secondsSinceMatch !== null) {
        const cell = htmlElement("td", near(purchase.secondsSinceMatch) ? "" : "muted-cell", row);
        const result = htmlElement("span", "result", cell);
        const chip = htmlElement("span", `chip chip-${purchase.outcomeBefore}`, result);
        chip.textContent = SP.OUTCOME_LETTERS[purchase.outcomeBefore];
        chip.setAttribute("aria-hidden", "true");
        result.append(`${SP.OUTCOME_WORDS[purchase.outcomeBefore]}, ${gapLabel(purchase.secondsSinceMatch)} before`);
      } else {
        addCell(row, "None", "muted-cell");
      }
      addCell(row, purchase.secondsToMatch === null ? "None" : `${gapLabel(purchase.secondsToMatch)} later`, near(purchase.secondsToMatch) ? "" : "muted-cell");
    }
  };

  // --- upgrades & loadout ---

  const matchesBefore = (matches, time) => {
    let count = 0;
    for (const match of matches) {
      if (match.utc > time) break;
      count += 1;
    }
    return count;
  };

  const sparkline = (entry, maxLevel, matchCount) => {
    const width = 180;
    const height = 30;
    const padding = 4;
    const xFor = count => padding + (count / Math.max(matchCount, 1)) * (width - padding * 2);
    const yFor = level => height - padding - (level / Math.max(maxLevel, 1)) * (height - padding * 2);
    const svg = svgElement("svg", { width, height, viewBox: `0 0 ${width} ${height}`, class: "spark", "aria-hidden": "true" });
    svgElement("line", { x1: padding, x2: width - padding, y1: height - padding, y2: height - padding, class: "spark-base" }, svg);
    let pathData = `M${xFor(0)},${yFor(entry.steps[0].before)}`;
    for (const step of entry.steps) pathData += ` H${xFor(step.at)} V${yFor(step.after)}`;
    pathData += ` H${xFor(matchCount)}`;
    svgElement("path", { d: pathData, class: "spark-line" }, svg);
    svgElement("circle", { cx: xFor(matchCount), cy: yFor(entry.steps[entry.steps.length - 1].after), r: 3, class: "spark-dot" }, svg);
    return svg;
  };

  SP.renderUpgrades = report => {
    const inventory = report.raw.inventory;
    const groups = new Map();
    for (const [time, action, item, category, rarity, before, after] of inventory) {
      if (action !== "upgrade") continue;
      const entry = groups.get(item) || { item, category, rarity, steps: [] };
      entry.steps.push({ time, before: before ?? 0, after: after ?? 0, at: matchesBefore(report.matches, time) });
      groups.set(item, entry);
    }
    const rows = [...groups.values()].sort((left, right) => right.steps.length - left.steps.length || String(left.item).localeCompare(String(right.item)));
    const maxLevel = Math.max(1, ...rows.flatMap(entry => entry.steps.map(step => step.after)));
    const body = byId("upgrade-rows");
    const addCell = (row, text, className) => {
      const cell = htmlElement("td", className || "", row);
      cell.textContent = text;
      return cell;
    };
    if (!rows.length) {
      const cell = htmlElement("td", "muted-cell", htmlElement("tr", "", body));
      cell.colSpan = 6;
      cell.textContent = "No upgrades logged.";
    }
    for (const entry of rows) {
      const row = htmlElement("tr", "", body);
      addCell(row, SP.itemName(entry.item));
      addCell(row, SP.words(entry.category || "–"));
      addCell(row, entry.rarity || "–");
      addCell(row, String(entry.steps.length), "num");
      addCell(row, `${entry.steps[0].before} → ${entry.steps[entry.steps.length - 1].after}`, "num");
      htmlElement("td", "spark-cell", row).appendChild(sparkline(entry, maxLevel, report.matches.length));
      row.dataset.tip = [SP.itemName(entry.item), ...entry.steps.slice(-12).map(step => `${SP.dayLabel(step.time)}, ${SP.clockLabel(step.time)} UTC: lvl ${step.before} → ${step.after}`)].join("\n");
    }
    SP.bindTips(body, "tr");

    const specials = inventory.filter(row => ACTION_WORDS[row[1]]);
    const specialBody = byId("special-rows");
    const shownSpecials = specials.slice(-60);
    if (!specials.length) {
      const cell = htmlElement("td", "muted-cell", htmlElement("tr", "", specialBody));
      cell.colSpan = 5;
      cell.textContent = "No boosts, trials, rentals or buys logged.";
    }
    for (const [time, action, item, category, , , after] of shownSpecials) {
      const row = htmlElement("tr", "", specialBody);
      addCell(row, `${SP.dayLabel(time)}, ${SP.clockLabel(time)}`);
      addCell(row, ACTION_WORDS[action]);
      addCell(row, SP.itemName(item));
      addCell(row, SP.words(category || "–"));
      addCell(row, after > 0 ? `lvl ${after}` : "–", after > 0 ? "num" : "num muted-cell");
    }
    const equips = inventory.filter(row => row[1] === "equip");
    const boosters = equips.filter(row => ["Damage", "Defence", "Utility"].includes(row[3]) || /^Booster/.test(row[2])).length;
    const masks = equips.filter(row => row[3] === "Helmet" || /^mask_/.test(row[2])).length;
    byId("equip-summary").textContent = `${specials.length > shownSpecials.length ? `The last ${shownSpecials.length} of ${specials.length}. ` : ""}Levels show the temporary level; a dash means the game logged no usable level. `
      + `Also ${SP.plural(equips.length, "equip", "equips")}: ${SP.plural(boosters, "booster", "boosters")}, ${SP.plural(equips.length - boosters - masks, "weapon or character", "weapons and characters")}, ${SP.plural(masks, "mask", "masks")}.`;
  };

  // --- day by day ---

  SP.renderDayTable = report => {
    const sessions = SP.sessionsByDay(report);
    const matchDays = SP.matchesByDay(report);
    // Match columns come from the career rows, so they stay filled when a long period skips the match rows.
    const careerDays = new Map(report.career.days.filter(day => day.key >= report.period.from && day.key <= report.period.to).map(day => [day.key, day]));
    const keys = new Set([...sessions.keys(), ...careerDays.keys(), ...report.raw.currencyDays.map(row => row[0])]);
    const currency = (key, index) => {
      const row = report.raw.currencyDays.find(entry => entry[0] === key && entry[1] === "SoftCurrency");
      return row ? row[index] : null;
    };
    const body = byId("day-rows");
    const addNumber = (row, value, format = String) => {
      const cell = htmlElement("td", value === null ? "num muted-cell" : "num", row);
      cell.textContent = value === null ? "–" : format(value);
    };
    for (const key of [...keys].sort().reverse()) {
      const row = htmlElement("tr", "", body);
      const session = sessions.get(key);
      const day = careerDays.get(key);
      const searchTimes = (matchDays.get(key) || []).map(match => match.searchSeconds).filter(value => value !== null && value !== undefined);
      htmlElement("td", "", row).textContent = SP.dayLabelWithYear(key);
      addNumber(row, session ? session.seconds : null, SP.durationLabel);
      addNumber(row, day ? day.count : null);
      addNumber(row, day ? `${day.wins}–${day.losses}–${day.draws}` : null);
      addNumber(row, day ? day.endPoints : null, formatNumber);
      addNumber(row, currency(key, 2), formatNumber);
      addNumber(row, currency(key, 3), formatNumber);
      addNumber(row, currency(key, 4), formatNumber);
      addNumber(row, searchTimes.length ? SP.median(searchTimes) : null, value => `${value} s`);
    }
  };
})();
