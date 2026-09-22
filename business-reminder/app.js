(() => {
  "use strict";

  const DURATION_MS = 3 * 60 * 60 * 1000;
  const END_KEY = "businessReminder.endAt";
  const POS_KEY = "businessReminder.position";

  const reminder = document.getElementById("reminder");
  const timerView = document.getElementById("timerView");
  const alertView = document.getElementById("alertView");
  const countdown = document.getElementById("countdown");
  const nextTime = document.getElementById("nextTime");
  const progressFill = document.getElementById("progressFill");
  const startBtn = document.getElementById("startBtn");

  let endAt = Number(localStorage.getItem(END_KEY) || 0);

  function formatDuration(ms){
    const total = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return [h,m,s].map(v => String(v).padStart(2,"0")).join(":");
  }

  function formatTime(ts){
    return new Date(ts).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"});
  }

  function startTimer(){
    endAt = Date.now() + DURATION_MS;
    localStorage.setItem(END_KEY, String(endAt));
    reminder.classList.remove("ready");
    timerView.hidden = false;
    alertView.hidden = true;
    startBtn.textContent = "Restart 3 Hour Timer";
    render();
  }

  function resetTimer(){
    endAt = 0;
    localStorage.removeItem(END_KEY);
    reminder.classList.remove("ready");
    timerView.hidden = false;
    alertView.hidden = true;
    countdown.textContent = "03:00:00";
    nextTime.textContent = "Not started";
    progressFill.style.width = "0%";
    startBtn.textContent = "Start 3 Hour Timer";
  }

  function showReady(){
    reminder.classList.add("ready");
    timerView.hidden = true;
    alertView.hidden = false;
  }

  function render(){
    if (!endAt) return;

    const remaining = endAt - Date.now();
    if (remaining <= 0){
      showReady();
      return;
    }

    reminder.classList.remove("ready");
    timerView.hidden = false;
    alertView.hidden = true;

    countdown.textContent = formatDuration(remaining);
    nextTime.textContent = "Ready at " + formatTime(endAt);
    startBtn.textContent = "Restart 3 Hour Timer";

    const elapsed = DURATION_MS - remaining;
    const pct = Math.max(0, Math.min(100, (elapsed / DURATION_MS) * 100));
    progressFill.style.width = pct + "%";
  }

  function setupDrag(){
    const handle = document.getElementById("dragHandle");
    try{
      const p = JSON.parse(localStorage.getItem(POS_KEY) || "null");
      if(p){
        reminder.style.left = Math.max(0, Math.min(p.x, window.innerWidth-reminder.offsetWidth)) + "px";
        reminder.style.top = Math.max(0, Math.min(p.y, window.innerHeight-reminder.offsetHeight)) + "px";
      }
    }catch{}

    let dragging=false, dx=0, dy=0;
    handle.addEventListener("mousedown", e => {
      if(e.target.closest("button")) return;
      const r = reminder.getBoundingClientRect();
      dragging=true;
      dx=e.clientX-r.left;
      dy=e.clientY-r.top;
      e.preventDefault();
    });

    document.addEventListener("mousemove", e => {
      if(!dragging) return;
      reminder.style.left = Math.max(0, Math.min(e.clientX-dx, window.innerWidth-reminder.offsetWidth)) + "px";
      reminder.style.top = Math.max(0, Math.min(e.clientY-dy, window.innerHeight-reminder.offsetHeight)) + "px";
    });

    document.addEventListener("mouseup", () => {
      if(!dragging) return;
      dragging=false;
      localStorage.setItem(POS_KEY, JSON.stringify({x:reminder.offsetLeft,y:reminder.offsetTop}));
    });
  }

  document.getElementById("startBtn").addEventListener("click", startTimer);
  document.getElementById("resetBtn").addEventListener("click", resetTimer);
  document.getElementById("collectedBtn").addEventListener("click", startTimer);
  document.getElementById("minimizeBtn").addEventListener("click", () => reminder.classList.toggle("minimized"));

  window.addEventListener("keydown", e => {
    if(e.key === "Escape") window.parent.postMessage({type:"pin"},"*");
  });

  setupDrag();
  if(endAt) render();
  else resetTimer();
  setInterval(render, 1000);
})();