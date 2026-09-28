(() => {
  "use strict";

  const TRIGGER = "hammybxpload";
  const TRIGGER_KEY = "trigger_" + TRIGGER;
  const POSITION_KEY = "hammyBxp.position.v1";
  const ITEM = {
    id: "fridge_store_delivery",
    name: "Fridge: Food Shipment",
    bxp: "Hunting",
    yield: 10
  };

  const TARGETS = ["MK14", "MK15"];
  const FIRST_MENU_WINDOW_MS = 3000;

  const state = {
    cache: {},
    keybindsEnabled: false,
    running: false,
    storageAmount: null,
    sequenceActive: false,
    step: 0,
    armedUntil: 0,
    waitingForClose: false,
    waitingForNextOpen: false
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

  function targetChoice(target) {
    const wanted = target.toLowerCase();
    const matches = choices()
      .map(row => ({ raw: row?.[0], text: clean(row?.[0]) }))
      .filter(row => row.raw && row.text);

    return (
      matches.find(row => row.text.toLowerCase() === wanted)?.raw ??
      matches.find(row => row.text.toLowerCase().includes(wanted))?.raw ??
      null
    );
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

    if (!found && state.cache.chest && typeof state.cache.chest === "object") {
      const amount = Number(state.cache.chest?.[ITEM.id]?.amount);
      if (Number.isFinite(amount)) {
        total = amount;
        found = true;
      }
    }

    state.storageAmount = found ? total : null;
  }

  function isStorageRoot() {
    return state.cache.menu_open === true && Boolean(choiceByText("Take to Trunk"));
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
    if (!state.sequenceActive) return "MK14 → MK15";
    if (state.step <= 0) return "Waiting for MK14";
    if (state.step === 1) return "MK14 ✓ · MK15 next";
    return "MK14 ✓ · MK15 ✓";
  }

  function render() {
    calculateStorageAmount();

    $("storageAmount").textContent =
      state.storageAmount == null ? "—" : state.storageAmount.toLocaleString();

    $("trunkCount").textContent = progressText();

    if (state.running) return;

    if (state.sequenceActive) {
      if (state.step === 0) {
        const msLeft = Math.max(0, state.armedUntil - Date.now());
        if (msLeft > 0) {
          setStatus(
            "Armed for MK14",
            "Open Self Storage now. Watching for the menu for " + (msLeft / 1000).toFixed(1) + "s.",
            "busy"
          );
        } else {
          state.sequenceActive = false;
          setStatus(
            "Self Storage not found",
            "Press the Hammy BXP hotkey again, then open Self Storage within 3 seconds.",
            "error"
          );
        }
        return;
      }

      if (state.step === 1) {
        setStatus(
          "MK14 loaded",
          "Press E/use to open Self Storage again. MK15 will load automatically.",
          "ok"
        );
        return;
      }
    }

    setStatus(
      "Ready",
      "Press your Hammy BXP hotkey, then open Self Storage within 3 seconds."
    );
  }

  async function waitFor(test, timeout = 3500, interval = 60) {
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

    await sleep(90);

    try {
      await waitFor(
        () =>
          beforeMenu !== state.cache.menu ||
          beforeOpen !== state.cache.menu_open ||
          beforePrompt !== state.cache.prompt ||
          beforeChoices !== JSON.stringify(choices()),
        2200
      );
    } catch {
      // Max-transfer can finish without a useful menu delta.
    }

    await sleep(90);
  }

  async function loadCurrentTarget() {
    if (state.running || !state.sequenceActive) return;
    if (!isStorageRoot()) return;

    const target = TARGETS[state.step];
    if (!target) return;

    state.running = true;
    $("loadNow").disabled = true;

    try {
      setStatus(
        "Loading " + target,
        "Take to Trunk → " + target + " → " + ITEM.name,
        "busy"
      );

      const takeToTrunk = choiceByText("Take to Trunk");
      if (!takeToTrunk) throw new Error("Take to Trunk was not found");
      await submitChoice(takeToTrunk, 0);

      await waitFor(() => Boolean(targetChoice(target)), 3000);

      const trunk = targetChoice(target);
      if (!trunk) throw new Error(target + " was not found in the trunk menu");
      await submitChoice(trunk, 0);

      await waitFor(() => Boolean(itemChoice()), 3000);

      const food = itemChoice();
      if (!food) throw new Error(ITEM.name + " was not found");
      await submitChoice(food, -1);

      state.step += 1;

      if (state.step >= TARGETS.length) {
        state.sequenceActive = false;
        state.waitingForClose = false;
        state.waitingForNextOpen = false;

        setStatus(
          "BXP load complete",
          "MK14 and MK15 were loaded with " + ITEM.name + ".",
          "ok"
        );
        notify("MK14 and MK15 loaded with " + ITEM.name + ".");
      } else {
        // Do not navigate the UI ourselves. Wait for the user's next E/use.
        state.waitingForClose = state.cache.menu_open === true;
        state.waitingForNextOpen = state.cache.menu_open !== true;

        setStatus(
          target + " loaded",
          "Press E/use to open Self Storage again. " + TARGETS[state.step] + " is next.",
          "ok"
        );
      }
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
    }
  }

  function armSequence() {
    if (state.running) return;

    state.sequenceActive = true;
    state.step = 0;
    state.armedUntil = Date.now() + FIRST_MENU_WINDOW_MS;
    state.waitingForClose = false;
    state.waitingForNextOpen = false;

    setStatus(
      "Armed for MK14",
      "Open Self Storage within 3 seconds.",
      "busy"
    );

    // If the player already has Self Storage open, use it immediately.
    if (isStorageRoot()) {
      loadCurrentTarget();
      return;
    }

    // This timer only expires the 3-second arm window; it does not poll TT.
    setTimeout(() => {
      if (state.sequenceActive && state.step === 0 && Date.now() >= state.armedUntil) {
        state.sequenceActive = false;
        render();
      }
    }, FIRST_MENU_WINDOW_MS + 50);
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
      armSequence();
    }

    if (state.sequenceActive && !state.running) {
      if (state.step === 0) {
        if (Date.now() <= state.armedUntil && isStorageRoot()) {
          loadCurrentTarget();
        }
      } else if (state.step === 1) {
        if (state.waitingForClose && state.cache.menu_open === false) {
          state.waitingForClose = false;
          state.waitingForNextOpen = true;
        }

        if (state.waitingForNextOpen && isStorageRoot()) {
          state.waitingForNextOpen = false;
          loadCurrentTarget();
        }
      }
    }

    render();
  });

  window.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      window.parent.postMessage({ type: "pin" }, "*");
    }
  });

  $("loadNow").addEventListener("click", armSequence);

  setupDrag();

  setTimeout(() => {
    // One initial hydration only. After this, the app watches TT's pushed data
    // events instead of polling getData.
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
