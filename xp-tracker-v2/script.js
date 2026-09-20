let lastInventoryObj = {};
let selectedJobs = [];
let expLogs = {};
let lastBXPs = {};
let initialExps = {};
let lastExps = {};
let hasFirstGain = {};
let lastUpdateTime = {};
let lastDisplayedExps = {};
let lastRenderTime = 0;
let hasReceivedAnyData = false;
let hasRequestedOnce = false;

const TRACKER_SIZE_KEY = "tracker-app-size";
const TRACKER_POSITION_KEY = "tracker-app-position";
const XP_FONT_SIZE_KEY = "xp-font-size";
const RECENT_WINDOW_MS = 10 * 60 * 1000;
const RENDER_THROTTLE_MS = 500;

const JOBS = [
  { key: "trucker", label: "Trucker" },
  { key: "mechanic", label: "Mechanic" },
  { key: "garbage", label: "Garbage" },
  { key: "postop", label: "PostOP" },
  { key: "pilot", label: "Airline Pilot" },
  { key: "helicopterpilot", label: "Helicopter Pilot" },
  { key: "cargopilot", label: "Cargo Pilot" },
  { key: "busdriver", label: "Bus Driver" },
  { key: "conductor", label: "Train Conductor" },
  { key: "emergency", label: "EMS" },
  { key: "player", label: "Player" },
  { key: "firefighter", label: "Firefighter" },
  { key: "racer", label: "Racer" },
  { key: "farmer", label: "Farmer" },
  { key: "fisher", label: "Fisher" },
  { key: "strength", label: "Strength" },
  { key: "miner", label: "Miner" },
  { key: "business", label: "Business" },
  { key: "hunter", label: "Hunter" }
];

const JOB_EXP_KEYS = {
  trucker: "exp_trucking_trucking",
  mechanic: "exp_trucking_mechanic",
  garbage: "exp_trucking_garbage",
  postop: "exp_trucking_postop",
  pilot: "exp_piloting_piloting",
  helicopterpilot: "exp_piloting_heli",
  cargopilot: "exp_piloting_cargos",
  busdriver: "exp_train_bus",
  conductor: "exp_train_train",
  emergency: "exp_ems_ems",
  firefighter: "exp_ems_fire",
  racer: "exp_player_racing",
  farmer: "exp_farming_farming",
  fisher: "exp_farming_fishing",
  miner: "exp_farming_mining",
  business: "exp_business_business",
  hunter: "exp_hunting_skill",
  player: "exp_player_player",
  strength: "exp_physical_strength"
};

const JOB_BXP_KEYS = {
  trucker:       "exp_token_a|trucking|trucking",
  mechanic:      "exp_token_a|trucking|mechanic",
  garbage:       "exp_token_a|trucking|garbage",
  postop:        "exp_token_a|trucking|postop",
  pilot:         "exp_token_a|piloting|piloting",
  helicopterpilot:"exp_token_a|piloting|heli",
  cargopilot:    "exp_token_a|piloting|cargos",
  busdriver:     "exp_token_a|train|bus",
  conductor:     "exp_token_a|train|train",
  emergency:     "exp_token_a|ems|ems",
  firefighter:   "exp_token_a|ems|fire",
  racer:         "exp_token_a|player|racing",
  farmer:        "exp_token_a|farming|farming",
  fisher:        "exp_token_a|farming|fishing",
  miner:         "exp_token_a|farming|mining",
  business:      "exp_token_a|business|business",
  hunter:        "exp_token_a|hunting|skill",
  player:        "exp_token_a|player|player",
  strength:      "exp_token_a|physical|strength"
};

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(2) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toLocaleString();
}

function getAllRequiredKeys() {
  const expKeys = Object.values(JOB_EXP_KEYS);
  
  const bxpKeys = Object.values(JOB_BXP_KEYS);
  
  const inventoryKey = ["inventory"];
  
  return [...expKeys, ...bxpKeys, ...inventoryKey];
}

