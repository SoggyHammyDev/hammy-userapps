const POS_KEY = "train-assistant-position";
const SESSION_KEY = "train-assistant-session";

const app = document.getElementById("app");
const body = document.getElementById("body");

let latest = {};
let route = null;
let previousStatus = null;
let previousInventory = null;
let previousWallet = null;
let recentWalletGains = [];
let pendingRouteCompletion = false;
let previousNotification = null;
let minimized = false;

const session = {
  startedAt: Date.now(),
  routes: 0,
  stops: 0,
  cash: 0,
  conductor: 0,
  player: 0,
  trainXp: 0,
  altConductor: 0,
  lastReward: "—"
};

function n(v){ const x=Number(v); return Number.isFinite(x)?x:0; }
function money(v){ return "$" + Math.round(v).toLocaleString(); }
function duration(ms, long=false){
  const s=Math.max(0,Math.floor(ms/1000)), h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=s%60;
  return long ? [h,m,sec].map(v=>String(v).padStart(2,"0")).join(":") :
    (h>0 ? [h,m,sec] : [m,sec]).map(v=>String(v).padStart(2,"0")).join(":");
}
function rate(value, since){
  const hours=(Date.now()-since)/3600000;
  return hours>0.00025 ? value/hours : 0;
}
function clean(text=""){
  return String(text)
    .replace(/~[a-zA-Z]~/g,"")
    .replace(/<[^>]*>/g,"")
    .trim();
}
function parseStatus(status){
  if(!status || !Array.isArray(status.lines)) return null;
  const line1=clean(status.lines[0]||"");
  const line2=clean(status.lines[1]||"");
  if(!line1 || !/Train Route/i.test(clean(status.title||""))) return null;
  const m=line1.match(/^(.*?)\s*\[(\d+)\/(\d+)\]\s*$/);
  if(!m) return null;
  const train=line2.match(/^Passenger:\s*(.*?)\s*\[Tier\s*(\d+)\]/i);
  return {
    name:m[1].trim(),
    stop:Number(m[2]),
    total:Number(m[3]),
    trainName:train?train[1].trim():"",
    tier:train?Number(train[2]):null
  };
}
function invAmount(inv,key){ return n(inv?.[key]?.amount); }

function startRoute(parsed){
  route={
    name:parsed.name,
    stop:parsed.stop,
    total:parsed.total,
    trainName:parsed.trainName,
    tier:parsed.tier,
    startedAt:Date.now(),
    cash:0,
    conductor:0,
    player:0,
    trainXp:0,
    altConductor:0
  };
}
function completeRoute(){
  if(!route) return;
  session.routes++;
  session.lastReward = "Route complete: " + route.name;
  saveSession();
}
function resetSession(){
  session.startedAt=Date.now();
  session.routes=0; session.stops=0; session.cash=0; session.conductor=0;
  session.player=0; session.trainXp=0; session.altConductor=0; session.lastReward="—";
  if(route){
    route.startedAt=Date.now(); route.cash=0; route.conductor=0; route.player=0; route.trainXp=0; route.altConductor=0;
  }
  saveSession(); render();
}
function saveSession(){
  localStorage.setItem(SESSION_KEY,JSON.stringify(session));
}
function loadSession(){
  try{
    const s=JSON.parse(localStorage.getItem(SESSION_KEY)||"null");
    if(!s || typeof s!=="object") return;
    for(const k of ["startedAt","routes","stops","cash","conductor","player","trainXp","altConductor","lastReward"]){
      if(k in s) session[k]=s[k];
    }
  }catch{}
}

function consumeRecentWalletGain(){
  const now=Date.now();
  recentWalletGains=recentWalletGains.filter(x=>now-x.time<1800 && !x.used);
  const item=[...recentWalletGains].reverse().find(x=>!x.used);
  if(!item) return 0;
  item.used=true;
  return item.amount;
}
function handleNotification(raw){
  const text=clean(raw);
  if(!text) return;
  if(/^SA Transit:/i.test(text)){
    const actual=consumeRecentWalletGain();
    const shown=text.match(/\$([\d,.]+)([kKmM])?/);
    let display=0;
    if(shown){
      display=Number(shown[1].replace(/,/g,""));
      if(/k/i.test(shown[2]||"")) display*=1000;
      if(/m/i.test(shown[2]||"")) display*=1000000;
    }
    const cash=actual||display;
    if(cash>0){
      session.cash+=cash;
      if(route) route.cash+=cash;
      session.lastReward=(/Route Complete/i.test(text)?"Route bonus ":"Stop cash ")+money(cash);
      saveSession();
    }
  }
}

