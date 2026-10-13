const BOOSTS = {
  exp_bonus_ee: "EXP Bonus: 15% (1 hour)",
  exp_bonus_day: "EXP Bonus: 10% (1 day)",
  exp_bonus_ee2: "EXP Bonus: 10% (90 Minutes)",
  exp_bonus_week: "EXP Bonus 5% (1 Week)",
  exp_bonus_ee3: "EXP Bonus 5% (2 hours)",
  exp_bonus_15: "EXP Bonus: 50% (30 minutes)",
};

let foundBoosts = {};

// Identity menu details are observation-only until its live payload is verified.
const EXP_IDENTITY_PATTERN = /(EXP Bonus|EXP Boost)/i;
const EXP_EXPIRES_PATTERN = /Expires?\s+(?:in\s+[^)]*|[A-Za-z]+\s+\d+(?:st|nd|rd|th)?)/i;
const identityObserved = new Map();
function identityMenuText(value) {
  const lines = [];
  const visit = (node, depth=0) => {
    if (depth > 4 || lines.length > 100) return;
    if (typeof node === "string") { lines.push(node); return; }
    if (Array.isArray(node)) { node.forEach(v => visit(v, depth+1)); return; }
    if (node && typeof node === "object") {
      for (const [key,v] of Object.entries(node)) {
        if (/^(text|title|name|label|description|choice|value|html|menu|choices|menu_choices)$/i.test(key)) visit(v, depth+1);
      }
    }
  };
  visit(value);
  return lines;
}
function inspectIdentityMenu(data) {
  if (!data || typeof data !== "object") return;
  const menuName = String(data.menu || data.menu_name || "");
  const choices = data.menu_choices || data.choices || data.menu_choice;
  const lines = identityMenuText(choices);
  const combined = [menuName, ...lines].join(" ");
  if (!/identity/i.test(combined) && !lines.some(line => EXP_IDENTITY_PATTERN.test(line))) return;
  for (const line of lines) {
    const clean = String(line).replace(/<[^>]*>/g, " ").replace(/\\s+/g," ").trim();
    if (EXP_IDENTITY_PATTERN.test(clean) && EXP_EXPIRES_PATTERN.test(clean)) identityObserved.set(clean, Date.now());
  }
  const message = document.getElementById("identity-message");
  const listing = document.getElementById("identity-boosts");
  if (!identityObserved.size) return;
  message.textContent = identityObserved.size + " active EXP bonus" + (identityObserved.size === 1 ? "" : "es") + " observed";
  listing.replaceChildren();
  for (const label of identityObserved.keys()) {
    const row = document.createElement("div");
    row.textContent = label;
    listing.appendChild(row);
  }
}



function parseInventory(data) {
  foundBoosts = {};
  for (const [id, item] of Object.entries(data)) {
    if (BOOSTS[id]) {
      foundBoosts[id] = item.amount;
    }
  }
  updateUI();
}

function updateUI() {
  const openBtn = document.getElementById("open-ui");
  const keys = Object.keys(foundBoosts).filter(id => (foundBoosts[id] || 0) > 0);
  const total = keys.reduce((sum, id) => sum + (Number(foundBoosts[id]) || 0), 0);

  openBtn.style.display = keys.length > 0 ? "inline-block" : "none";

  const boostCount = document.getElementById("boost-count");
  const totalBoosts = document.getElementById("total-boosts");
  const boostStatus = document.getElementById("boost-status");
  const summary = document.getElementById("boost-summary");

  if (boostCount) boostCount.textContent = keys.length;
  if (totalBoosts) totalBoosts.textContent = total.toLocaleString();

  if (boostStatus) {
    boostStatus.textContent = keys.length > 0
      ? `${total.toLocaleString()} boost${total === 1 ? "" : "s"} ready to redeem`
      : "No EXP boosts detected";
  }

  if (summary) summary.classList.toggle("empty", keys.length === 0);
}

function buildPopup() {
  const form = document.getElementById("exp-form");
  form.innerHTML = "";

  for (const [id, label] of Object.entries(BOOSTS)) {
    if (foundBoosts[id]) {
      const box = document.createElement("div");
      box.innerHTML = `
        <label>
          <input type="checkbox" name="exp" value="${id}">
          ${label} (${foundBoosts[id]})
        </label>
      `;
      form.appendChild(box);
    }
  }
}