function getLevelInfo(exp) {
  let level = 0;
  let xpCap = 5;
  while (exp >= xpCap) {
    exp -= xpCap;
    level++;
    xpCap = (level + 1) * 5;
  }
  return { level, expInLevel: exp, expForNext: xpCap };
}

function getSortedJobs() {
  return [...JOBS].sort((a, b) => a.label.localeCompare(b.label));
}

function getPercentValue(exp, cap) {
  if (typeof exp !== "number") return null;
  const pct = Math.max(0, Math.min(100, (exp / cap) * 100));
  return +pct.toFixed(1);
}

function get1MPercentValue(jobKey) {
  const exp = lastExps[jobKey];
  return getPercentValue(exp, 1_000_000);
}

function get10MPercentValue(jobKey) {
  const exp = lastExps[jobKey];
  return getPercentValue(exp, 10_000_000);
}

function saveData() {
  localStorage.setItem("selected-jobs", JSON.stringify(selectedJobs));
  localStorage.setItem("exp-logs", JSON.stringify(expLogs));
}

function loadData() {
  selectedJobs = JSON.parse(localStorage.getItem("selected-jobs") || "[]");
  
  if (selectedJobs.length === 0) {
    selectedJobs = ["player", "trucker", "mechanic"];
    localStorage.setItem("selected-jobs", JSON.stringify(selectedJobs));
  }
  
  expLogs = JSON.parse(localStorage.getItem("exp-logs") || "{}");
  loadSettings();
  loadFontSize();
  renderSummary();
}

function resetAllData() {
  Object.keys(expLogs).forEach(key => delete expLogs[key]);
  Object.keys(initialExps).forEach(key => delete initialExps[key]);
  Object.keys(hasFirstGain).forEach(key => delete hasFirstGain[key]);
  Object.keys(lastUpdateTime).forEach(key => delete lastUpdateTime[key]);
  
  selectedJobs.forEach(jobKey => {
    const exp = lastExps[jobKey];
    if (typeof exp === "number") {
      expLogs[jobKey] = [];
      initialExps[jobKey] = exp;
      hasFirstGain[jobKey] = false;
    }
  });
  
  saveData();
  renderStats();
}

function saveSettings() {
  try {
    const settings = {
      bxp: document.getElementById("toggle-bxp").checked,
      currentLevel: document.getElementById("toggle-current-level").checked,
      expHr: document.getElementById("toggle-exp-hr").checked,
      expMin: document.getElementById("toggle-exp-min").checked,
      perkChance: document.getElementById("toggle-perk-chance").checked,
      oneMPercent: document.getElementById("toggle-1m-percent").checked,
      tenMPercent: document.getElementById("toggle-10m-percent").checked,
      level: document.getElementById("toggle-level").checked
    };
    localStorage.setItem("tracker-settings", JSON.stringify(settings));
  } catch (error) {
  }
}

function loadSettings() {
  try {
    const savedSettings = localStorage.getItem("tracker-settings");
    const settings = savedSettings ? JSON.parse(savedSettings) : {};
    
    document.getElementById("toggle-bxp").checked = settings.bxp !== false;
    document.getElementById("toggle-current-level").checked = settings.currentLevel !== false;
    document.getElementById("toggle-exp-hr").checked = settings.expHr !== false;
    document.getElementById("toggle-exp-min").checked = settings.expMin !== false;
    document.getElementById("toggle-perk-chance").checked = settings.perkChance !== false;
    document.getElementById("toggle-1m-percent").checked = settings.oneMPercent === true;
    document.getElementById("toggle-10m-percent").checked = settings.tenMPercent === true;
    document.getElementById("toggle-level").checked = settings.level !== false;
  } catch (error) {
    console.error("Error loading settings:", error);
  }
}

