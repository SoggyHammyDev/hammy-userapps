(() => {
  "use strict";

  const TRIGGER = "hammybxpload";
  const TRIGGER_KEY = "trigger_" + TRIGGER;
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
        if (index < state.feedSourceIndex) return target.name + " ✓";
        if (index === state.feedSourceIndex) return target.name + " · feeding";
        return target.name;
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

  function trunkCommand(target) {
    return target?.id === "mk15" ? "rm_cabtrunk" : "rm_trunk";
  }

  async function closeCurrentMenu() {
    for (let i = 0; i < 3 && state.cache.menu_open === true; i++) {
      window.parent.postMessage({ type: "forceMenuBack" }, "*");
      await sleep(20);
    }
  }

  async function refillFromCurrentSource() {
    if (!state.feedActive || state.refillRunning) return;

    state.refillRunning = true;

    try {
      while (state.feedSourceIndex < state.feedSources.length) {
        const source = currentFeedSource();
        if (!source) break;

        setStatus(
          "Refilling from " + source.name,
          "Opening " + source.name + " and taking " + ITEM.name + ".",
          "busy"
        );

        window.parent.postMessage({
          type: "sendCommand",
          command: trunkCommand(source)
        }, "*");

        await waitFor(
          () => state.cache.menu_open === true && Boolean(choiceByText("Take")),
          1800
        );

        const take = choiceByText("Take");
        if (!take) throw new Error("Take was not found in " + source.name);
        await submitChoice(take, 0);

        // Give TT a brief moment to populate the trunk item list. If Food
        // Shipment is absent, this source is considered empty and we switch.
        try {
          await waitFor(() => Boolean(itemChoice()), 350);
        } catch {}

        const food = itemChoice();

        if (!food) {
          await closeCurrentMenu();
          state.feedSourceIndex += 1;

          if (state.feedSourceIndex < state.feedSources.length) {
            const next = currentFeedSource();
            setStatus(
              source.name + " empty",
              "Switching to " + next.name + ".",
              "busy"
            );
            await sleep(30);
            continue;
          }

          state.feedActive = false;
          setStatus(
            "Food Shipments exhausted",
            "All configured trunks are empty.",
            "ok"
          );
          notify("All configured Food Shipment trunks are empty.");
          return;
        }

        await submitChoice(food, -1);
        await closeCurrentMenu();

        setStatus(
          "Refilled from " + source.name,
          "Press E/use at Roxwood Loft again. Hammy BXP will Feed the Hunters automatically.",
          "ok"
        );
        return;
      }
    } catch (error) {
      console.error("[Hammy BXP feed refill]", error);
      state.feedActive = false;
      setStatus("Refill stopped", error?.message ?? String(error), "error");
      notify("Refill error: " + (error?.message ?? error));
    } finally {
      state.refillRunning = false;
      $("loadNow").disabled = false;
      render();
    }
  }

  async function feedHunters() {
    if (!state.feedActive || state.running || state.refillRunning || !isFeedMenu()) return;

    state.running = true;
    $("loadNow").disabled = true;

    try {
      const source = currentFeedSource();
      setStatus(
        "Feeding the Hunters",
        "Using " + (source?.name ?? "configured trunk") + " as the current refill source.",
        "busy"
      );

      const feed = choiceByText("Feed the Hunters");
      if (!feed) throw new Error("Feed the Hunters was not found");
      await submitChoice(feed, 0);

      // The recipe closes Roxwood Loft after each craft. Refill immediately
      // from the same trunk; when that trunk has no Food Shipment left,
      // refillFromCurrentSource() advances to the next configured trunk.
      try {
        await waitFor(() => state.cache.menu_open === false, 900);
      } catch {}

      state.running = false;
      $("loadNow").disabled = false;
      await refillFromCurrentSource();
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

  function startFeedSession() {
    const sources = selectedTargets();
    if (!sources.length) {
      setStatus("No trunks selected", "Choose a trailer and/or enable MK15.", "error");
      return false;
    }

    state.feedSources = sources;
    state.feedSourceIndex = 0;
    state.feedActive = true;

    setStatus(
      "Hunter feed ready",
      "Current source: " + sources[0].name + ".",
      "ok"
    );

    return true;
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

    for (const [key, value] of Object.entries(data)) {
      if (key === "menu_choices") state.cache[key] = parseChoices(value);
      else state.cache[key] = value;
    }

    if (
      state.keybindsEnabled &&
      Object.prototype.hasOwnProperty.call(data, TRIGGER_KEY) &&
      data[TRIGGER_KEY] !== previousTrigger
    ) {
      if (isFeedMenu()) {
        if (!state.feedActive) startFeedSession();
        feedHunters();
      } else {
        armSequence();
      }
    }

    if (state.feedActive && !state.running && !state.refillRunning && isFeedMenu()) {
      feedHunters();
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
  }, 250);

  setTimeout(() => {
    state.keybindsEnabled = true;
  }, 2000);
})();