function handleInventory(inv){
  if(!inv || typeof inv!=="object") return;
  if(previousInventory){
    const pairs=[
      ["conductor","exp_token|train|train"],
      ["player","exp_token|player|player"],
      ["altConductor","exp_token_a|train|train"]
    ];
    for(const [field,key] of pairs){
      const delta=invAmount(inv,key)-invAmount(previousInventory,key);
      if(delta>0){
        session[field]+=delta;
        if(route) route[field]+=delta;
        session.lastReward="+"+delta.toLocaleString()+" "+(field==="player"?"Player":field==="altConductor"?"Train BXP":"Conductor")+" token"+(delta===1?"":"s");
      }
    }
  }
  previousInventory=JSON.parse(JSON.stringify(inv));
}

function handleData(data){
  latest={...latest,...data};
  document.getElementById("connection").textContent =
    (latest.job==="conductor" || latest.job_name==="Train Conductor") ? "Train Conductor detected" : "Waiting for Train Conductor";

  if(typeof data.wallet==="number"){
    if(previousWallet!==null){
      const delta=data.wallet-previousWallet;
      if(delta>0) recentWalletGains.push({time:Date.now(),amount:delta,used:false});
    }
    previousWallet=data.wallet;
  }

  if(data.inventory) handleInventory(data.inventory);
  if(typeof data.exp_train_train==="number"){
    if(typeof latest._prevTrainXp==="number"){
      const delta=data.exp_train_train-latest._prevTrainXp;
      if(delta>0){
        session.trainXp+=delta;
        if(route) route.trainXp+=delta;
        session.lastReward="+"+delta.toLocaleString(undefined,{maximumFractionDigits:2})+" Train XP";
      }
    }
    latest._prevTrainXp=data.exp_train_train;
  }
  if(typeof data.notification === "string"){
    if(previousNotification !== null && data.notification !== previousNotification){
      handleNotification(data.notification);
    }
    previousNotification = data.notification;
  }

  if("status" in data){
    const parsed=parseStatus(data.status);
    const prevParsed=parseStatus(previousStatus);

    if(!parsed && prevParsed && route){
      // Final train stop clears status before the reward bundle arrives.
      // Keep the route alive until the next 0/N route appears so those rewards
      // stay attached to the route that actually earned them.
      pendingRouteCompletion = true;
      if(route.stop < route.total){
        const remaining = route.total - route.stop;
        session.stops += remaining;
        route.stop = route.total;
        session.lastReward = "Final stop complete";
      }
    }else if(parsed){
      if(!route){
        startRoute(parsed);
        pendingRouteCompletion = false;
      }else if(pendingRouteCompletion || parsed.name!==route.name){
        // The 0/N state can be very brief. If we first see the new direction
        // at 1/N, 2/N, etc., the route name change is still authoritative.
        completeRoute();
        startRoute(parsed);
        pendingRouteCompletion = false;
      }else{
        if(parsed.stop>route.stop){
          const diff=parsed.stop-route.stop;
          session.stops+=diff;
          route.stop=parsed.stop;
          session.lastReward="Stop "+parsed.stop+"/"+parsed.total+" complete";
        }
        route.total=parsed.total;
        route.trainName=parsed.trainName||route.trainName;
        route.tier=parsed.tier??route.tier;
      }
    }
    previousStatus=data.status;
  }

  saveSession();
  render();
}

function rewardMode(){
  if(route && route.conductor>0 && route.trainXp===0) return ["TOKEN MODE","live"];
  if(route && route.trainXp>0) return ["XP ACTIVE","live"];
  if(session.conductor>0 && session.trainXp===0) return ["TOKEN MODE","live"];
  if(session.trainXp>0) return ["XP ACTIVE","live"];
  return ["WAITING",""];
}