function getSettings() {
  return {
    bxp: document.getElementById("toggle-bxp").checked,
    currentLevel: document.getElementById("toggle-current-level").checked,
    expHr: document.getElementById("toggle-exp-hr").checked,
    expMin: document.getElementById("toggle-exp-min").checked,
    perkChance: document.getElementById("toggle-perk-chance").checked,
    oneMPercent: document.getElementById("toggle-1m-percent").checked,
    tenMPercent: document.getElementById("toggle-10m-percent").checked,
    level: document.getElementById("toggle-level").checked
  };
}

function applySettingsPosition(position) {
  const panel = document.getElementById("settings-panel");
  const icon = document.getElementById("settings-icon");
  
  icon.className = icon.className.replace(/position-\w+/g, '');
  
  switch(position) {
    case "bottom-right":
      icon.classList.add("position-bottom-right");
      panel.style.cssText = "position: fixed; bottom: 60px; right: 10px; top: auto; left: auto; transform: none;";
      break;
    case "bottom-left":
      icon.classList.add("position-bottom-left");
      panel.style.cssText = "position: fixed; bottom: 60px; left: 10px; top: auto; right: auto; transform: none;";
      break;
    case "top-left":
      icon.classList.add("position-top-left");
      panel.style.cssText = "position: fixed; top: 60px; left: 10px; bottom: auto; right: auto; transform: none;";
      break;
    case "top-right":
      icon.classList.add("position-top-right");
      panel.style.cssText = "position: fixed; top: 60px; right: 10px; bottom: auto; left: auto; transform: none;";
      break;
    case "top-left":
    default:
      icon.classList.add("position-top-left");
      panel.style.cssText = "position: fixed; top: 60px; left: 10px; bottom: auto; right: auto; transform: none;";
      break;
  }
}

function loadFontSize() {
  const size = localStorage.getItem(XP_FONT_SIZE_KEY) || "12";
  document.getElementById("xp-font-size").value = size;
  document.getElementById("xp-font-size-value").textContent = size;
  applyFontSize(size);
}

function saveFontSize(size) {
  localStorage.setItem(XP_FONT_SIZE_KEY, size);
  document.getElementById("xp-font-size-value").textContent = size;
  applyFontSize(size);
}

function applyFontSize(size) {
  document.documentElement.style.setProperty('--stat-font-size', size + 'px');
}

function savePosition() {
  const app = document.getElementById("tracker-app");
  if (app) {
    const position = {
      left: app.style.left,
      top: app.style.top,
      width: app.style.width,
      height: app.style.height
    };
    localStorage.setItem(TRACKER_POSITION_KEY, JSON.stringify(position));
  }
  
  // Reposition settings panel if needed
  adjustSettingsPosition();
}

function adjustSettingsPosition() {
  const app = document.getElementById("tracker-app");
  const panel = document.getElementById("settings-panel");
  
  if (!app || !panel) return;
  
  const appRect = app.getBoundingClientRect();
  const appWidth = appRect.width;
  
  // If tracker is narrow, adjust settings panel
  if (appWidth < 350) {
    panel.style.right = 'auto';
    panel.style.left = '6px';
    panel.style.width = 'calc(100% - 12px)';
  } else {
    panel.style.right = '6px';
    panel.style.left = 'auto';
    panel.style.width = 'min(230px, calc(100% - 12px))';
  }
}

function loadPosition() {
  const savedPosition = localStorage.getItem(TRACKER_POSITION_KEY);
  if (savedPosition) {
    try {
      const position = JSON.parse(savedPosition);
      const app = document.getElementById("tracker-app");
      if (app && position) {
        if (position.left) app.style.left = position.left;
        if (position.top) app.style.top = position.top;
        if (position.width) app.style.width = position.width;
        if (position.height) app.style.height = position.height;
      }
    } catch (e) {
      console.warn("Failed to load saved position:", e);
    }
  }
}

