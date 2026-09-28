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

  const state = {
    cache: {},
    keybindsEnabled: false,
    running: false,
    storageAmount: null,
    destinations: []
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
    if (state.cache.menu_open !== true) return false;
    if (choiceByText("Take to Trunk")) return true;

    const menuText = [
      state.cache.menu,
      state.cache.menu_choice,
      state.cache.menu_title,
      state.cache.prompt_title
    ].map(clean).join(" ").toLowerCase();

    return menuText.includes("storage") && choices().length > 0;
  }

  function notify(text) {
    window.parent.postMessage({ type: "notification", text: "~r~[Hammy BXP]~w~ " + text }, "*");
  }

  function setStatus(title, text, kind = "") {
    const box = $("status");
    box.className = "status" + (kind ? " " + kind : "");
    $("statusTitle").textContent = title;
    $("statusText").textContent = text;
  }

  function render() {
    calculateStorageAmount();

    $("storageAmount").textContent =
      state.storageAmount == null ? "—" : state.storageAmount.toLocaleString();

    $("trunkCount").textContent =
      state.destinations.length ? state.destinations.length.toString() : "—";

    if (state.running) return;

    if (isStorageRoot()) {
      setStatus(
        "Self Storage detected",
        "Press your Hammy BXP keybind to fill every available trunk.",
        "ok"
      );
    } else {
      setStatus(
        "Waiting for Self Storage",
        "Open Self Storage, then press your Hammy BXP keybind."
      );
    }
  }

  async function waitFor(test, timeout = 4500, interval = 75) {
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

    await sleep(100);

    try {
      await waitFor(
        () =>
          beforeMenu !== state.cache.menu ||
          beforeOpen !== state.cache.menu_open ||
          beforePrompt !== state.cache.prompt ||
          beforeChoices !== JSON.stringify(choices()),
        2400
      );
    } catch {
      // TT can complete max-transfer selections without leaving a useful menu delta.
    }

    await sleep(120);
  }

  async function backToStorageRoot() {
    for (let i = 0; i < 4; i++) {
      if (choiceByText("Take to Trunk")) return true;
      if (state.cache.menu_open !== true) break;

      window.parent.postMessage({ type: "forceMenuBack" }, "*");
      await sleep(180);
    }

    return Boolean(choiceByText("Take to Trunk"));
  }

  function destinationChoices() {
    const ignored = new Set([
      "back",
      "take",
      "take to trunk",
      "put",
      "put all",
      "dump from trunk",
      ITEM.name.toLowerCase()
    ]);

    return choices()
      .map(row => ({ raw: row?.[0], text: clean(row?.[0]) }))
      .filter(row => row.raw && row.text && !ignored.has(row.text.toLowerCase()))
      .filter(row => !/inventory|backpack/i.test(row.text));
  }

  async function discoverDestinations() {
    const takeToTrunk = choiceByText("Take to Trunk");
    if (!takeToTrunk) throw new Error("Take to Trunk was not found");

    await submitChoice(takeToTrunk, 0);

    if (itemChoice()) {
      // TT skipped the destination menu. Treat it as one implicit trunk.
      state.destinations = [{ raw: null, text: "Current Trunk" }];
      return state.destinations;
    }

    await waitFor(() => destinationChoices().length > 0 || Boolean(itemChoice()), 3500);

    if (itemChoice()) {
      state.destinations = [{ raw: null, text: "Current Trunk" }];
    } else {
      state.destinations = destinationChoices();
    }

    await backToStorageRoot();
    render();
    return state.destinations;
  }

  async function loadDestination(destination, index, total) {
    if (!(await backToStorageRoot())) {
      throw new Error("Self Storage root menu was lost");
    }

    setStatus(
      "Loading " + (index + 1) + " of " + total,
      destination.text + " → " + ITEM.name,
      "busy"
    );

    const takeToTrunk = choiceByText("Take to Trunk");
    await submitChoice(takeToTrunk, 0);

    if (destination.raw != null) {
      await waitFor(
        () => choices().some(row => clean(row?.[0]) === destination.text),
        3000
      );

      const currentDestination =
        choices().find(row => clean(row?.[0]) === destination.text)?.[0];

      if (!currentDestination) {
        throw new Error("Could not find trunk: " + destination.text);
      }

      await submitChoice(currentDestination, 0);
    }

    await waitFor(() => Boolean(itemChoice()), 3000);

    const food = itemChoice();
    if (!food) throw new Error(ITEM.name + " was not found");

    // This is the same max-transfer behavior used by Doggo's NUI Take action.
    await submitChoice(food, -1);
    await sleep(300);
    window.parent.postMessage({ type: "getData" }, "*");
    await sleep(180);
  }

  async function loadTrunks(source = "keybind") {
    if (state.running) return;

    if (!isStorageRoot()) {
      notify("Open Self Storage first.");
      setStatus("Self Storage not detected", "Open Self Storage before using the loader.", "error");
      return;
    }

    state.running = true;
    $("loadNow").disabled = true;

    try {
      setStatus("Scanning trunks", "Reading available Take to Trunk destinations…", "busy");

      const destinations = await discoverDestinations();
      if (!destinations.length) throw new Error("No available trunks were found");

      for (let i = 0; i < destinations.length; i++) {
        await loadDestination(destinations[i], i, destinations.length);
      }

      await backToStorageRoot();
      window.parent.postMessage({ type: "getData" }, "*");

      setStatus(
        "Trunks loaded",
        ITEM.name + " was max-loaded into " + destinations.length + " trunk" + (destinations.length === 1 ? "" : "s") + ".",
        "ok"
      );

      notify("Loaded " + ITEM.name + " into available trunks.");
    } catch (error) {
      console.error("[Hammy BXP]", error);
      setStatus("Loader stopped", error?.message ?? String(error), "error");
      notify("Error: " + (error?.message ?? error));
    } finally {
      state.running = false;
      $("loadNow").disabled = false;
      setTimeout(() => {
        window.parent.postMessage({ type: "getData" }, "*");
        render();
      }, 900);
    }
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
      loadTrunks("keybind");
    }

    render();
  });

  window.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      window.parent.postMessage({ type: "pin" }, "*");
    }
  });

  $("loadNow").addEventListener("click", () => loadTrunks("button"));

  setupDrag();

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

  setInterval(() => {
    window.parent.postMessage({ type: "getData" }, "*");
  }, 2500);
})();