function render(){
  const now=Date.now();
  const parsed=route;
  document.getElementById("route-name").textContent=parsed?parsed.name:"No active train route";
  document.getElementById("stop-text").textContent=parsed?`Stop ${parsed.stop} / ${parsed.total}`:"Stop — / —";
  const pct=parsed&&parsed.total?Math.round(parsed.stop/parsed.total*100):0;
  document.getElementById("route-percent").textContent=pct+"%";
  document.getElementById("progress-bar").style.width=pct+"%";
  document.getElementById("train-name").textContent=parsed?
    ((parsed.trainName||"Train")+(parsed.tier?" · Tier "+parsed.tier:"")):"Train —";
  document.getElementById("route-time").textContent=parsed?duration(now-parsed.startedAt):"00:00";

  const source=parsed||{cash:0,conductor:0,player:0,trainXp:0,startedAt:session.startedAt};
  document.getElementById("route-cash").textContent=money(source.cash);
  document.getElementById("route-conductor").textContent="+"+Math.round(source.conductor).toLocaleString();
  document.getElementById("route-player").textContent="+"+Math.round(source.player).toLocaleString();
  document.getElementById("route-xp").textContent="+"+n(source.trainXp).toLocaleString(undefined,{maximumFractionDigits:2});
  document.getElementById("cash-rate").textContent=money(rate(source.cash,source.startedAt))+"/hr";
  document.getElementById("conductor-rate").textContent=Math.round(rate(source.conductor,source.startedAt)).toLocaleString()+"/hr";
  document.getElementById("player-rate").textContent=Math.round(rate(source.player,source.startedAt)).toLocaleString()+"/hr";
  document.getElementById("xp-rate").textContent=Math.round(rate(source.trainXp,source.startedAt)).toLocaleString()+"/hr";

  document.getElementById("session-time").textContent=duration(now-session.startedAt,true);
  document.getElementById("routes-completed").textContent=session.routes.toLocaleString();
  document.getElementById("stops-completed").textContent=session.stops.toLocaleString();
  document.getElementById("session-cash").textContent=money(session.cash);
  document.getElementById("session-conductor").textContent="+"+Math.round(session.conductor).toLocaleString();
  document.getElementById("session-player").textContent="+"+Math.round(session.player).toLocaleString();
  document.getElementById("session-xp").textContent="+"+n(session.trainXp).toLocaleString(undefined,{maximumFractionDigits:2});
  document.getElementById("last-reward").textContent=session.lastReward||"—";

  const [mode,cls]=rewardMode();
  const badge=document.getElementById("reward-mode");
  badge.textContent=mode;
  badge.className="badge "+cls;
}

(function drag(){
  const handle=document.getElementById("drag-handle");
  let active=false,dx=0,dy=0;
  handle.addEventListener("mousedown",e=>{
    if(e.target.closest("button")) return;
    active=true;
    const r=app.getBoundingClientRect();
    dx=e.clientX-r.left; dy=e.clientY-r.top;
  });
  document.addEventListener("mousemove",e=>{
    if(!active) return;
    const x=Math.max(0,Math.min(e.clientX-dx,window.innerWidth-app.offsetWidth));
    const y=Math.max(0,Math.min(e.clientY-dy,window.innerHeight-app.offsetHeight));
    app.style.left=x+"px"; app.style.top=y+"px";
  });
  document.addEventListener("mouseup",()=>{
    if(!active) return;
    active=false;
    localStorage.setItem(POS_KEY,JSON.stringify({left:app.style.left,top:app.style.top}));
  });
})();

function restorePosition(){
  try{
    const p=JSON.parse(localStorage.getItem(POS_KEY)||"null");
    if(p){app.style.left=p.left||"40px";app.style.top=p.top||"40px";}
  }catch{}
}

document.getElementById("minimize-btn").addEventListener("click",()=>{
  minimized=!minimized;
  app.classList.toggle("minimized",minimized);
  document.getElementById("minimize-btn").textContent=minimized?"+":"−";
});
document.getElementById("reset-btn").addEventListener("click",resetSession);
window.addEventListener("keydown",e=>{
  if(e.key==="Escape") window.parent.postMessage({type:"pin"},"*");
});
window.addEventListener("message",e=>{
  const msg=e.data;
  if(msg && msg.type==="data" && msg.data) handleData(msg.data);
});

loadSession();
restorePosition();
render();
setInterval(render,1000);
window.parent.postMessage({type:"getData"},"*");