function renderStats() {
  const now = Date.now();
  if (now - lastRenderTime < RENDER_THROTTLE_MS) {
    return;
  }
  lastRenderTime = now;
  
  renderSummary();
  
  if (selectedJobs.length === 0) {
    document.getElementById("job-list").style.display = "block";
  }
}

function renderSummary() {
  const settings = getSettings();
  
  const tbody = document.getElementById("summary-tbody");
  const thead = document.getElementById("summary-thead");
  
  if (selectedJobs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="100%" class="text-center text-muted">Select jobs to track XP</td></tr>';
    thead.innerHTML = '';
    return;
  }
  
  const hasAnyData = selectedJobs.some(jobKey => {
    const exp = lastExps[jobKey];
    return typeof exp === "number" && exp > 0;
  });
  
  if (!hasAnyData) {
    tbody.innerHTML = '<tr><td colspan="100%" class="text-center text-muted">Loading XP data... <br><small>Make sure the XP Tracker resource is running</small></td></tr>';
    thead.innerHTML = '';
    return;
  }
  
  const columns = [
    { key: "job", label: "Job" },
    { key: "current", label: "Current XP" }
  ];
  
  if (settings.currentLevel) columns.push({ key: "currentLevel", label: "Level" });
  if (settings.bxp) columns.push({ key: "bxp", label: "BXP" });
  if (settings.level) columns.push({ key: "level", label: "Next Level In" });
  if (settings.expHr) columns.push({ key: "exp_hr", label: "XP/hr" });
  if (settings.expMin) columns.push({ key: "exp_min", label: "XP/min" });
  if (settings.oneMPercent) columns.push({ key: "1m_percent", label: "1M %" });
  if (settings.tenMPercent) columns.push({ key: "10m_percent", label: "10M %" });
  if (settings.perkChance) columns.push({ key: "perk", label: "Perk Chance" });
  
  thead.innerHTML = `<tr>${columns.map(col => `<th>${col.label}</th>`).join('')}</tr>`;
  
  const rows = [];
  selectedJobs.forEach(jobKey => {
    const job = JOBS.find(j => j.key === jobKey);
    if (!job) return;
    
    const stats = calculateJobStats(jobKey);
    const row = [];
    
    columns.forEach(col => {
      if (col.key === "job") {
        row.push(`<td>${job.label}</td>`);
      }
      else if (col.key === "current") {
        row.push(`<td>${formatNumber(stats.currentExp)}</td>`);
      }
      else if (col.key === "currentLevel") {
        const levelInfo = stats.levelInfo;
        row.push(`<td>Level ${levelInfo.level}</td>`);
      }
      else if (col.key === "bxp") {
        if (stats.bxp > 0) {
          row.push(`<td><span class="badge text-bg-success">${formatNumber(stats.bxp)}</span></td>`);
        } else {
          row.push(`<td>—</td>`);
        }
      }
      else if (col.key === "level") {
        const levelInfo = stats.levelInfo;
        const xpToNext = Math.round(levelInfo.expForNext - levelInfo.expInLevel);
        row.push(`<td>${formatNumber(xpToNext)} XP</td>`);
      }
      else if (col.key === "exp_hr") {
        row.push(`<td>${formatNumber(stats.expPerHour)}</td>`);
      }
      else if (col.key === "exp_min") {
        row.push(`<td>${formatNumber(stats.expPerMin)}</td>`);
      }
      else if (col.key === "1m_percent") {
        const pct = get1MPercentValue(jobKey);
        if (pct === null) row.push(`<td>—</td>`);
        else {
          row.push(`<td>${renderPercent(pct)}</td>`);
        }
      }
      else if (col.key === "10m_percent") {
        const pct = get10MPercentValue(jobKey);
        if (pct === null) row.push(`<td>—</td>`);
        else {
          row.push(`<td>${renderPercent(pct)}</td>`);
        }
      }
      else if (col.key === "perk") {
        row.push(`<td>${stats.perkChance}</td>`);
      }
    });
    
    rows.push(`<tr>${row.join('')}</tr>`);
  });
  
  tbody.innerHTML = rows.join('');
}

