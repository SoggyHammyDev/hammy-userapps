(() => {
  "use strict";

  const HUNT_XP_KEY = "exp_hunting_skill";
  const HUNT_BXP_KEYS = ["exp_token_a|hunting|skill","exp_token|hunting|skill"];
  const HUNT_WORDS = /hunt|hunter|pelt|hide|carcass|venison|deer|boar|coyote|rabbit|cougar|meat/i;

  const state = {
    cache:{}, inventory:{}, weight:null, maxWeight:null,
    xp:null, startXp:null, startAt:null, hunting:false
  };

  const $ = id => document.getElementById(id);
  const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;
  const fmt = v => Math.round(num(v)).toLocaleString();

  function parseInventory(v){
    if (!v) return {};
    if (typeof v === "object") return v;
    try { return JSON.parse(v); } catch { return {}; }
  }

  function amountFor(key){
    return num(state.inventory?.[key]?.amount);
  }

  function isHuntingJob(){
    const job = String(state.cache.job || "").toLowerCase();
    const name = String(state.cache.job_name || "").toLowerCase();
    const sub = String(state.cache.subjob || "").toLowerCase();
    const subName = String(state.cache.subjob_name || "").toLowerCase();
    return [job,name,sub,subName].some(v => v.includes("hunt"));
  }

  function update(){
    state.hunting = isHuntingJob();
    const xp = num(state.cache[HUNT_XP_KEY]);
    if (state.xp === null && xp) state.xp = xp;
    if (state.startXp === null && xp) {
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
      ? (state.cache.job_name || state.cache.subjob_name || "Hunting session")
      : "Waiting for Hunter job";

    if (state.weight != null && state.maxWeight != null) {
      const pct = state.maxWeight > 0 ? Math.min(100,(state.weight/state.maxWeight)*100) : 0;
      $("weightNow").textContent = state.weight.toFixed(1);
      $("weightMax").textContent = state.maxWeight.toFixed(1);
      $("weightPercent").textContent = pct.toFixed(0) + "%";
      $("weightFill").style.width = pct + "%";
    }

    renderLoot();
  }

  function renderLoot(){
    const rows = Object.entries(state.inventory)
      .filter(([key]) => HUNT_WORDS.test(key) && !HUNT_BXP_KEYS.includes(key))
      .map(([key,val]) => [key,num(val?.amount)])
      .filter(([,amount]) => amount > 0)
      .sort((a,b) => b[1]-a[1]);

    $("lootCount").textContent = rows.length + " tracked";
    $("lootList").innerHTML = rows.length
      ? rows.map(([key,amount]) => `<div class="loot-row"><span title="${key}">${key}</span><strong>${fmt(amount)}</strong></div>`).join("")
      : '<div class="empty">No hunting-related inventory found yet.</div>';
  }

  function tick(){
    if (state.startAt) {
      const s = Math.floor((Date.now()-state.startAt)/1000);
      const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec=s%60;
      $("runtime").textContent = [h,m,sec].map(x=>String(x).padStart(2,"0")).join(":");
    }
  }

  function setupDrag(){
    const hud=$("hud"), handle=$("dragHandle");
    const key="huntingMadeEasy.position";
    try{
      const p=JSON.parse(localStorage.getItem(key)||"null");
      if(p){
        hud.style.left=Math.max(0,Math.min(p.x,window.innerWidth-hud.offsetWidth))+"px";
        hud.style.top=Math.max(0,Math.min(p.y,window.innerHeight-hud.offsetHeight))+"px";
      }
    }catch{}

    let drag=false,dx=0,dy=0;
    handle.addEventListener("mousedown",e=>{
      if(e.target.closest("button")) return;
      const r=hud.getBoundingClientRect();
      drag=true; dx=e.clientX-r.left; dy=e.clientY-r.top; e.preventDefault();
    });
    document.addEventListener("mousemove",e=>{
      if(!drag)return;
      hud.style.left=Math.max(0,Math.min(e.clientX-dx,window.innerWidth-hud.offsetWidth))+"px";
      hud.style.top=Math.max(0,Math.min(e.clientY-dy,window.innerHeight-hud.offsetHeight))+"px";
    });
    document.addEventListener("mouseup",()=>{
      if(!drag)return; drag=false;
      localStorage.setItem(key,JSON.stringify({x:hud.offsetLeft,y:hud.offsetTop}));
    });
  }

  window.addEventListener("message",event=>{
    const data=event.data?.type==="data" ? event.data.data : event.data?.data;
    if(!data || typeof data!=="object") return;

    Object.assign(state.cache,data);
    if ("inventory" in data) state.inventory=parseInventory(data.inventory);
    if (typeof data.weight==="number") state.weight=data.weight;
    if (typeof data.max_weight==="number") state.maxWeight=data.max_weight;

    update();
  });

  window.addEventListener("keydown",e=>{
    if(e.key==="Escape") window.parent.postMessage({type:"pin"},"*");
  });

  $("minimizeBtn").addEventListener("click",()=>$("hud").classList.toggle("minimized"));
  setupDrag();
  setInterval(tick,1000);
  window.parent.postMessage({type:"getData"},"*");
  setTimeout(()=>window.parent.postMessage({type:"getNamedData",keys:[
    "job","job_name","subjob","subjob_name","inventory","weight","max_weight",HUNT_XP_KEY
  ]},"*"),700);
})();