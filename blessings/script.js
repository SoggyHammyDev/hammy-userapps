const itemMap = {
  prefix_pack_1: 'count-s1',
  prefix_pack_2: 'count-s2',
  prefix_pack_3: 'count-s3',
  prefix_pack_1_reset: 'count-cursed'
};

let inventory = {};
let running = false;

const PACK_MENU_NAMES = {
  prefix_pack_1: "Blessing Pack [Series 1]",
  prefix_pack_2: "Blessing Pack [Series 2]",
  prefix_pack_3: "Blessing Pack [Series 3]"
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function usePackViaMenu(id) {
  const menuName = PACK_MENU_NAMES[id];
  if (!menuName) return false;

  return new Promise((resolve) => {
    let step = 0;
    let done = false;
    let timeoutId;

    const cleanup = (result) => {
      if (done) return;
      done = true;
      window.removeEventListener("message", onMessage);
      if (timeoutId) clearTimeout(timeoutId);
      resolve(result);
    };

    const onMessage = (event) => {
      let data = event.data;
      if (data?.type === "data" && data.data) data = data.data;
      if (!data || typeof data !== "object") return;

      const activeMenu = data.menu;
      const notification = typeof data.notification === "string" ? data.notification : "";

      if (notification.includes(`Used 1 ~g~${menuName}~s~`)) {
        cleanup(true);
        return;
      }

      if (step === 0 && /main\s*menu/i.test(activeMenu || "")) {
        step = 1;
        window.parent.postMessage({
          type: "forceMenuChoice",
          choice: "Inventory",
          mod: 0
        }, "*");
        return;
      }

      if (step === 1 && /inventory/i.test(activeMenu || "")) {
        step = 2;
        window.parent.postMessage({
          type: "forceMenuChoice",
          choice: menuName,
          mod: 0
        }, "*");
        return;
      }

      if (step === 2 && activeMenu === menuName) {
        step = 3;
        window.parent.postMessage({
          type: "forceMenuChoice",
          choice: "Use",
          mod: 0
        }, "*");
      }
    };

    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: "openMainMenu" }, "*");

    timeoutId = setTimeout(() => cleanup(false), 5000);
  });
}


function updateUI() {
  for (const [id, elId] of Object.entries(itemMap)) {
    const element = document.getElementById(elId);
    const oldValue = element.textContent;
    const newValue = inventory[id] || 0;
    
    element.textContent = newValue;
    
    // Add pulse animation if value changed
    if (oldValue !== newValue.toString()) {
      const countElement = element.closest('.count');
      if (countElement) {
        countElement.classList.add('updated');
        setTimeout(() => countElement.classList.remove('updated'), 300);
      }
    }
  }
}

function requestInventory() {
  window.parent.postMessage({ type: 'getData' }, '*');
}

function sendTrackerMessage(msg) {
  window.parent.postMessage({
    type: "notification",
    text: msg
  }, "*");
}

window.addEventListener("message", (event) => {
  const msg = event.data;

  if (!window._initialDumped && typeof msg === "object") {
    console.log("📦 Full getData payload:\n" + JSON.stringify(msg, null, 2));
    window._initialDumped = true;
  }

  const invString = msg.inventory || msg?.data?.inventory || msg?.payload?.inventory;
  if (typeof invString === "string" || (invString && typeof invString === "object")) {
    try {
      const inv = typeof invString === "string" ? JSON.parse(invString) : invString;
      inventory = {};
      for (const id in itemMap) {
        inventory[id] = inv[id]?.amount || 0;
      }
      for (const id in inv) {
        if (id.startsWith("blessing_card|")) {
          inventory[id] = inv[id]?.amount || 0;
        }
      }
      updateUI();
    } catch (err) {
      console.error("Failed to parse inventory:", err);
    }
  }
});

async function useItem(id) {
  if (PACK_MENU_NAMES[id]) {
    const before = inventory[id] || 0;
    let success = await usePackViaMenu(id);

    // Refresh and verify the pack count actually dropped.
    requestInventory();
    await sleep(500);

    if (!success || (inventory[id] || 0) >= before) {
      console.warn(`Menu use did not confirm for ${id}; trying direct command fallback.`);
      window.parent.postMessage({
        type: "sendCommand",
        command: `item ${id} use`
      }, "*");
      await sleep(800);
      requestInventory();
      await sleep(400);
    }
    return;
  }

  window.parent.postMessage({
    type: "sendCommand",
    command: `item ${id} use`
  }, "*");

  await sleep(id === "prefix_pack_1_reset" ? 900 : 250);
  requestInventory();
  await sleep(300);
}