function calculateJobStats(jobKey) {
  const currentExp = lastExps[jobKey] || 0;
  const bxp = lastBXPs[jobKey] || 0;
  const log = expLogs[jobKey] || [];
  
  let expPerHour = 0;
  let expPerMin = 0;
  
  if (log.length >= 2) {
    const recent = log.filter(entry => Date.now() - entry.time <= RECENT_WINDOW_MS);
    if (recent.length >= 2) {
      const firstEntry = recent[0];
      const lastEntry = recent[recent.length - 1];
      const timeDiff = lastEntry.time - firstEntry.time;
      const expDiff = lastEntry.exp - firstEntry.exp;
      
      if (timeDiff > 0) {
        expPerHour = Math.round((expDiff / timeDiff) * (1000 * 60 * 60));
        expPerMin = Math.round(expPerHour / 60);
      }
    }
  }

  function getPerkChance() {
    if (!log || log.length < 2) return "—";
    
    const last = log[log.length - 1];
    const exp = last.exp;
    
    if (exp >= 1_000_000) return "Guaranteed";
    
    const prev = log[log.length - 2];
    const gained = last.exp - prev.exp;
    
    if (gained > 0) {
      const dropsLeft = (1_000_000 - exp) / gained;
      if (dropsLeft <= 1) {
        return "Guaranteed";
      } else {
        return formatNumber(Math.round(dropsLeft));
      }
    }
    return "—";
  }
  
  return {
    currentExp,
    bxp,
    expPerHour,
    expPerMin,
    oneM: ((currentExp / 1000000) * 100).toFixed(1),
    tenM: ((currentExp / 10000000) * 100).toFixed(1),
    perkChance: getPerkChance(),
    levelInfo: getLevelInfo(currentExp)
  };
}

function backfillExpLogIfMissing(jobKey) {
  if (typeof lastExps[jobKey] === "number" && (!Array.isArray(expLogs[jobKey]) || expLogs[jobKey].length < 2)) {
    const exp = lastExps[jobKey];
    const now = Date.now();
    expLogs[jobKey] = [
      { time: now - 5000, exp },
      { time: now, exp }
    ];
    initialExps[jobKey] = exp;
    hasFirstGain[jobKey] = true;
  }
  if (typeof lastExps[jobKey] === "number" && (!Array.isArray(expLogs[jobKey]) || expLogs[jobKey].length < 2)) {
    const exp = lastExps[jobKey];
    const now = Date.now();
    expLogs[jobKey] = [
      { time: now - 5000, exp },
      { time: now, exp }
    ];
    initialExps[jobKey] = exp;
    hasFirstGain[jobKey] = true;
  }
}

function setupUIHandlers() {
  document.getElementById("settings-icon").addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const panel = document.getElementById("settings-panel");
    if (panel.style.display === "none" || !panel.style.display) {
      panel.style.display = "block";
      adjustSettingsPosition(); // Adjust position when opening
    } else {
      panel.style.display = "none";
    }
  });
  
  document.addEventListener("click", (e) => {
    const panel = document.getElementById("settings-panel");
    const icon = document.getElementById("settings-icon");
    
    if (!panel.contains(e.target) && !icon.contains(e.target)) {
      panel.style.display = "none";
    }
  });
  
  ["toggle-bxp", "toggle-current-level", "toggle-exp-hr", "toggle-exp-min", "toggle-1m-percent", 
   "toggle-10m-percent", "toggle-perk-chance", "toggle-level"].forEach(id => {
    document.getElementById(id).addEventListener("change", () => {
      saveSettings();
      renderSummary();
    });
  });
  
  document.getElementById("xp-font-size").addEventListener("input", function() {
    saveFontSize(this.value);
  });
  
  document.getElementById("reset-exp-log").addEventListener("click", resetAllData);
}

