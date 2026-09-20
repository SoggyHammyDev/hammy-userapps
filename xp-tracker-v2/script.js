"use strict";

const JOBS = [
  { key:"trucker", label:"Trucker", exp:"exp_trucking_trucking", bxp:"exp_token_a|trucking|trucking", jobs:["trucker"] },
  { key:"mechanic", label:"Mechanic", exp:"exp_trucking_mechanic", bxp:"exp_token_a|trucking|mechanic", jobs:["mechanic"] },
  { key:"garbage", label:"Garbage", exp:"exp_trucking_garbage", bxp:"exp_token_a|trucking|garbage", jobs:["garbage"] },
  { key:"postop", label:"PostOP", exp:"exp_trucking_postop", bxp:"exp_token_a|trucking|postop", jobs:["postop"] },
  { key:"pilot", label:"Airline Pilot", exp:"exp_piloting_piloting", bxp:"exp_token_a|piloting|piloting", jobs:["pilot"] },
  { key:"helicopterpilot", label:"Helicopter Pilot", exp:"exp_piloting_heli", bxp:"exp_token_a|piloting|heli", jobs:["helicopterpilot"] },
  { key:"cargopilot", label:"Cargo Pilot", exp:"exp_piloting_cargos", bxp:"exp_token_a|piloting|cargos", jobs:["cargopilot"] },
  { key:"busdriver", label:"Bus Driver", exp:"exp_train_bus", bxp:"exp_token_a|train|bus", jobs:["busdriver"] },
  { key:"conductor", label:"Train Conductor", exp:"exp_train_train", bxp:"exp_token_a|train|train", jobs:["conductor"] },
  { key:"emergency", label:"EMS", exp:"exp_ems_ems", bxp:"exp_token_a|ems|ems", jobs:["emergency","ems"] },
  { key:"firefighter", label:"Firefighter", exp:"exp_ems_fire", bxp:"exp_token_a|ems|fire", jobs:["firefighter"] },
  { key:"player", label:"Player", exp:"exp_player_player", bxp:"exp_token_a|player|player", jobs:["player","unemployed"] },
  { key:"racer", label:"Racing", exp:"exp_player_racing", bxp:"exp_token_a|player|racing", jobs:["racer","racing"] },
  { key:"farmer", label:"Farming", exp:"exp_farming_farming", bxp:"exp_token_a|farming|farming", jobs:["farmer"] },
  { key:"fisher", label:"Fishing", exp:"exp_farming_fishing", bxp:"exp_token_a|farming|fishing", jobs:["fisher"] },
  { key:"miner", label:"Mining", exp:"exp_farming_mining", bxp:"exp_token_a|farming|mining", jobs:["miner","quarry"] },
  { key:"strength", label:"Strength", exp:"exp_physical_strength", bxp:"exp_token_a|physical|strength", jobs:[] },
  { key:"business", label:"Business", exp:"exp_business_business", bxp:"exp_token_a|business|business", jobs:[] },
  { key:"hunter", label:"Hunting", exp:"exp_hunting_skill", bxp:"exp_token_a|hunting|skill", jobs:["hunter"] }
];

const KEYS = [...new Set([
  ...JOBS.map(j => j.exp),
  "inventory","job","job_name","job_title","subjob","subjob_name"
])];

const STORE = {
  selected:"xp-v2-selected",
  settings:"xp-v2-settings",
  position:"xp-v2-position",
  size:"xp-v2-size",
  session:"xp-v2-session"
};

const DEFAULT_SETTINGS = {
  level:true,bxp:true,gain:true,rate:true,eta:true,progress:true,highlightActive:true,fontSize:11
};

const state = {
  selected:["player","trucker","mechanic","miner","fisher"],
  settings:{...DEFAULT_SETTINGS},
  xp:{},
  bxp:{},
  baseline:{},
  logs:{},
  lastGainAt:{},
  job:"",
  jobName:"",
  jobTitle:"",
  sessionStartedAt:Date.now(),
  received:false,
  minimized:false
};

const $ = id => document.getElementById(id);
const jobByKey = key => JOBS.find(j => j.key === key);

function safeJson(value,fallback){
  try { return JSON.parse(value); } catch { return fallback; }
}