async function redeemBlessings() {
  requestInventory();
  await new Promise(r => setTimeout(r, 500));

  const fullKeys = Object.keys(inventory).filter(id => id.startsWith("blessing_card|"));
  const coreKeys = [...new Set(fullKeys.map(id => id.split("|").slice(0, 2).join("|")))];

  for (const core of coreKeys) {
    const matchingFullKey = fullKeys.find(k => k.startsWith(core + "|"));
    const blessingName = matchingFullKey?.split("|")[2] || "Unknown";

    let attempts = 0;
    let lastTotal = Infinity;

    while (true) {
      const total = fullKeys
        .filter(k => k.startsWith(core + "|"))
        .reduce((sum, k) => sum + (inventory[k] || 0), 0);

      if (total <= 0) break;

      if (total === lastTotal) {
        if (document.getElementById("auto-delete").checked) {
          window.parent.postMessage({
            type: "sendCommand",
            command: `item ${core} trash`
          }, "*");

          window.parent.postMessage({
            type: "forceSubmitValue",
            value: String(total)
          }, "*");

          sendTrackerMessage(`Blessing ~r~\"${blessingName}\"~s~ auto-deleted (failed to receive)`);

          await new Promise(r => setTimeout(r, 300));
          window.parent.postMessage({ type: "pin" }, "*");

          requestInventory();
          await new Promise(r => setTimeout(r, 300));
        } else {
          sendTrackerMessage(`Blessing ~r~\"${blessingName}\"~s~ could not be received`);
        }
        break;
      }

      lastTotal = total;

      window.parent.postMessage({
        type: "sendCommand",
        command: `item ${core} receive`
      }, "*");

      await new Promise(r => setTimeout(r, 1000));
      requestInventory();
      await new Promise(r => setTimeout(r, 500));

      attempts++;
    }

    console.log(`✅ Redeemed ${core} (${attempts} times)`);
  }
}


async function startOpening() {
  running = true;
  document.getElementById("start-btn").style.display = "none";
  document.getElementById("stop-btn").style.display = "block";
  const runState = document.getElementById("run-state");
  if (runState) {
    runState.className = "state-pill running";
    runState.innerHTML = "<i></i> RUNNING";
  }

  const packs = ['prefix_pack_1', 'prefix_pack_2', 'prefix_pack_3'];

  requestInventory();
  await new Promise(r => setTimeout(r, 300));

  while (running) {
    let found = false;

    for (const packId of packs) {
      const beforePack = inventory[packId] || 0;
      if (beforePack <= 0) continue;

      // Open the pack through the same Inventory -> Pack -> Use flow
      // Transport Tycoon exposes manually.
      await useItem(packId);
      requestInventory();
      await sleep(500);

      const afterPack = inventory[packId] || 0;
      if (afterPack < beforePack) {
        found = true;

        // After every successful pack opening, consume one Cursed Dice
        // so the account is reset and ready for the next blessing pack.
        if ((inventory["prefix_pack_1_reset"] || 0) > 0) {
          const beforeDice = inventory["prefix_pack_1_reset"] || 0;
          await useItem("prefix_pack_1_reset");
          requestInventory();
          await sleep(500);

          if ((inventory["prefix_pack_1_reset"] || 0) >= beforeDice) {
            console.warn("Cursed Dice did not appear to decrement after pack use.");
          }
        } else {
          console.log("Pack opened, but no Cursed Dice remain. Stopping after this pack.");
          running = false;
        }

        break;
      }

      console.warn(`Pack ${packId} did not open; stopping to avoid consuming a Cursed Dice unnecessarily.`);
      running = false;
      break;
    }

    if (!found) break;
  }

  if (document.getElementById("auto-redeem").checked) {
    await redeemBlessings();
  }

  running = false;
  document.getElementById("start-btn").style.display = "block";
  document.getElementById("stop-btn").style.display = "none";
  if (runState) {
    runState.className = "state-pill idle";
    runState.innerHTML = "<i></i> IDLE";
  }
}

function stopOpening() {
  running = false;
  document.getElementById("start-btn").style.display = "block";
  document.getElementById("stop-btn").style.display = "none";
  const runState = document.getElementById("run-state");
  if (runState) {
    runState.className = "state-pill idle";
    runState.innerHTML = "<i></i> IDLE";
  }
}

document.getElementById("start-btn").addEventListener("click", startOpening);
document.getElementById("stop-btn").addEventListener("click", stopOpening);
document.getElementById("redeem-btn").addEventListener("click", redeemBlessings);

const tracker = document.getElementById("tracker");
let isDragging = false, dragOffsetX = 0, dragOffsetY = 0;

tracker.addEventListener("mousedown", (e) => {
  if (e.target.closest("button") || e.target.closest("input") || e.target.closest("label")) return;
  isDragging = true;
  dragOffsetX = e.clientX - tracker.offsetLeft;
  dragOffsetY = e.clientY - tracker.offsetTop;
  
  // Prevent text selection while dragging
  e.preventDefault();
  document.body.style.userSelect = 'none';
  document.body.style.webkitUserSelect = 'none';
});

document.addEventListener("mousemove", (e) => {
  if (isDragging) {
    e.preventDefault();
    const maxX = Math.max(0, window.innerWidth - tracker.offsetWidth);
    const maxY = Math.max(0, window.innerHeight - tracker.offsetHeight);
    const x = Math.max(0, Math.min(maxX, e.clientX - dragOffsetX));
    const y = Math.max(0, Math.min(maxY, e.clientY - dragOffsetY));
    tracker.style.left = `${x}px`;
    tracker.style.top = `${y}px`;
  }
});

document.addEventListener("mouseup", (e) => {
  if (isDragging) {
    localStorage.setItem("trackerPosX", tracker.style.left);
    localStorage.setItem("trackerPosY", tracker.style.top);
    
    // Re-enable text selection
    document.body.style.userSelect = '';
    document.body.style.webkitUserSelect = '';
  }
  isDragging = false;
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    window.parent.postMessage({ type: "pin" }, "*");
  }
});

const savedX = localStorage.getItem("trackerPosX");
const savedY = localStorage.getItem("trackerPosY");
if (savedX && savedY) {
  tracker.style.left = savedX;
  tracker.style.top = savedY;
}

requestInventory();