function renderJobPills() {
  const jobList = document.getElementById("job-list");
  const sortedJobs = getSortedJobs();
  
  const pills = sortedJobs.map(job => {
    const isSelected = selectedJobs.includes(job.key);
    return `
      <label class="job-pill ${isSelected ? 'selected' : ''}">
        <input type="checkbox" 
               data-job-key="${job.key}" 
               ${isSelected ? 'checked' : ''}
               onchange="toggleJob('${job.key}')">
        ${job.label}
      </label>
    `;
  }).join('');
  
  jobList.innerHTML = pills;
}

function toggleJob(jobKey) {
  const index = selectedJobs.indexOf(jobKey);
  if (index === -1) {
    selectedJobs.push(jobKey);
  } else {
    selectedJobs.splice(index, 1);
  }
  
  saveData();
  renderJobPills();

  lastRenderTime = 0;
  renderStats();
}

window.toggleJob = toggleJob;

function processGameData(data) {
  const now = Date.now();
  let inventory = {};
  let hasExpChanges = false;
  
  if (data.inventory) {
    try {
      inventory = typeof data.inventory === "string" ? JSON.parse(data.inventory) : data.inventory;
      if (inventory) lastInventoryObj = inventory;
    } catch {
      inventory = lastInventoryObj;
    }
  } else {
    inventory = lastInventoryObj;
  }
  
  JOBS.forEach(job => {
    const expKey = JOB_EXP_KEYS[job.key];
    const exp = data[expKey];
    if (typeof exp === "number") {
      const oldExp = lastExps[job.key];
      if (oldExp !== exp) {
        hasExpChanges = true;
      }
      lastExps[job.key] = exp;
    }
  });
  
  selectedJobs.forEach(jobKey => {
    const job = JOBS.find(j => j.key === jobKey);
    if (!job) return;
    
    const expKey = JOB_EXP_KEYS[jobKey];
    const exp = data[expKey];
    
    if (typeof exp === "number") {
      if (!expLogs[jobKey]) expLogs[jobKey] = [];
      const log = expLogs[jobKey];
      
      if (!hasFirstGain[jobKey]) {
        if (typeof initialExps[jobKey] !== "number") {
          initialExps[jobKey] = exp;
        }
      }
      
      if (!hasFirstGain[jobKey] && exp !== initialExps[jobKey]) {
        hasFirstGain[jobKey] = true;
        if (typeof initialExps[jobKey] !== "number" || initialExps[jobKey] === 0) {
          initialExps[jobKey] = exp - (exp - (log[log.length - 1]?.exp || 0));
        }
      }
      
      const lastEntry = log[log.length - 1];
      
      if (lastEntry === undefined) {
        lastUpdateTime[jobKey] = now;
      } else if (exp > lastEntry.exp) {
        const gain = exp - lastEntry.exp;
        log.push({ time: now, exp });
        lastUpdateTime[jobKey] = now;
        
        const lastDisplayed = lastDisplayedExps[jobKey] || 0;
        if (exp > lastDisplayed) {
          lastDisplayedExps[jobKey] = exp;
        }
      }
      
      if (log.length === 0 && hasFirstGain[jobKey]) {
        log.push({ time: now - 5000, exp: initialExps[jobKey] });
        log.push({ time: now, exp });
        lastUpdateTime[jobKey] = now;
      }
      
      if (log.length > 2) {
        const recentCutoff = now - RECENT_WINDOW_MS;
        expLogs[jobKey] = log.filter((entry, idx) => {
          return idx === 0 || entry.time >= recentCutoff;
        });
      }
    }
    
    const bxpToken = JOB_BXP_KEYS[jobKey];
    let bxpObj;
    
    if (bxpToken && data[bxpToken]) {
      bxpObj = data[bxpToken];
    }
    else if (bxpToken && inventory && typeof inventory === 'object') {
      bxpObj = inventory[bxpToken];
      if (!bxpObj) {
        const fallbackKey = Object.keys(inventory).find(k => k.startsWith(bxpToken));
        if (fallbackKey) bxpObj = inventory[fallbackKey];
      }
    }
    
    if (bxpObj && typeof bxpObj.amount === "number") {
      lastBXPs[jobKey] = bxpObj.amount;
    } else if (typeof bxpObj === "number") {
      lastBXPs[jobKey] = bxpObj;
    } else {
      delete lastBXPs[jobKey];
    }
  });
  
  saveData();
  renderStats();
}

