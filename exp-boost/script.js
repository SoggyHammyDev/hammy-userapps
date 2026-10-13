const BOOSTS = {
  exp_bonus_ee: "EXP Bonus: 15% (1 hour)",
  exp_bonus_day: "EXP Bonus: 10% (1 day)",
  exp_bonus_ee2: "EXP Bonus: 10% (90 Minutes)",
  exp_bonus_week: "EXP Bonus 5% (1 Week)",
  exp_bonus_ee3: "EXP Bonus 5% (2 hours)",
  exp_bonus_15: "EXP Bonus: 50% (30 minutes)",
};

let foundBoosts = {};

// The Main menu's Identity entry contains the active bonuses in its description.
// The menu also uses HTML entities such as &#37; for the percent sign.
const BOOST_TYPES = [
  {id:"exp_bonus_ee",pattern:/15%\s*Exp Bonus\s*\(1 Hour\)/i,name:"15% (1 hour)"},
  {id:"exp_bonus_ee2",pattern:/10%\s*Exp Bonus\s*\(90 Minutes\)/i,name:"10% (90 minutes)"},
  {id:"exp_bonus_day",pattern:/10%\s*Exp Bonus\s*\(1 day\)/i,name:"10% (1 day)"},
  {id:"exp_bonus_ee3",pattern:/5%\s*Exp Bonus\s*\(2 hours\)/i,name:"5% (2 hours)"},
  {id:"exp_bonus_week",pattern:/5%\s*Exp Bonus\s*\(One Week\)/i,name:"5% (one week)"},
  {id:"exp_bonus_15",pattern:/50%\s*Exp Bonus\s*\(30 minutes\)/i,name:"50% (30 minutes)"},
  {id:"faction",pattern:/5%\s*Exp Bonus\s*\(Faction\)/i,name:"5% (faction)"}
];
const activeBoosts = new Map();
const expiryMisses = new Map();
const recentlyRedeemed = new Map();
const expectedExpiry = new Map();
const absenceStarted = new Map();
const watched = new Set();
let identityLastSeen = 0;
let identitySnapshotValid = false;
let autoRenewEnabled = false;
let lastIdentityText = "";
const REQUEST_INTERVAL = 15000;
const SNAPSHOT_AGE_LIMIT = 45000;
const RETRY_WINDOW = 120000;