function load(){
  const savedSelected = safeJson(localStorage.getItem(STORE.selected), null);
  state.selected = Array.isArray(savedSelected)
    ? savedSelected.filter(key => JOBS.some(job => job.key === key))
    : [...state.selected];

  const savedSettings = safeJson(localStorage.getItem(STORE.settings), {});
  state.settings = {...DEFAULT_SETTINGS, ...(savedSettings && typeof savedSettings === "object" ? savedSettings : {})};
  const savedSession = safeJson(localStorage.getItem(STORE.session), null);
  if (savedSession && savedSession.baseline && savedSession.sessionStartedAt) {
    state.baseline = savedSession.baseline;
    state.logs = savedSession.logs || {};
    state.lastGainAt = savedSession.lastGainAt || {};
    state.sessionStartedAt = savedSession.sessionStartedAt;
  }

  const pos = safeJson(localStorage.getItem(STORE.position), null);
  if (pos) {
    $("tracker-app").style.left = Math.max(0, Number(pos.left)||0) + "px";
    $("tracker-app").style.top = Math.max(0, Number(pos.top)||0) + "px";
  }
  const size = safeJson(localStorage.getItem(STORE.size), null);
  if (size) {
    $("tracker-app").style.width = Math.max(430, Number(size.width)||720) + "px";
    $("tracker-app").style.height = Math.max(150, Number(size.height)||310) + "px";
  }
  applySettingsToInputs();
}

function saveSession(){
  localStorage.setItem(STORE.session, JSON.stringify({
    baseline:state.baseline,
    logs:state.logs,
    lastGainAt:state.lastGainAt,
    sessionStartedAt:state.sessionStartedAt
  }));
}

function applySettingsToInputs(){
  $("show-level").checked = state.settings.level;
  $("show-bxp").checked = state.settings.bxp;
  $("show-gain").checked = state.settings.gain;
  $("show-rate").checked = state.settings.rate;
  $("show-eta").checked = state.settings.eta;
  $("show-progress").checked = state.settings.progress;
  $("highlight-active").checked = state.settings.highlightActive;
  $("font-size").value = state.settings.fontSize;
  $("font-size-value").textContent = state.settings.fontSize + "px";
  document.documentElement.style.setProperty("--font-size", state.settings.fontSize + "px");
}

function saveSettings(){
  state.settings = {
    level:$("show-level").checked,
    bxp:$("show-bxp").checked,
    gain:$("show-gain").checked,
    rate:$("show-rate").checked,
    eta:$("show-eta").checked,
    progress:$("show-progress").checked,
    highlightActive:$("highlight-active").checked,
    fontSize:Number($("font-size").value)||11
  };
  localStorage.setItem(STORE.settings, JSON.stringify(state.settings));
  applySettingsToInputs();
  render();
}

function formatNumber(value){
  if (!Number.isFinite(value)) return "—";
  const n = Math.round(value);
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n/1e9).toFixed(2).replace(/\.00$/,"") + "B";
  if (abs >= 1e6) return (n/1e6).toFixed(2).replace(/\.00$/,"") + "M";
  if (abs >= 1e3) return (n/1e3).toFixed(1).replace(/\.0$/,"") + "K";
  return n.toLocaleString();
}

function formatDuration(ms){
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const total = Math.floor(ms/1000);
  const h = Math.floor(total/3600);
  const m = Math.floor((total%3600)/60);
  const s = total%60;
  return [h,m,s].map(v => String(v).padStart(2,"0")).join(":");
}

function levelInfo(totalXp){
  const xp = Math.max(0, Number(totalXp)||0);
  const level = Math.max(0, Math.floor((-1 + Math.sqrt(1 + (8*xp/5))) / 2));
  const levelStart = 5 * level * (level + 1) / 2;
  const nextLevel = level + 1;
  const nextThreshold = 5 * nextLevel * (nextLevel + 1) / 2;
  const inLevel = xp - levelStart;
  const needed = Math.max(0, nextThreshold - xp);
  const span = Math.max(1, nextThreshold - levelStart);
  const pct = Math.max(0, Math.min(100, (inLevel/span)*100));
  return {level,inLevel,needed,pct,nextThreshold};
}