function requestDataOnce(force = false) {
  if (hasRequestedOnce && !force) return;
  hasRequestedOnce = true;
  try {
    const keys = getAllRequiredKeys();
    window.parent.postMessage({ 
      type: "getNamedData",
      keys: keys
    }, "*");
  } catch (e) {
    console.error("Failed to send message to parent:", e);
    // Fallback to old method
    window.parent.postMessage({ type: "getData" }, "*");
  }
}

function init() {
  loadData();
  loadPosition();
  renderJobPills();
  renderStats();
  setupUIHandlers();
  
  saveSettings();
  
  // Adjust settings position on window resize
  window.addEventListener('resize', adjustSettingsPosition);
  
  const isNui = window.parent !== window || navigator.userAgent.includes('CitizenFX');
  if (isNui) {
    document.body.classList.add('no-blur');
  }
  
  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (msg && msg.type === "data" && msg.data) {
      hasReceivedAnyData = true;         
      processGameData(msg.data);
    }
    else if (msg && msg.type === "chat:open") {
      document.body.classList.add('no-blur');
    }
    else if (msg && msg.type === "chat:close") {
      document.body.classList.remove('no-blur');
    }
  });

  // Initial optimized data request
  requestDataOnce();

  // Retry mechanism if no data received within 1.2 seconds
  setTimeout(() => {
    if (!hasReceivedAnyData) {
      requestDataOnce(true);
    }
  }, 1200);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}


function renderPercent(pct){
  if (pct == null || isNaN(pct)) return '—';
  const val = Math.max(0, Math.min(100, +pct.toFixed(1)));
  return `<span class="text-white">${val}%</span>`;
}

const escapeListener = (e) => {
  if (e.key === "Escape") {
    window.parent.postMessage({type: "pin"}, "*");
  }
};
window.addEventListener('keydown', escapeListener);

(() => {
  const title = document.querySelector('.panel-header .title');
  const jobList = document.getElementById('job-list');
  if (title && jobList) {
    title.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      jobList.style.display = jobList.style.display === 'none' || jobList.style.display === '' ? 'block' : 'none';
    });
  }
})();

(() => {
  const btn = document.getElementById('minimize-btn');
  const toolbar = document.querySelector('.toolbar');
  if (btn && toolbar) {
    btn.addEventListener('click', () => {
      toolbar.style.display = toolbar.style.display === 'none' ? '' : 'none';
    });
  }
})();

(() => {
  const range = document.getElementById('xp-font-size');
  const out = document.getElementById('xp-font-size-value');
  const table = document.getElementById('summary-table');
  if (range && out && table) {
    const apply = (px) => {
      table.style.fontSize = `${px}px`;
      out.textContent = `${px}px`;
    };
    apply(range.value);
    range.addEventListener('input', () => apply(range.value));
  }
})();