function cleanText(text) {
  const element = document.createElement("textarea");
  element.innerHTML = String(text || "");
  return element.value.replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
}
function identityDescription(rawChoices) {
  let choices = rawChoices;
  if (typeof choices === "string") {
    try { choices = JSON.parse(choices); } catch { return null; }
  }
  if (!Array.isArray(choices)) return null;
  const identity = choices.find(row =>
    Array.isArray(row) && /^Identity$/i.test(cleanText(row[0])) ||
    row && !Array.isArray(row) && typeof row === "object" && /^Identity$/i.test(cleanText(row.label || row.name || row.title))
  );
  if (!identity) return null;
  return Array.isArray(identity)
    ? String(identity[1] || "")
    : String(identity.description || identity.text || "");
}
function observedExpiry(text, now) {
  const relative = text.match(/Expires?\s+in\s+(\d{1,3})h\s+(\d{1,2})m/i);
  if (relative) return now + (Number(relative[1])*60 + Number(relative[2]))*60000;
  // Calendar dates are shown without a year/time zone; do not guess expiration.
  return null;
}
function parseIdentitySnapshot(description) {
  const now = Date.now();
  const text = cleanText(description);
  const next = new Map();
  const re = /(\d{1,2}%\s*Exp Bonus\s*\([^)]+\))\s*\(\s*(Expires?[^)]+)\)/gi;
  let match;
  while ((match = re.exec(text))) {
    const type = BOOST_TYPES.find(b => b.pattern.test(match[1]));
    if (!type) continue;
    next.set(type.id, {type,expiry:observedExpiry(match[2],now),expiresText:match[2]});
  }
  identitySnapshotValid = true;
  identityLastSeen = now;
  const changed = text !== lastIdentityText;
  lastIdentityText = text;
  for (const [id,entry] of next) {
    const prior = activeBoosts.get(id);
    // Repeated unchanged menu snapshots must not continually extend timers.
    if (prior && !changed && prior.expiresText === entry.expiresText) entry.expiry = prior.expiry;
    activeBoosts.set(id,entry);
    if (entry.expiry !== null) expectedExpiry.set(id,entry.expiry);
    expiryMisses.delete(id);
    absenceStarted.delete(id);
    recentlyRedeemed.delete(id);
  }
  for (const id of Array.from(activeBoosts.keys())) {
    if (!next.has(id)) activeBoosts.delete(id);
  }
  // Require sustained absence after a previously observed expected expiry.
  // Never redeem merely because the boost was missing on initial load.
  for (const id of watched) {
    if (next.has(id)) continue;
    if (!absenceStarted.has(id)) absenceStarted.set(id,now);
    expiryMisses.set(id,(expiryMisses.get(id)||0)+1);
  }
  renderIdentityBoosts();
  maybeAutoRenew();
}
function inspectIdentityMenu(data) {
  if (!data || typeof data !== "object") return;
  let raw = data.menu_choices ?? data.choices;
  if (raw === undefined && data.menu_choice) raw = data.menu_choice;
  const description = identityDescription(raw);
  if (description !== null) parseIdentitySnapshot(description);
}
function renderIdentityBoosts() {
  const message = document.getElementById("identity-message");
  const listing = document.getElementById("identity-boosts");
  if (!identitySnapshotValid) {
    message.textContent = "Waiting for EXP boost data";
    return;
  }
  const fresh = Date.now()-identityLastSeen <= SNAPSHOT_AGE_LIMIT;
  message.textContent = fresh
    ? activeBoosts.size + " active EXP boost" + (activeBoosts.size === 1 ? "" : "s") + " detected"
    : "Waiting for fresh Identity data";
  listing.replaceChildren();
  for (const type of BOOST_TYPES) {
    const entry = activeBoosts.get(type.id);
    const row = document.createElement("div");
    row.className = "identity-boost-row";
    const label = document.createElement("span");
    let remaining = "Inactive";
    if (entry) {
      if (entry.expiry !== null) {
        const mins = Math.max(0,Math.ceil((entry.expiry-Date.now())/60000));
        remaining = mins > 0 ? Math.floor(mins/60)+"h "+(mins%60)+"m remaining" : "Expiration pending verification";
      } else remaining = entry.expiresText;
    }
    label.textContent = type.name + " · " + remaining;
    row.appendChild(label);
    if (type.id !== "faction") {
      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.checked = watched.has(type.id);
      toggle.title = "Auto-renew " + type.name;
      toggle.setAttribute("aria-label","Auto-renew " + type.name);
      toggle.addEventListener("change",()=>{
        if (toggle.checked) watched.add(type.id);
        else { watched.delete(type.id); expiryMisses.delete(type.id); }
      });
      row.appendChild(toggle);
    }
    listing.appendChild(row);
  }
}
function maybeAutoRenew() {
  if (!autoRenewEnabled || !identitySnapshotValid || Date.now()-identityLastSeen>SNAPSHOT_AGE_LIMIT) return;
  for (const id of watched) {
    const entry = activeBoosts.get(id);
    // Never spend while active. Require a previously seen timed expiry,
    // and two changed menu observations confirming it's absent.
    const expiry = expectedExpiry.get(id);
    if (entry || !Number.isFinite(expiry) || Date.now()<expiry ||
        (expiryMisses.get(id)||0)<2 || Date.now()-(absenceStarted.get(id)||Date.now())<15000 ||
        (foundBoosts[id]||0)<1) continue;
    const prior = recentlyRedeemed.get(id);
    if (prior && Date.now()-prior < RETRY_WINDOW) continue;
    recentlyRedeemed.set(id,Date.now());
    expiryMisses.set(id,0);
    expectedExpiry.delete(id);
    absenceStarted.delete(id);
    sendCommand("item "+id+" redeem");
    document.getElementById("identity-message").textContent = "Redeemed "+(BOOST_TYPES.find(t=>t.id===id)?.name||id)+"; awaiting verification";
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

setInterval(()=>{
  window.parent.postMessage({type:"getData"},"*");
  renderIdentityBoosts();
},REQUEST_INTERVAL);
document.getElementById("auto-renew-enabled").addEventListener("change",event=>{
  autoRenewEnabled=event.target.checked;
  maybeAutoRenew();
});