function rollingRate(jobKey){
  const now = Date.now();
  const log = (state.logs[jobKey] || []).filter(x => now - x.time <= 10*60*1000);
  if (log.length < 2) return 0;
  const first = log[0], last = log[log.length-1];
  const dt = last.time - first.time;
  const dx = last.exp - first.exp;
  if (dt <= 0 || dx <= 0) return 0;
  return dx / dt * 3600000;
}

function sessionGain(jobKey){
  const current = state.xp[jobKey];
  const start = state.baseline[jobKey];
  if (!Number.isFinite(current) || !Number.isFinite(start)) return 0;
  return Math.max(0,current-start);
}

function activeSkillKey(){
  const now = Date.now();
  let freshest = null;
  let bestTime = 0;
  for (const [key,time] of Object.entries(state.lastGainAt)) {
    if (time > bestTime && now-time <= 120000) { bestTime=time; freshest=key; }
  }
  if (freshest) return freshest;
  const current = String(state.job||"").toLowerCase();
  const byJob = JOBS.find(j => j.jobs.includes(current));
  return byJob?.key || null;
}

function getBxp(inventory, token){
  if (!inventory || typeof inventory !== "object" || !token) return null;
  const direct = inventory[token];
  if (typeof direct === "number") return direct;
  if (direct && typeof direct.amount === "number") return direct.amount;
  const fallbackKey = Object.keys(inventory).find(k => k === token || k.startsWith(token+"|"));
  const fallback = fallbackKey ? inventory[fallbackKey] : null;
  if (typeof fallback === "number") return fallback;
  if (fallback && typeof fallback.amount === "number") return fallback.amount;
  return null;
}

function processGameData(data){
  if (!data || typeof data !== "object") return;
  const now = Date.now();
  state.received = true;
  if (typeof data.job === "string") state.job = data.job;
  if (typeof data.job_name === "string") state.jobName = data.job_name;
  if (typeof data.job_title === "string") state.jobTitle = data.job_title;

  let inventory = data.inventory;
  if (typeof inventory === "string") inventory = safeJson(inventory,{});

  for (const job of JOBS) {
    const value = data[job.exp];
    if (Number.isFinite(value)) {
      const previous = state.xp[job.key];
      state.xp[job.key] = value;

      if (!Number.isFinite(state.baseline[job.key])) {
        state.baseline[job.key] = value;
        state.logs[job.key] = [{time:now,exp:value}];
      } else if (Number.isFinite(previous) && value > previous) {
        const log = state.logs[job.key] || (state.logs[job.key] = []);
        if (!log.length) log.push({time:now-1,exp:previous});
        log.push({time:now,exp:value});
        state.lastGainAt[job.key] = now;
        const cutoff = now - 30*60*1000;
        state.logs[job.key] = log.filter((entry,i) => i===0 || entry.time >= cutoff);
      } else if (!state.logs[job.key]?.length) {
        state.logs[job.key] = [{time:now,exp:value}];
      }
    }

    const bxp = getBxp(inventory,job.bxp);
    if (Number.isFinite(bxp)) state.bxp[job.key] = bxp;
  }

  saveSession();
  render();
}

function requestData(){
  window.parent.postMessage({type:"getNamedData",keys:KEYS},"*");
  setTimeout(() => {
    if (!state.received) window.parent.postMessage({type:"getData"},"*");
  },900);
}

function renderPicker(){
  const sorted = [...JOBS].sort((a,b)=>a.label.localeCompare(b.label));
  $("job-list").innerHTML = sorted.map(job => {
    const selected = state.selected.includes(job.key);
    return '<label class="job-chip '+(selected?"selected":"")+'"><input type="checkbox" data-key="'+job.key+'" '+(selected?"checked":"")+'> '+job.label+'</label>';
  }).join("");
  $("job-list").querySelectorAll("input").forEach(input => input.addEventListener("change",() => {
    const key = input.dataset.key;
    if (input.checked && !state.selected.includes(key)) state.selected.push(key);
    if (!input.checked) state.selected = state.selected.filter(x=>x!==key);
    localStorage.setItem(STORE.selected,JSON.stringify(state.selected));
    renderPicker(); render();
  }));
}