(() => {
  const app = document.getElementById('tracker-app');
  const handle = document.getElementById('drag-handle');
  const rh = document.getElementById('resize-handle');
  if (!app || !handle) return;
  
  let sx=0, sy=0, ax=0, ay=0, dragging=false;
  let sw=0, sh=0, resizing=false;

  function startDrag(clientX, clientY, e) {
    if (e && e.target.closest('button')) return;
    if (e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
    dragging = true; sx = clientX; sy = clientY;
    const rect = app.getBoundingClientRect(); ax = rect.left; ay = rect.top;
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';
    document.body.style.msUserSelect = 'none';
    document.body.style.mozUserSelect = 'none';
    document.documentElement.style.cursor = 'grabbing';
    handle.classList.add('dragging');
  }

  handle.addEventListener('mousedown', (e) => {
    startDrag(e.clientX, e.clientY, e);
  });

  handle.addEventListener('touchstart', (e) => {
    if (e.target.closest('button')) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const touch = e.touches[0];
    startDrag(touch.clientX, touch.clientY, e);
  });

  if (window.PointerEvent) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      handle.setPointerCapture(e.pointerId);
      startDrag(e.clientX, e.clientY, e);
    });
  }
  
  if (rh) {
    function startResize(clientX, clientY, e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
      resizing = true; sx = clientX; sy = clientY;
      const rect = app.getBoundingClientRect(); sw = rect.width; sh = rect.height;
      document.body.style.userSelect = 'none';
      document.body.style.webkitUserSelect = 'none';
      document.body.style.msUserSelect = 'none';
      document.body.style.mozUserSelect = 'none';
      document.documentElement.style.cursor = 'nwse-resize';
    }

    rh.addEventListener('mousedown', (e) => {
      startResize(e.clientX, e.clientY, e);
    });

    rh.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      startResize(touch.clientX, touch.clientY, e);
    });

    if (window.PointerEvent) {
      rh.addEventListener('pointerdown', (e) => {
        rh.setPointerCapture(e.pointerId);
        startResize(e.clientX, e.clientY, e);
      });
    }

    rh.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  }

  function handleMove(clientX, clientY, e) {
    if (dragging) {
      if (e) e.preventDefault();
      const dx = clientX - sx, dy = clientY - sy;
      app.style.transform = `translate(${dx}px, ${dy}px)`;
    } else if (resizing) {
      if (e) e.preventDefault();
      const dx = clientX - sx, dy = clientY - sy;
      const newWidth = Math.max(280, sw + dx);
      const newHeight = Math.max(120, sh + dy);
      app.style.width  = `${newWidth}px`;
      app.style.height = `${newHeight}px`;
    }
  }
  
  window.addEventListener('mousemove', (e) => {
    handleMove(e.clientX, e.clientY, e);
  });

  window.addEventListener('touchmove', (e) => {
    if (dragging || resizing) {
      const touch = e.touches[0];
      handleMove(touch.clientX, touch.clientY, e);
    }
  });

  if (window.PointerEvent) {
    window.addEventListener('pointermove', (e) => {
      handleMove(e.clientX, e.clientY, e);
    });
  }

  function endDrag() {
    if (dragging) {
      const transform = app.style.transform;
      const match = transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/);
      if (match) {
        const dx = parseFloat(match[1]) || 0;
        const dy = parseFloat(match[2]) || 0;
        app.style.transform = '';
        app.style.left = `${ax + dx}px`;
        app.style.top = `${ay + dy}px`;
      }
      savePosition();
    } else if (resizing) {
      savePosition();
    }
    dragging = false; 
    resizing = false; 
    document.body.style.userSelect = ''; 
    document.body.style.webkitUserSelect = '';
    document.body.style.msUserSelect = '';
    document.body.style.mozUserSelect = '';
    document.documentElement.style.cursor = '';
    handle.classList.remove('dragging');
  }

  window.addEventListener('mouseup', endDrag);
  window.addEventListener('touchend', endDrag);
  if (window.PointerEvent) {
    window.addEventListener('pointerup', endDrag);
  }

  handle.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
})();

(() => {
  const btn = document.getElementById('toggle-job-list');
  const list = document.getElementById('job-list');
  if (btn && list) {
    btn.addEventListener('click', () => {
      list.style.display = (list.style.display === 'none' || !list.style.display) ? 'block' : 'none';
    });
  }
})();
