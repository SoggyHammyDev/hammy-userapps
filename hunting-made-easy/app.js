(() => {
  "use strict";

  const HUNT_XP_KEY = "exp_hunting_skill";
  const HUNT_BXP_KEYS = ["exp_token_a|hunting|skill","exp_token|hunting|skill"];
  const SETTINGS_KEY = "huntingMadeEasy.settings.v2";
  const POSITION_KEY = "huntingMadeEasy.position";
  const AUTO_COOLDOWN_MS = 10000;

  // Exact hunting loot IDs from iteminfo_2025-07-15.json.
  // hide_cow is intentionally excluded: it is a farming cow, not hunting loot.
  const HUNTING_ITEMS = {
    hide_bear:       { name:"Hunting: Brown Bear",      weight:20 },
    hide_boar:       { name:"Hunting: Boar",            weight:10 },
    hide_cat:        { name:"Hunting: Cat",             weight:5 },
    hide_chicken:    { name:"Hunting: Chicken",         weight:1 },
    hide_chop:       { name:"Hunting: Rottweiler Dog",  weight:5 },
    hide_cormodant:  { name:"Hunting: Cormodant",       weight:8 },
    hide_coyote:     { name:"Hunting: Coyote",          weight:3 },
    hide_crow:       { name:"Hunting: Crow",            weight:3 },
    hide_deer:       { name:"Hunting: Deer",            weight:6 },
    hide_hawk:       { name:"Hunting: Chicken Hawk",    weight:5 },
    hide_humpback:   { name:"Hunting: Humpback Whale",  weight:50 },
    hide_leopard:    { name:"Hunting: Leopard",         weight:10 },
    hide_lion:       { name:"Hunting: Lion",            weight:10 },
    hide_mtlion:     { name:"Hunting: Cougar",          weight:5 },
    hide_pig:        { name:"Hunting: Pig",             weight:10 },
    hide_poodle:     { name:"Hunting: Poodle Dog",      weight:5 },
    hide_rabbit:     { name:"Hunting: Rabbit",          weight:1 },
    hide_rat:        { name:"Hunting: Rat",             weight:0.5 },
    hide_retriever:  { name:"Hunting: Retriever Dog",   weight:5 },
    hide_rottweiler: { name:"Hunting: Rottweiler Dog",  weight:5 },
    hide_seagull:    { name:"Hunting: Seagull",         weight:3 },
    hide_wolf:       { name:"Hunting: Wolf",            weight:10 },
    meat:            { name:"Meat",                     weight:0.5 }
  };

  const state = {
    cache:{},
    inventory:{},
    weight:null,
    maxWeight:null,
    trunkWeight:null,
    trunkCapacity:null,
    startXp:null,
    startAt:null,
    hunting:false,
    transferring:false,
    lastTransferAt:0,
    settings:{ autoTrunk:false, threshold:85 }
  };

  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;
  const fmt = v => Math.round(num(v)).toLocaleString();

  function parseInventory(v){
    if (!v) return {};
    if (typeof v === "object") return v;
    try { return JSON.parse(v); } catch { return {}; }
  }

  function parseChoices(v){
    if (Array.isArray(v)) return v;
    if (typeof v === "string") {
      try { return JSON.parse(v); } catch { return []; }
    }
    return [];
  }

  function cleanChoice(s){
    return String(s || "")
      .replace(/<[^>]*>/g,"")
      .replace(/&#d+;/g,"")
      .replace(/\s+/g," ")
      .trim();
  }

  function menuChoices(){
    return Array.isArray(state.cache.menu_choices) ? state.cache.menu_choices : [];
  }

  function amountFor(key){
    return num(state.inventory?.[key]?.amount);
  }

  function huntingRows(){
    return Object.entries(HUNTING_ITEMS)
      .map(([id,meta]) => ({
        id,
        ...meta,
        amount:amountFor(id),
        kg:amountFor(id) * meta.weight
      }))
      .filter(row => row.amount > 0)
      .sort((a,b) => b.kg - a.kg || b.amount - a.amount);
  }

  function huntingLootWeight(){
    return huntingRows().reduce((sum,row) => sum + row.kg, 0);
  }

  function isHuntingJob(){
    const values = [
      state.cache.job,
      state.cache.job_name,
      state.cache.job_title,
      state.cache.subjob,
      state.cache.subjob_name
    ].map(v => String(v || "").toLowerCase());
    return values.some(v => v.includes("hunt"));
  }

  function saveSettings(){
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch {}
  }

  function loadSettings(){
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      if (saved && typeof saved === "object") {
        state.settings.autoTrunk = saved.autoTrunk === true;
        if (Number.isFinite(Number(saved.threshold))) state.settings.threshold = Number(saved.threshold);
      }
    } catch {}
    $("autoTrunk").checked = state.settings.autoTrunk;
    $("threshold").value = String(state.settings.threshold);
  }

  function setAutoStatus(text, kind=""){
    const el = $("autoStatus");
    el.textContent = text;
    el.className = kind;
  }

  function update(){
    state.hunting = isHuntingJob();

    const xp = num(state.cache[HUNT_XP_KEY]);
    if (state.startXp === null && Number.isFinite(xp)) {
      state.startXp = xp;
      state.startAt = Date.now();
    }

    const gain = state.startXp === null ? 0 : Math.max(0, xp - state.startXp);
    const elapsedH = state.startAt ? Math.max((Date.now()-state.startAt)/3600000, 1/3600) : 0;
    const perHour = elapsedH ? gain / elapsedH : 0;
    const bxp = HUNT_BXP_KEYS.reduce((sum,k)=>sum+amountFor(k),0);

    $("xpTotal").textContent = fmt(xp);
    $("xpGain").textContent = "+" + fmt(gain);
    $("xpHour").textContent = fmt(perHour);
    $("bxpTotal").textContent = fmt(bxp);

    $("status").textContent = state.hunting ? "Hunting" : "Not on hunting job";
    $("status").className = state.hunting ? "active" : "inactive";
    $("jobText").textContent = state.hunting
      ? (state.cache.job_title || state.cache.job_name || state.cache.subjob_name || "Hunting session")
      : "Waiting for Hunter job";

    if (state.weight != null && state.maxWeight != null) {
      const pct = state.maxWeight > 0 ? Math.min(100,(state.weight/state.maxWeight)*100) : 0;
      $("weightNow").textContent = state.weight.toFixed(1);
      $("weightMax").textContent = state.maxWeight.toFixed(1);
      $("weightPercent").textContent = pct.toFixed(0) + "%";
      $("weightFill").style.width = pct + "%";
    }

    if (state.trunkWeight != null && state.trunkCapacity != null) {
      const pct = state.trunkCapacity > 0 ? Math.min(100,(state.trunkWeight/state.trunkCapacity)*100) : 0;
      $("trunkNow").textContent = state.trunkWeight.toFixed(1);
      $("trunkMax").textContent = state.trunkCapacity.toFixed(1);
      $("trunkPercent").textContent = pct.toFixed(0) + "%";
      $("trunkFill").style.width = pct + "%";
    }

    const lootKg = huntingLootWeight();
    $("lootWeight").textContent = lootKg.toFixed(1) + " kg loot";
    renderLoot();

    if (!state.transferring) {
      if (!state.settings.autoTrunk) {
        setAutoStatus("Auto Trunk disabled");
      } else if (!state.hunting) {
        setAutoStatus("Waiting for Hunter job","warn");
      } else if (lootKg <= 0) {
        setAutoStatus("No hunting loot to move","ok");
      } else {
        const pct = state.maxWeight > 0 && state.weight != null ? (state.weight/state.maxWeight)*100 : 0;
        setAutoStatus(`Armed · dumps at ${state.settings.threshold}%`,"ok");
        if (pct >= state.settings.threshold) {
          setTimeout(() => maybeAutoTrunk(), 150);
        }
      }
    }
  }

  function renderLoot(){
    const rows = huntingRows();
    $("lootCount").textContent = rows.reduce((sum,row)=>sum+row.amount,0).toLocaleString() + " items";
    $("lootList").innerHTML = rows.length
      ? rows.map(row =>
          `<div class="loot-row">
             <span class="loot-name" title="${row.id}">${row.name}</span>
             <small>${row.kg.toFixed(1)} kg</small>
             <strong>${row.amount.toLocaleString()}</strong>
           </div>`
        ).join("")
      : '<div class="empty">No hunting loot found.</div>';
  }

  function tick(){
    if (state.startAt) {
      const s = Math.floor((Date.now()-state.startAt)/1000);
      const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec=s%60;
      $("runtime").textContent = [h,m,sec].map(x=>String(x).padStart(2,"0")).join(":");
    }
  }

  async function waitFor(predicate, timeout=4500, interval=80){
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try { if (predicate()) return true; } catch {}
      await sleep(interval);
    }
    throw new Error("Timed out waiting for Transport Tycoon menu");
  }

  function findPutChoice(){
    return menuChoices().find(choice => {
      const text = cleanChoice(choice?.[0]);
      return text === "Put" || (text.includes("Put") && text !== "Put All");
    })?.[0];
  }

  function findItemChoice(displayName){
    const target = cleanChoice(displayName).toLowerCase();
    return menuChoices().find(choice => {
      const text = cleanChoice(choice?.[0]).toLowerCase();
      return text === target || text.includes(target);
    })?.[0];
  }

  async function ensureTrunkRoot(){
    if (findPutChoice()) return true;
    window.parent.postMessage({type:"forceMenuBack"},"*");
    await waitFor(() => Boolean(findPutChoice()), 2500);
    return true;
  }

  async function transferHuntingLoot(reason="manual"){
    if (state.transferring) return false;

    const rows = huntingRows();
    if (!rows.length) {
      setAutoStatus("No hunting loot to move","warn");
      return false;
    }

    const lootKg = rows.reduce((sum,row)=>sum+row.kg,0);
    if (state.trunkWeight != null && state.trunkCapacity != null) {
      const free = Math.max(0,state.trunkCapacity-state.trunkWeight);
      if (lootKg > free + 0.001) {
        setAutoStatus(`Need ${lootKg.toFixed(1)} kg · trunk has ${free.toFixed(1)} kg free`,"error");
        return false;
      }
    }

    state.transferring = true;
    state.lastTransferAt = Date.now();
    $("dumpNow").disabled = true;
    setAutoStatus(reason === "auto" ? "Auto Trunk opening vehicle…" : "Opening vehicle trunk…","busy");

    let movedTypes = 0;

    try {
      window.parent.postMessage({type:"sendCommand",command:"rm_trunk"},"*");
      window.parent.postMessage({type:"getData"},"*");

      await waitFor(() => state.cache.menu_open === true && Boolean(findPutChoice()), 5000);

      for (const row of rows) {
        const before = amountFor(row.id);
        if (before <= 0) continue;

        await ensureTrunkRoot();

        const putChoice = findPutChoice();
        if (!putChoice) throw new Error('Trunk "Put" option not found');

        window.parent.postMessage({type:"forceMenuChoice",choice:putChoice,mod:0},"*");

        await waitFor(() => Boolean(findItemChoice(row.name)), 3500);

        const itemChoice = findItemChoice(row.name);
        if (!itemChoice) throw new Error(`Could not find ${row.name} in trunk Put menu`);

        setAutoStatus(`Moving ${row.name} ×${before}…`,"busy");
        window.parent.postMessage({type:"forceMenuChoice",choice:itemChoice,mod:-1},"*");

        await sleep(500);
        window.parent.postMessage({type:"getData"},"*");

        await waitFor(() => amountFor(row.id) < before || Boolean(findPutChoice()), 3000);

        await sleep(250);
        window.parent.postMessage({type:"getData"},"*");
        movedTypes++;

        if (!findPutChoice()) {
          try { await ensureTrunkRoot(); } catch {}
        }
      }

      if (state.cache.menu_open) {
        window.parent.postMessage({type:"forceMenuBack"},"*");
      }

      await sleep(500);
      window.parent.postMessage({type:"getData"},"*");
      setAutoStatus(`Moved hunting loot · ${movedTypes} stack${movedTypes===1?"":"s"}`,"ok");
      return true;
    } catch (err) {
      setAutoStatus(`Auto Trunk stopped: ${err.message}`,"error");
      return false;
    } finally {
      state.transferring = false;
      $("dumpNow").disabled = false;
      setTimeout(() => {
        window.parent.postMessage({type:"getData"},"*");
        update();
      }, 700);
    }
  }

  async function maybeAutoTrunk(){
    if (!state.settings.autoTrunk || !state.hunting || state.transferring) return;
    if (Date.now() - state.lastTransferAt < AUTO_COOLDOWN_MS) return;
    if (huntingLootWeight() <= 0) return;
    if (state.weight == null || state.maxWeight == null || state.maxWeight <= 0) return;

    const pct = (state.weight/state.maxWeight)*100;
    if (pct < state.settings.threshold) return;

    await transferHuntingLoot("auto");
  }

  function setupDrag(){
    const hud=$("hud"), handle=$("dragHandle");
    try{
      const p=JSON.parse(localStorage.getItem(POSITION_KEY)||"null");
      if(p){
        hud.style.left=Math.max(0,Math.min(p.x,window.innerWidth-hud.offsetWidth))+"px";
        hud.style.top=Math.max(0,Math.min(p.y,window.innerHeight-hud.offsetHeight))+"px";
      }
    }catch{}

    let drag=false,dx=0,dy=0;
    handle.addEventListener("mousedown",e=>{
      if(e.target.closest("button,input,select,label")) return;
      const r=hud.getBoundingClientRect();
      drag=true; dx=e.clientX-r.left; dy=e.clientY-r.top; e.preventDefault();
    });
    document.addEventListener("mousemove",e=>{
      if(!drag)return;
      hud.style.left=Math.max(0,Math.min(e.clientX-dx,window.innerWidth-hud.offsetWidth))+"px";
      hud.style.top=Math.max(0,Math.min(e.clientY-dy,window.innerHeight-hud.offsetHeight))+"px";
    });
    document.addEventListener("mouseup",()=>{
      if(!drag)return;
      drag=false;
      try { localStorage.setItem(POSITION_KEY,JSON.stringify({x:hud.offsetLeft,y:hud.offsetTop})); } catch {}
    });
  }

  window.addEventListener("message",event=>{
    const data=event.data?.type==="data" ? event.data.data : event.data?.data;
    if(!data || typeof data!=="object") return;

    for (const [key,value] of Object.entries(data)) {
      if (key === "menu_choices") state.cache[key] = parseChoices(value);
      else if (key === "menu_open") state.cache[key] = Boolean(value);
      else state.cache[key] = value;
    }

    if ("inventory" in data) state.inventory=parseInventory(data.inventory);
    if (typeof data.weight==="number") state.weight=data.weight;
    if (typeof data.max_weight==="number") state.maxWeight=data.max_weight;
    if (typeof data.trunkWeight==="number") state.trunkWeight=data.trunkWeight;
    if (typeof data.trunkCapacity==="number") state.trunkCapacity=data.trunkCapacity;

    update();
  });

  window.addEventListener("keydown",e=>{
    if(e.key==="Escape") window.parent.postMessage({type:"pin"},"*");
  });

  $("minimizeBtn").addEventListener("click",()=>$("hud").classList.toggle("minimized"));

  $("autoTrunk").addEventListener("change",e=>{
    state.settings.autoTrunk=e.target.checked;
    saveSettings();
    update();
  });

  $("threshold").addEventListener("change",e=>{
    state.settings.threshold=Number(e.target.value)||85;
    saveSettings();
    update();
  });

  $("dumpNow").addEventListener("click",()=>transferHuntingLoot("manual"));

  loadSettings();
  setupDrag();
  setInterval(tick,1000);

  window.parent.postMessage({type:"getData"},"*");
  setTimeout(()=>window.parent.postMessage({
    type:"getNamedData",
    keys:[
      "job","job_name","job_title","subjob","subjob_name",
      "inventory","weight","max_weight","trunkWeight","trunkCapacity",
      "menu","menu_open","menu_choices",HUNT_XP_KEY
    ]
  },"*"),700);
})();