function render(){
  const active = activeSkillKey();
  $("connection-status").textContent = state.received
    ? "Live · "+(state.jobName || state.jobTitle || state.job || "job unknown")
    : "Waiting for Transport Tycoon…";
  $("connection-status").classList.toggle("live",state.received);

  const totalGain = JOBS.reduce((sum,j)=>sum+sessionGain(j.key),0);
  $("session-total-gain").textContent = "+"+formatNumber(totalGain)+" XP";
  $("active-skill").textContent = jobByKey(active)?.label || state.jobName || "—";

  const cols = [
    {key:"skill",label:"Skill"},
    {key:"xp",label:"Current XP"}
  ];
  if (state.settings.level) cols.push({key:"level",label:"Level"});
  if (state.settings.bxp) cols.push({key:"bxp",label:"BXP"});
  if (state.settings.gain) cols.push({key:"gain",label:"Session"});
  if (state.settings.rate) cols.push({key:"rate",label:"XP/hr"});
  if (state.settings.eta) cols.push({key:"eta",label:"Next lvl ETA"});
  if (state.settings.progress) cols.push({key:"progress",label:"Progress"});

  $("summary-head").innerHTML = "<tr>"+cols.map(c=>"<th>"+c.label+"</th>").join("")+"</tr>";

  const jobs = state.selected.map(jobByKey).filter(Boolean);
  if (!jobs.length) {
    $("summary-body").innerHTML = '<tr><td colspan="'+cols.length+'" class="empty">Choose at least one skill from ☰</td></tr>';
    return;
  }

  const any = jobs.some(j=>Number.isFinite(state.xp[j.key]));
  if (!any) {
    $("summary-body").innerHTML = '<tr><td colspan="'+cols.length+'" class="empty">Waiting for direct XP counters…</td></tr>';
    return;
  }

  $("summary-body").innerHTML = jobs.map(job => {
    const xp = state.xp[job.key];
    const lvl = levelInfo(xp);
    const gain = sessionGain(job.key);
    const rate = rollingRate(job.key);
    const eta = rate > 0 && lvl.needed > 0 ? lvl.needed/rate*3600000 : null;
    const isActive = state.settings.highlightActive && active===job.key;

    const cells = cols.map(col => {
      if (col.key==="skill") return '<td><span class="skill-name">'+job.label+'</span><span class="skill-key">'+job.exp.replace("exp_","")+'</span></td>';
      if (col.key==="xp") return '<td>'+formatNumber(xp)+'</td>';
      if (col.key==="level") return '<td>'+lvl.level+'</td>';
      if (col.key==="bxp") return '<td class="bxp">'+formatNumber(state.bxp[job.key])+'</td>';
      if (col.key==="gain") return '<td class="'+(gain>0?"gain":"muted")+'">'+(gain>0?"+":"")+formatNumber(gain)+'</td>';
      if (col.key==="rate") return '<td class="'+(rate>0?"rate":"muted")+'">'+formatNumber(rate)+'</td>';
      if (col.key==="eta") return '<td class="muted">'+(eta===null?"—":formatDuration(eta))+'</td>';
      if (col.key==="progress") return '<td class="progress-cell"><div class="progress-wrap"><div class="bar"><span style="width:'+lvl.pct.toFixed(1)+'%"></span></div><span class="pct">'+lvl.pct.toFixed(1)+'%</span></div></td>';
      return "<td>—</td>";
    }).join("");

    return '<tr class="'+(isActive?"active-row":"")+'">'+cells+"</tr>";
  }).join("");
}

function resetSession(){
  state.baseline = {};
  state.logs = {};
  state.lastGainAt = {};
  state.sessionStartedAt = Date.now();
  for (const job of JOBS) {
    if (Number.isFinite(state.xp[job.key])) {
      state.baseline[job.key] = state.xp[job.key];
      state.logs[job.key] = [{time:Date.now(),exp:state.xp[job.key]}];
    }
  }
  saveSession(); render();
}