function sendCommand(cmd) {
  window.parent.postMessage({ type: "sendCommand", command: cmd }, "*");
}

document.getElementById("faction-menu-btn").addEventListener("click", () => {
  sendCommand("faction");
  document.getElementById("popup").classList.add("hidden");
});

document.getElementById("open-ui").addEventListener("click", () => {
  buildPopup();
  document.getElementById("popup").classList.remove("hidden");
});

document.getElementById("cancel-btn").addEventListener("click", () => {
  document.getElementById("popup").classList.add("hidden");
});

document.getElementById("redeem-btn").addEventListener("click", () => {
  const selected = Array.from(document.querySelectorAll("input[name='exp']:checked"));
  selected.forEach(cb => {
    const cmd = `item ${cb.value} redeem`;
    sendCommand(cmd);
  });
  document.getElementById("popup").classList.add("hidden");
});

(function makeDraggable() {
  const dragEl = document.getElementById("exp-redeemer");
  const header = document.getElementById("exp-header");

  let offsetX, offsetY, dragging = false;

  header.addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) return;
    dragging = true;
    offsetX = e.clientX - dragEl.offsetLeft;
    offsetY = e.clientY - dragEl.offsetTop;
  });

  window.addEventListener("mousemove", (e) => {
    if (dragging) {
      const rawLeft = e.clientX - offsetX;
      const rawTop = e.clientY - offsetY;
      const maxLeft = Math.max(0, window.innerWidth - dragEl.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - dragEl.offsetHeight);
      const left = Math.max(0, Math.min(rawLeft, maxLeft));
      const top = Math.max(0, Math.min(rawTop, maxTop));
      dragEl.style.left = left + "px";
      dragEl.style.top = top + "px";
      localStorage.setItem("exp_redeemer_left", left);
      localStorage.setItem("exp_redeemer_top", top);
    }
  });

  window.addEventListener("mouseup", () => {
    dragging = false;
  });
})();



window.parent.postMessage({
  type: "registerTrigger",
  trigger: "redeem_all_exp",
  name: "Redeem All EXP Boosts"
}, "*");

window.addEventListener("message", (event) => {
  const raw = event.data;
  const data = raw?.data || raw;
  inspectIdentityMenu(data);

  if (data?.inventory) {
    let parsedInventory = {};
    try {
      parsedInventory = typeof data.inventory === "string"
        ? JSON.parse(data.inventory)
        : data.inventory;

      parseInventory(parsedInventory);
    } catch (err) {
    }
  }
  else if (data?.trigger_redeem_all_exp) {
    const PRIORITY_ORDER = [
      "exp_bonus_ee",
      "exp_bonus_ee3",
      "exp_bonus_day",
      "exp_bonus_ee2",
      "exp_bonus_week",
    ];

    const availableBoosts = PRIORITY_ORDER.filter(id => foundBoosts[id] > 0);

    if (availableBoosts.length > 0) {
      availableBoosts.forEach(boostId => {
        const cmd = `item ${boostId} redeem`;
        sendCommand(cmd);
      });
    }
  }
});


window.addEventListener("load", () => {
  const toggleBtn = document.getElementById("exp-toggle-btn");
  const expRedeemer = document.getElementById("exp-redeemer");

  const left = localStorage.getItem("exp_redeemer_left");
  const top = localStorage.getItem("exp_redeemer_top");
  if (left && top) {
    const x = Math.max(0, Math.min(Number(left) || 0, Math.max(0, window.innerWidth - expRedeemer.offsetWidth)));
    const y = Math.max(0, Math.min(Number(top) || 0, Math.max(0, window.innerHeight - expRedeemer.offsetHeight)));
    expRedeemer.style.left = x + "px";
    expRedeemer.style.top = y + "px";
  }

  document.getElementById("close").addEventListener("click", () => {
    expRedeemer.style.display = "none";
    toggleBtn.classList.remove("hidden");
  });

  toggleBtn.addEventListener("click", () => {
    expRedeemer.style.display = "block";
    toggleBtn.classList.add("hidden");
  });

  window.parent.postMessage({ type: "getData" }, "*");
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    window.parent.postMessage({ type: "pin" }, "*");
  }
});
