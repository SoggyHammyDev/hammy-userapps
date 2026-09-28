(() => {
  "use strict";

  const TRIGGER = "hammybxpload";
  const TRIGGER_KEY = "trigger_" + TRIGGER;
  const EXP_TRIGGER = "hammybxpcollectexp";
  const EXP_TRIGGER_KEY = "trigger_" + EXP_TRIGGER;
  const POSITION_KEY = "hammyBxp.position.v1";
  const SETTINGS_KEY = "hammyBxp.settings.v1";
  const FIRST_MENU_WINDOW_MS = 3000;
  const NUI_POLL_MS = 10;
  const NUI_POST_DELAY_MS = 10;
  const NUI_CHANGE_TIMEOUT_MS = 1100;

  const ITEM = {
    id: "fridge_store_delivery",
    name: "Fridge: Food Shipment",
    bxp: "Hunting",
    yield: 10
  };

  // Trailer legend copied from Doggo's Trucking Calculator.
  // Doggo's legend has no MK2 entry.
  const TRAILERS = {
    trailerswb:   { name:"MK1",  id:"trailerswb" },
    trailerlogs2: { name:"MK3",  id:"trailerlogs2" },
    botdumptr:    { name:"MK4",  id:"botdumptr" },
    drybulktr:    { name:"MK5",  id:"drybulktr" },
    dumptr:       { name:"MK6",  id:"dumptr" },
    docktrailer2: { name:"MK7",  id:"docktrailer2" },
    docktrailer:  { name:"MK8",  id:"docktrailer" },
    trailers2:    { name:"MK9",  id:"trailers2" },
    trailerswb2: { name:"MK10", id:"trailerswb2", vrpName:"Refrigerated Trailer (MK10) (trailerswb2)" },
    tvtrailer:    { name:"MK11", id:"tvtrailer" },
    tvtrailer2:   { name:"MK12", id:"tvtrailer2", vrpName:"Trailer (tvtrailer2)" },
    boxlongtr:    { name:"MK13", id:"boxlongtr", vrpName:"Box Trailer (MK13) (boxlongtr)" },
    trailerlarge: { name:"MK14", id:"trailerlarge", vrpName:"Mobile Operations Center (MK14) (trailerlarge)" }
  };

  const MK15 = {
    name:"MK15",
    id:"mk15",
    vrpName:"Chernobog Toter (mk15)"
  };

  const state = {
    cache: {},
    keybindsEnabled: false,
    running: false,
    storageAmount: null,
    sequenceActive: false,
    targets: [],
    step: 0,
    phase: "take",
    armedUntil: 0,
    waitingForClose: false,
    waitingForNextOpen: false,
    feedActive: false,
    feedSources: [],
    feedSourceIndex: 0,
    refillRunning: false,
    lastNotification: null,
    settings: {
      dumpBeforeTake: false,
      useMk15: true,
      trailer: "trailerlarge"
    }
  };

  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function parseChoices(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
      try { return JSON.parse(value); } catch {}
    }
    return [];
  }

  function clean(value) {
    return String(value ?? "")
      .replace(/<[^>]*>/g, "")
      .replace(/&#.+?;/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function choices() {
    return Array.isArray(state.cache.menu_choices) ? state.cache.menu_choices : [];
  }

  function choiceByText(text) {
    const wanted = clean(text).toLowerCase();
    return choices().find(row => clean(row?.[0]).toLowerCase() === wanted)?.[0] ?? null;
  }

  function itemChoice() {
    return choices().find(row => clean(row?.[0]).toLowerCase() === ITEM.name.toLowerCase())?.[0] ?? null;
  }

  function escRegex(value) {
    return String(value).replace(/[.*+?^\${}()|[\]\\]/g, "\\$&");
  }

  function targetChoice(target) {
    const rows = choices()
      .map(row => ({ raw: row?.[0], text: clean(row?.[0]) }))
      .filter(row => row.raw && row.text);

    const vrp = target.vrpName?.toLowerCase();
    if (vrp) {
      const exactVrp = rows.find(row => row.text.toLowerCase() === vrp);
      if (exactVrp) return exactVrp.raw;
    }

    const id = target.id?.toLowerCase();
    if (id) {
      const exactId = rows.find(row => row.text.toLowerCase() === id);
      if (exactId) return exactId.raw;

      const containsId = rows.find(row => row.text.toLowerCase().includes("(" + id + ")"));
      if (containsId) return containsId.raw;
    }

    const name = target.name?.toLowerCase();
    if (name) {
      const exactName = rows.find(row => row.text.toLowerCase() === name);
      if (exactName) return exactName.raw;

      const rx = new RegExp("(^|\\W)" + escRegex(name) + "(?=\\W|$)", "i");
      const byName = rows.find(row => rx.test(row.text));
      if (byName) return byName.raw;
    }

    return null;
  }

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      if (saved && typeof saved === "object") {
        if (typeof saved.dumpBeforeTake === "boolean") state.settings.dumpBeforeTake = saved.dumpBeforeTake;
        if (typeof saved.useMk15 === "boolean") state.settings.useMk15 = saved.useMk15;
        if (typeof saved.trailer === "string" && (saved.trailer === "" || TRAILERS[saved.trailer])) {
          state.settings.trailer = saved.trailer;
        }
      }
    } catch {}

    $("dumpBeforeTake").checked = state.settings.dumpBeforeTake;
    $("useMk15").checked = state.settings.useMk15;
    $("trailerSelect").value = state.settings.trailer;
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
    } catch {}
  }

  function selectedTargets() {
    const targets = [];

    if (state.settings.trailer && TRAILERS[state.settings.trailer]) {
      targets.push(TRAILERS[state.settings.trailer]);
    }

    if (state.settings.useMk15) {
      targets.push(MK15);
    }

    return targets;
  }

  function calculateStorageAmount() {
    let total = 0;
    let found = false;

    for (const [key, value] of Object.entries(state.cache)) {
      if (!key.startsWith("chest_self_storage")) continue;
      if (!value || typeof value !== "object") continue;

      const amount = Number(value?.[ITEM.id]?.amount);
      if (Number.isFinite(amount)) {
        total += amount;
        found = true;
      }
    }

    if (!found) {
      const itemRow = choices().find(row =>
        clean(row?.[0]).toLowerCase() === ITEM.name.toLowerCase()
      );

      if (itemRow) {
        const description = clean(itemRow?.[1]);
        const match = description.match(/\(([\d\s,]+)[×x]\)/i);

        if (match) {
          const amount = Number(match[1].replace(/[\s,]/g, ""));
          if (Number.isFinite(amount)) {
            total = amount;
            found = true;
          }
        }
      }
    }

    if (found) state.storageAmount = total;
  }

  function isStorageRoot() {
    return state.cache.menu_open === true &&
      (Boolean(choiceByText("Take to Trunk")) || Boolean(choiceByText("Dump from Trunk")));
  }

  function notify(text) {
    window.parent.postMessage({
      type: "notification",
      text: "~r~[Hammy BXP]~w~ " + text
    }, "*");
  }

  function setStatus(title, text, kind = "") {
    const box = $("status");
    box.className = "status" + (kind ? " " + kind : "");
    $("statusTitle").textContent = title;
    $("statusText").textContent = text;
  }

  function progressText() {
    const configured = selectedTargets();
    if (!configured.length) return "No trunks selected";

    if (state.feedActive) {
      return state.feedSources.map((target, index) => {
        const amount = foodAmountInTarget(target);
        const suffix = amount == null ? "" : " (" + amount.toLocaleString() + ")";
        if (index < state.feedSourceIndex) return target.name + " ✓";
        if (index === state.feedSourceIndex) return target.name + suffix + " · feeding";
        return target.name + suffix;
      }).join(" → ");
    }

    if (!state.sequenceActive) {
      return configured.map(target => target.name).join(" → ");
    }

    const parts = state.targets.map((target, index) => {
      if (index < state.step) return target.name + " ✓";
      if (index === state.step) {
        return state.phase === "dump"
          ? target.name + " · dump"
          : target.name + " · take";
      }
      return target.name;
    });

    return parts.join(" → ");
  }

  function render() {
    calculateStorageAmount();

    $("storageAmount").textContent =
      state.storageAmount == null ? "—" : state.storageAmount.toLocaleString();

    $("trunkCount").textContent = progressText();

    if (state.running) return;

    if (state.feedActive) {
      const source = currentFeedSource();
      setStatus(
        "Hunter feeding armed",
        source
          ? "Current refill source: " + source.name + ". Open Feed the Hunters with E/use."
          : "Waiting for the next configured trunk.",
        "ok"
      );
      return;
    }

    if (state.sequenceActive) {
      const target = state.targets[state.step];

      if (state.step === 0 && Date.now() <= state.armedUntil && !state.waitingForNextOpen && !state.waitingForClose) {
        setStatus(
          "Armed for " + target.name,
          "Open Self Storage now. Watching for the menu for " +
            ((state.armedUntil - Date.now()) / 1000).toFixed(1) + "s.",
          "busy"
        );
        return;
      }

      if (target) {
        if (state.phase === "dump") {
          setStatus(
            "Waiting to dump " + target.name,
            "Open Self Storage with E/use. Hammy BXP will empty that trunk first.",
            "ok"
          );
        } else {
          setStatus(
            "Waiting to load " + target.name,
            "Open Self Storage with E/use. Hammy BXP will take " + ITEM.name + ".",
            "ok"
          );
        }
        return;
      }
    }

    setStatus(
      "Ready",
      "Press your Hammy BXP hotkey, then open Self Storage within 3 seconds."
    );
  }

  async function waitFor(test, timeout = 3500, interval = NUI_POLL_MS) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (test()) return true;
      await sleep(interval);
    }
    throw new Error("Timed out waiting for the TT menu");
  }

  async function submitChoice(rawChoice, mod = 0) {
    const beforeMenu = state.cache.menu;
    const beforeOpen = state.cache.menu_open;
    const beforePrompt = state.cache.prompt;
    const beforeChoices = JSON.stringify(choices());

    window.parent.postMessage({
      type: "forceMenuChoice",
      choice: rawChoice,
      mod
    }, "*");

    try {
      await waitFor(
        () =>
          beforeMenu !== state.cache.menu ||
          beforeOpen !== state.cache.menu_open ||
          beforePrompt !== state.cache.prompt ||
          beforeChoices !== JSON.stringify(choices()),
        NUI_CHANGE_TIMEOUT_MS
      );
    } catch {}

    await sleep(NUI_POST_DELAY_MS);
  }

  function waitForUserReopen() {
    state.waitingForClose = state.cache.menu_open === true;
    state.waitingForNextOpen = state.cache.menu_open !== true;
  }

  async function takeTarget(target) {
    const takeToTrunk = choiceByText("Take to Trunk");
    if (!takeToTrunk) throw new Error("Take to Trunk was not found");

    setStatus(
      "Loading " + target.name,
      "Take to Trunk → " + target.name + " → " + ITEM.name,
      "busy"
    );

    await submitChoice(takeToTrunk, 0);
    await waitFor(() => Boolean(targetChoice(target)), 1800);

    const trunk = targetChoice(target);
    if (!trunk) throw new Error(target.name + " was not found in the trunk menu");
    await submitChoice(trunk, 0);

    await waitFor(() => Boolean(itemChoice()), 1800);

    const food = itemChoice();
    if (!food) throw new Error(ITEM.name + " was not found");
    await submitChoice(food, -1);

    state.step += 1;

    if (state.step >= state.targets.length) {
      state.sequenceActive = false;
      state.waitingForClose = false;
      state.waitingForNextOpen = false;

      const names = state.targets.map(t => t.name).join(" + ");
      state.feedSources = [...state.targets];
      state.feedSourceIndex = 0;
      state.feedActive = true;
      setStatus(
        "BXP load complete",
        names + " loaded. At Roxwood Loft, open the Feed the Hunters menu to begin.",
        "ok"
      );
      notify(names + " loaded. Hunter feeding is armed.");
      return;
    }

    state.phase = state.settings.dumpBeforeTake ? "dump" : "take";
    waitForUserReopen();

    const next = state.targets[state.step];
    setStatus(
      target.name + " loaded",
      "Press E/use to open Self Storage again. " +
        (state.phase === "dump" ? "Dumping " : "Loading ") + next.name + " is next.",
      "ok"
    );
  }

  async function dumpTarget(target) {
    const dump = choiceByText("Dump from Trunk");
    if (!dump) throw new Error("Dump from Trunk was not found");

    setStatus(
      "Dumping " + target.name,
      "Dump from Trunk → " + target.name,
      "busy"
    );

    await submitChoice(dump, 0);
    await waitFor(() => Boolean(targetChoice(target)), 1800);

    const trunk = targetChoice(target);
    if (!trunk) throw new Error(target.name + " was not found in the dump menu");
    await submitChoice(trunk, 0);

    state.phase = "take";

    try {
      await waitFor(() => isStorageRoot() || state.cache.menu_open === false, 500);
    } catch {}

    if (isStorageRoot()) {
      await takeTarget(target);
    } else {
      waitForUserReopen();
      setStatus(
        target.name + " dumped",
        "Press E/use to open Self Storage again. " + target.name + " will load next.",
        "ok"
      );
    }
  }

  async function processCurrentStep() {
    if (state.running || !state.sequenceActive || !isStorageRoot()) return;

    const target = state.targets[state.step];
    if (!target) return;

    state.running = true;
    $("loadNow").disabled = true;

    try {
      if (state.phase === "dump") await dumpTarget(target);
      else await takeTarget(target);
    } catch (error) {
      console.error("[Hammy BXP]", error);
      state.sequenceActive = false;
      state.waitingForClose = false;
      state.waitingForNextOpen = false;
      setStatus("Loader stopped", error?.message ?? String(error), "error");
      notify("Error: " + (error?.message ?? error));
    } finally {
      state.running = false;
      $("loadNow").disabled = false;
      render();
    }
  }

  function armSequence() {
    if (state.running) return;

    const targets = selectedTargets();
    if (!targets.length) {
      setStatus("No trunks selected", "Choose a trailer and/or enable MK15.", "error");
      notify("Choose a trailer and/or enable MK15 first.");
      return;
    }

    state.targets = targets;
    state.sequenceActive = true;
    state.step = 0;
    state.phase = state.settings.dumpBeforeTake ? "dump" : "take";
    state.armedUntil = Date.now() + FIRST_MENU_WINDOW_MS;
    state.waitingForClose = false;
    state.waitingForNextOpen = false;

    setStatus(
      "Armed for " + targets[0].name,
      "Open Self Storage within 3 seconds.",
      "busy"
    );

    if (isStorageRoot()) {
      processCurrentStep();
      return;
    }

    setTimeout(() => {
      if (
        state.sequenceActive &&
        state.step === 0 &&
        Date.now() >= state.armedUntil &&
        !state.waitingForNextOpen &&
        !state.waitingForClose
      ) {
        state.sequenceActive = false;
        render();
      }
    }, FIRST_MENU_WINDOW_MS + 50);
  }

  function isFeedMenu() {
    return state.cache.menu_open === true &&
      clean(state.cache.menu).toLowerCase() === "roxwood loft" &&
      Boolean(choiceByText("Feed the Hunters"));
  }

  function currentFeedSource() {
    return state.feedSources[state.feedSourceIndex] ?? null;
  }

  function chestKeyForTarget(target) {
    const userId = state.cache.user_id;
    if (!userId || !target?.id) return null;
    return target.id === "mk15"
      ? "chest_u" + userId + "veh_cab_" + target.id
      : "chest_u" + userId + "veh_trailer_" + target.id;
  }

  function foodAmountInTarget(target) {
    const key = chestKeyForTarget(target);
    if (!key) return null;
    const chest = state.cache[key];
    if (!chest || typeof chest !== "object") return null;
    const amount = Number(chest?.[ITEM.id]?.amount ?? 0);
    return Number.isFinite(amount) ? amount : null;
  }

  const HUNT_EXP = {
    id: "exp_token_a|hunting|skill",
    names: ["EXP Token (Hunting)", "Bonus EXP (Hunting)"]
  };

  function huntingExpAmountInTarget(target) {
    const key = chestKeyForTarget(target);
    if (!key) return null;
    const chest = state.cache[key];
    if (!chest || typeof chest !== "object") return null;
    const amount = Number(chest?.[HUNT_EXP.id]?.amount ?? 0);
    return Number.isFinite(amount) ? amount : null;
  }

  function huntingExpChoice() {
    return choices().find(row => {
      const raw = String(row?.[0] ?? "");
      const text = clean(raw).toLowerCase();

      if (HUNT_EXP.names.some(name => text === name.toLowerCase())) return true;

      return /type=['"]hunting-skill['"]/i.test(raw);
    })?.[0] ?? null;
  }

  async function dumpHuntingExpFromSource(source) {
    if (!source) return;

    const knownAmount = huntingExpAmountInTarget(source);
    if (knownAmount === 0) return;

    await closeCurrentMenu();

    setStatus(
      "Collecting Hunting EXP",
      "Opening " + source.name + " to move Hunting EXP into inventory.",
      "busy"
    );

    window.parent.postMessage({
      type: "sendCommand",
      command: trunkCommand(source)
    }, "*");

    await waitFor(
      () => state.cache.menu_open === true && Boolean(choiceByText("Take")),
      1600
    );

    const take = choiceByText("Take");
    if (!take) throw new Error("Take was not found in " + source.name);
    await submitChoice(take, 0);

    try {
      await waitFor(() => Boolean(huntingExpChoice()), 700);
    } catch {}

    const exp = huntingExpChoice();
    if (exp) {
      await submitChoice(exp, -1);
    }

    await closeCurrentMenu();
  }

  async function collectHuntingExp() {
    if (state.running || state.refillRunning) return;

    const targets = selectedTargets();
    if (!targets.length) {
      setStatus("No trunks selected", "Choose a trailer and/or enable MK15.", "error");
      notify("Choose a trailer and/or enable MK15 first.");
      return;
    }

    state.running = true;
    $("loadNow").disabled = true;
    $("collectExp").disabled = true;

    let totalCollected = 0;
    let touched = 0;

    try {
      for (const target of targets) {
        const knownAmount = huntingExpAmountInTarget(target);

        if (knownAmount === 0) continue;

        setStatus(
          "Collecting Hunting EXP",
          "Checking " + target.name + ".",
          "busy"
        );

        const before = knownAmount ?? 0;
        await dumpHuntingExpFromSource(target);
        const after = huntingExpAmountInTarget(target);

        if (knownAmount != null) {
          const collected = Math.max(0, knownAmount - (after ?? 0));
          totalCollected += collected;
        }

        touched += 1;
      }

      setStatus(
        "Hunting EXP collected",
        touched
          ? (totalCollected > 0
              ? totalCollected.toLocaleString() + " Hunting EXP moved to inventory."
              : "Finished checking the configured trunks.")
          : "No Hunting EXP was detected in the configured trunks.",
        "ok"
      );

      notify(
        totalCollected > 0
          ? totalCollected.toLocaleString() + " Hunting EXP moved to inventory."
          : "Finished collecting Hunting EXP."
      );
    } catch (error) {
      console.error("[Hammy BXP EXP collect]", error);
      setStatus("EXP collection stopped", error?.message ?? String(error), "error");
      notify("EXP collection error: " + (error?.message ?? error));
    } finally {
      state.running = false;
      $("loadNow").disabled = false;
      $("collectExp").disabled = false;
      render();
    }
  }

  function trunkCommand(target) {
    return target?.id === "mk15" ? "rm_cabtrunk" : "rm_trunk";
  }

  async function closeCurrentMenu() {
    for (let i = 0; i < 3 && state.cache.menu_open === true; i++) {
      window.parent.postMessage({ type: "forceMenuBack" }, "*");
      await sleep(20);
    }
  }

  async function openCurrentFeedSource() {
    if (!state.feedActive || state.refillRunning) return;

    state.refillRunning = true;

    try {
      const source = currentFeedSource();

      if (!source) {
        state.feedActive = false;
        setStatus(
          "Food Shipments exhausted",
          "All configured trunks have been tried.",
          "ok"
        );
        notify("All configured Food Shipment trunks have been exhausted.");
        return;
      }

      setStatus(
        "Opening " + source.name,
        "Leaving " + source.name + " open so Roxwood can consume directly from it.",
        "busy"
      );

      // Important: DO NOT Take the item out of the trunk here.
      // TT recipes can consume directly from an open vehicle trunk.
      window.parent.postMessage({
        type: "sendCommand",
        command: trunkCommand(source)
      }, "*");

      try {
        await waitFor(() => state.cache.menu_open === true, 1200);
      } catch {}

      setStatus(
        source.name + " open",
        "Leave this trunk open. Open Feed the Hunters again and Hammy BXP will keep crafting from it.",
        "ok"
      );
    } catch (error) {
      console.error("[Hammy BXP trunk open]", error);
      state.feedActive = false;
      setStatus("Trunk open failed", error?.message ?? String(error), "error");
      notify("Trunk open error: " + (error?.message ?? error));
    } finally {
      state.refillRunning = false;
      $("loadNow").disabled = false;
      render();
    }
  }

  async function advanceFeedSource() {
    await closeCurrentMenu();
    state.feedSourceIndex += 1;

    while (state.feedSourceIndex < state.feedSources.length) {
      const next = currentFeedSource();
      const amount = foodAmountInTarget(next);

      if (amount != null && amount >= 10) {
        setStatus(
          "Switching trunks",
          "Opening " + next.name + " as the next Food Shipment source.",
          "busy"
        );
        await openCurrentFeedSource();
        return true;
      }

      if (amount == null) {
        setStatus(
          "Waiting for " + next.name,
          "Waiting for TT to publish this trunk's Food Shipment count.",
          "busy"
        );
        return false;
      }

      state.feedSourceIndex += 1;
    }

    state.feedActive = false;
    setStatus(
      "Food Shipments exhausted",
      "All configured trunks have fewer than 10 Food Shipments remaining.",
      "ok"
    );
    notify("All configured Food Shipment trunks are below the recipe minimum.");
    return false;
  }

  async function feedHunters() {
    if (!state.feedActive || state.running || state.refillRunning || !isFeedMenu()) return;

    const source = currentFeedSource();
    if (!source) return;

    const amountBefore = foodAmountInTarget(source);
    if (amountBefore != null && amountBefore < 10) {
      await advanceFeedSource();
      return;
    }

    state.running = true;
    $("loadNow").disabled = true;

    try {
      setStatus(
        "Feeding the Hunters",
        "Current trunk source: " + source.name +
          (amountBefore == null ? "." : " · " + amountBefore.toLocaleString() + " Food Shipments remaining."),
        "busy"
      );

      const feed = choiceByText("Feed the Hunters");
      if (!feed) throw new Error("Feed the Hunters was not found");

      await submitChoice(feed, 0);

      // Give TT a moment to publish the updated trunk chest after the sale.
      if (amountBefore != null) {
        try {
          await waitFor(() => {
            const now = foodAmountInTarget(source);
            return now != null && now !== amountBefore;
          }, 450);
        } catch {}
      } else {
        await sleep(40);
      }

      const amountAfter = foodAmountInTarget(source);

      if (amountAfter != null && amountAfter < 10) {
        await advanceFeedSource();
        return;
      }

      // Keep the active source open between sales so Roxwood can consume
      // directly from that trunk on the next Feed the Hunters action.
      await openCurrentFeedSource();

      setStatus(
        source.name + " open",
        amountAfter == null
          ? "Ready for the next Feed the Hunters sale."
          : amountAfter.toLocaleString() + " Food Shipments remaining.",
        "ok"
      );
    } catch (error) {
      console.error("[Hammy BXP feed]", error);
      state.feedActive = false;
      setStatus("Feed stopped", error?.message ?? String(error), "error");
      notify("Feed error: " + (error?.message ?? error));
    } finally {
      state.running = false;
      $("loadNow").disabled = false;
      render();
    }
  }

  async function startFeedSession() {
    const sources = selectedTargets();
    if (!sources.length) {
      setStatus("No trunks selected", "Choose a trailer and/or enable MK15.", "error");
      return false;
    }

    state.feedSources = sources;
    state.feedSourceIndex = 0;
    state.feedActive = true;

    while (state.feedSourceIndex < state.feedSources.length) {
      const source = currentFeedSource();
      const amount = foodAmountInTarget(source);

      if (amount != null && amount >= 10) {
        setStatus(
          "Hunter feed ready",
          "Opening " + source.name + " with " + amount.toLocaleString() + " Food Shipments.",
          "ok"
        );
        await openCurrentFeedSource();
        return true;
      }

      if (amount == null) {
        setStatus(
          "Reading " + source.name,
          "Waiting for TT to publish this trunk's Food Shipment count.",
          "busy"
        );
        return false;
      }

      state.feedSourceIndex += 1;
    }

    state.feedActive = false;
    setStatus(
      "No usable Food Shipments",
      "Every configured trunk has fewer than 10 Food Shipments.",
      "error"
    );
    return false;
  }

  function setupDrag() {
    const app = $("app");
    const handle = $("dragHandle");

    try {
      const saved = JSON.parse(localStorage.getItem(POSITION_KEY) || "null");
      if (saved) {
        app.style.left = Math.max(0, Math.min(saved.x, window.innerWidth - app.offsetWidth)) + "px";
        app.style.top = Math.max(0, Math.min(saved.y, window.innerHeight - app.offsetHeight)) + "px";
      }
    } catch {}

    let dragging = false;
    let dx = 0;
    let dy = 0;

    handle.addEventListener("mousedown", event => {
      if (event.target.closest("input,select,button,label")) return;
      const rect = app.getBoundingClientRect();
      dragging = true;
      dx = event.clientX - rect.left;
      dy = event.clientY - rect.top;
      event.preventDefault();
    });

    document.addEventListener("mousemove", event => {
      if (!dragging) return;
      app.style.left =
        Math.max(0, Math.min(event.clientX - dx, window.innerWidth - app.offsetWidth)) + "px";
      app.style.top =
        Math.max(0, Math.min(event.clientY - dy, window.innerHeight - app.offsetHeight)) + "px";
    });

    document.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      try {
        localStorage.setItem(POSITION_KEY, JSON.stringify({
          x: app.offsetLeft,
          y: app.offsetTop
        }));
      } catch {}
    });
  }

  window.addEventListener("message", event => {
    const outer = event.data;
    const data =
      outer?.type === "data" && outer?.data && typeof outer.data === "object"
        ? outer.data
        : outer?.data && typeof outer.data === "object"
          ? outer.data
          : outer;

    if (!data || typeof data !== "object") return;

    const previousTrigger = state.cache[TRIGGER_KEY];
    const previousExpTrigger = state.cache[EXP_TRIGGER_KEY];

    for (const [key, value] of Object.entries(data)) {
      if (key === "menu_choices") state.cache[key] = parseChoices(value);
      else state.cache[key] = value;
    }

    const chestUpdateForFeed = Object.keys(data).some(key =>
      key.startsWith("chest_u") && (key.includes("veh_trailer_") || key.includes("veh_cab_"))
    );

    if (
      chestUpdateForFeed &&
      state.feedActive &&
      !state.running &&
      !state.refillRunning &&
      isFeedMenu()
    ) {
      const source = currentFeedSource();
      const amount = foodAmountInTarget(source);

      if (amount != null && amount < 10) {
        advanceFeedSource();
      } else if (amount != null && amount >= 10) {
        openCurrentFeedSource();
      }
    }

    if (Object.prototype.hasOwnProperty.call(data, "notification")) {
      const note = clean(data.notification);
      const changed = note !== state.lastNotification;
      state.lastNotification = note;

      if (
        changed &&
        state.feedActive &&
        note.toLowerCase() === "not enough items"
      ) {
        // The currently open trunk can no longer satisfy Feed the Hunters.
        // Move to the next configured trunk and leave it open.
        advanceFeedSource();
      }
    }

    if (
      state.keybindsEnabled &&
      Object.prototype.hasOwnProperty.call(data, TRIGGER_KEY) &&
      data[TRIGGER_KEY] !== previousTrigger
    ) {
      armSequence();
    }

    if (
      state.keybindsEnabled &&
      Object.prototype.hasOwnProperty.call(data, EXP_TRIGGER_KEY) &&
      data[EXP_TRIGGER_KEY] !== previousExpTrigger
    ) {
      collectHuntingExp();
    }

    if (!state.running && !state.refillRunning && isFeedMenu()) {
      if (!state.feedActive) {
        startFeedSession();
      } else {
        feedHunters();
      }
    }

    if (state.sequenceActive && !state.running) {
      if (
        state.step === 0 &&
        Date.now() <= state.armedUntil &&
        !state.waitingForClose &&
        !state.waitingForNextOpen &&
        isStorageRoot()
      ) {
        processCurrentStep();
      }

      if (state.waitingForClose && state.cache.menu_open === false) {
        state.waitingForClose = false;
        state.waitingForNextOpen = true;
      }

      if (state.waitingForNextOpen && isStorageRoot()) {
        state.waitingForNextOpen = false;
        processCurrentStep();
      }
    }

    render();
  });

  window.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      window.parent.postMessage({ type: "pin" }, "*");
    }
  });

  $("dumpBeforeTake").addEventListener("change", event => {
    state.settings.dumpBeforeTake = event.target.checked;
    saveSettings();
    render();
  });

  $("useMk15").addEventListener("change", event => {
    state.settings.useMk15 = event.target.checked;
    saveSettings();
    render();
  });

  $("trailerSelect").addEventListener("change", event => {
    state.settings.trailer = event.target.value;
    saveSettings();
    render();
  });

  $("loadNow").addEventListener("click", armSequence);
  $("collectExp").addEventListener("click", collectHuntingExp);

  loadSettings();
  setupDrag();
  render();

  setTimeout(() => {
    window.parent.postMessage({ type: "getData" }, "*");
    window.parent.postMessage({
      type: "registerTrigger",
      trigger: TRIGGER,
      name: "Hammy BXP Load"
    }, "*");
    window.parent.postMessage({
      type: "registerTrigger",
      trigger: EXP_TRIGGER,
      name: "Hammy BXP Collect EXP"
    }, "*");
  }, 250);

  setTimeout(() => {
    state.keybindsEnabled = true;
  }, 2000);
})();