function setupUi(){
  $("jobs-btn").addEventListener("click",e=>{e.stopPropagation();$("job-picker").classList.toggle("hidden");$("settings-panel").classList.add("hidden")});
  $("settings-btn").addEventListener("click",e=>{e.stopPropagation();$("settings-panel").classList.toggle("hidden");$("job-picker").classList.add("hidden")});
  $("refresh-btn").addEventListener("click",requestData);
  $("minimize-btn").addEventListener("click",()=>{
    state.minimized=!state.minimized;
    $("body").classList.toggle("minimized",state.minimized);
    $("minimize-btn").textContent=state.minimized?"+":"−";
    if (state.minimized) $("tracker-app").style.height="48px";
    else {
      const saved=safeJson(localStorage.getItem(STORE.size),null);
      $("tracker-app").style.height=(saved?.height||310)+"px";
    }
  });
  $("select-all").addEventListener("click",()=>{state.selected=JOBS.map(j=>j.key);localStorage.setItem(STORE.selected,JSON.stringify(state.selected));renderPicker();render()});
  $("select-none").addEventListener("click",()=>{state.selected=[];localStorage.setItem(STORE.selected,"[]");renderPicker();render()});
  ["show-level","show-bxp","show-gain","show-rate","show-eta","show-progress","highlight-active"].forEach(id=>$(id).addEventListener("change",saveSettings));
  $("font-size").addEventListener("input",saveSettings);
  $("reset-session").addEventListener("click",resetSession);
  document.addEventListener("click",e=>{
    if (!e.target.closest("#settings-panel")&&!e.target.closest("#settings-btn")) $("settings-panel").classList.add("hidden");
  });
  window.addEventListener("keydown",e=>{if(e.key==="Escape")window.parent.postMessage({type:"pin"},"*")});
}

function setupDragResize(){
  const app=$("tracker-app"), handle=$("drag-handle"), resize=$("resize-handle");
  let drag=null, size=null;

  handle.addEventListener("pointerdown",e=>{
    if(e.target.closest("button"))return;
    const r=app.getBoundingClientRect();
    drag={id:e.pointerId,dx:e.clientX-r.left,dy:e.clientY-r.top};
    handle.setPointerCapture(e.pointerId);
    handle.classList.add("dragging");
    e.preventDefault();
  });
  handle.addEventListener("pointermove",e=>{
    if(!drag||drag.id!==e.pointerId)return;
    const w=app.offsetWidth,h=app.offsetHeight;
    const left=Math.max(0,Math.min(window.innerWidth-w,e.clientX-drag.dx));
    const top=Math.max(0,Math.min(window.innerHeight-h,e.clientY-drag.dy));
    app.style.left=left+"px";app.style.top=top+"px";
  });
  handle.addEventListener("pointerup",e=>{
    if(!drag)return;
    localStorage.setItem(STORE.position,JSON.stringify({left:parseFloat(app.style.left)||0,top:parseFloat(app.style.top)||0}));
    drag=null;handle.classList.remove("dragging");
  });

  resize.addEventListener("pointerdown",e=>{
    const r=app.getBoundingClientRect();
    size={id:e.pointerId,x:e.clientX,y:e.clientY,w:r.width,h:r.height};
    resize.setPointerCapture(e.pointerId);e.preventDefault();e.stopPropagation();
  });
  resize.addEventListener("pointermove",e=>{
    if(!size||size.id!==e.pointerId)return;
    app.style.width=Math.max(430,size.w+(e.clientX-size.x))+"px";
    if(!state.minimized) app.style.height=Math.max(150,size.h+(e.clientY-size.y))+"px";
  });
  resize.addEventListener("pointerup",()=>{
    if(!size)return;
    if(!state.minimized)localStorage.setItem(STORE.size,JSON.stringify({width:app.offsetWidth,height:app.offsetHeight}));
    size=null;
  });
}

function init(){
  load();
  renderPicker();
  setupUi();
  setupDragResize();

  const nui = window.parent !== window || navigator.userAgent.includes("CitizenFX");
  if(nui)document.body.classList.add("no-blur");

  window.addEventListener("message",event=>{
    const msg=event.data;
    if(msg?.type==="data"&&msg.data)processGameData(msg.data);
    else if(msg?.type==="chat:open")document.body.classList.add("no-blur");
    else if(msg?.type==="chat:close")document.body.classList.remove("no-blur");
  });

  setInterval(()=>{
    $("session-time").textContent=formatDuration(Date.now()-state.sessionStartedAt);
    render();
  },1000);

  render();
  requestData();
}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);
else init();
