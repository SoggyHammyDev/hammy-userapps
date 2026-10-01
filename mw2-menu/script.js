(() => {
  "use strict";

  const POSITION_KEY = "hammyMw2Menu.position.v1";
  const SETTINGS_KEY = "hammyMw2Menu.settings.v1";
  const TOGGLE_TRIGGER = "hammymw2toggle";
  const TOGGLE_TRIGGER_KEY = "trigger_" + TOGGLE_TRIGGER;

  const app = document.getElementById("app");
  const dragHandle = document.getElementById("dragHandle");
  const menuList = document.getElementById("menuList");
  const detailPanel = document.getElementById("detailPanel");
  const detailTitle = document.getElementById("detailTitle");
  const detailDescription = document.getElementById("detailDescription");
  const detailBody = document.getElementById("detailBody");
  const primaryAction = document.getElementById("primaryAction");
  const pinState = document.getElementById("pinState");
  const showButton = document.getElementById("showButton");
  const clock = document.getElementById("clock");

  const state = {
    selected: 0,
    visible: true,
    lastToggleTrigger: undefined,
    settings: {
      enabled: true,
      styleHud: true,
      stylePrompts: true,
      stylePlayerList: true
    }
  };

  const items = [
    {
      id: "theme",
      label: "MW2 THEME",
      tag: "ACTIVE",
      title: "MW2 INTERFACE",
      description: "Apply the classic MW2-inspired pregame look to Transport Tycoon menus.",
      stats: [
        ["THEME", "MW2 / 2009"],
        ["MENU", "PREGAME"],
        ["STATUS", "READY"]
      ]
    },
    {
      id: "menus",
      label: "NATIVE MENUS",
      tag: "TT",
      title: "NATIVE MENUS",
      description: "Restyle TT menu headers, choices, selected rows and descriptions.",
      stats: [
        ["SELECTION", "OLIVE"],
        ["PANELS", "SMOKE"],
        ["MOTION", "FAST"]
      ]
    },
    {
      id: "prompts",
      label: "PROMPTS",
      tag: "UI",
      title: "PROMPTS",
      description: "Give vRP text prompts the same compact military menu treatment.",
      stats: [
        ["STYLE", "MW2"],
        ["INPUT", "ENHANCED"],
        ["OPTION", "TOGGLE"]
      ]
    },
    {
      id: "hud",
      label: "HUD BLOCKS",
      tag: "UI",
      title: "HUD BLOCKS",
      description: "Theme the money, bank and job blocks to match the menu.",
      stats: [
        ["MONEY", "ON"],
        ["BANK", "ON"],
        ["JOB", "ON"]
      ]
    },
    {
      id: "players",
      label: "PLAYER LIST",
      tag: "UI",
      title: "PLAYER LIST",
      description: "Apply the same dark olive interface to the TT player list.",
      stats: [
        ["ROWS", "COMPACT"],
        ["TEXT", "HIGH CONTRAST"],
        ["OPTION", "TOGGLE"]
      ]
    },
    {
      id: "settings",
      label: "SETTINGS",
      tag: "",
      title: "SETTINGS",
      description: "Toggle individual MW2 theme components.",
      stats: []
    },
    {
      id: "hide",
      label: "CLOSE",
      tag: "ESC",
      title: "CLOSE MENU",
      description: "Hide this control panel. Your applied TT theme stays active.",
      stats: [
        ["KEYBIND", "HAMMY MW2 MENU"],
        ["ESC", "PIN / UNPIN"]
      ]
    }
  ];

  const MW2_CSS = `
    :root{
      --hammy-mw2-text:#e8ecdf;
      --hammy-mw2-muted:#9da391;
      --hammy-mw2-green:#a8ba80;
      --hammy-mw2-orange:#d69647;
      --hammy-mw2-bg:rgba(11,13,12,.965);
      --hammy-mw2-panel:rgba(29,32,27,.94);
    }

    .menu{
      overflow:visible!important;
      background:var(--hammy-mw2-bg)!important;
      border:1px solid rgba(225,232,211,.13)!important;
      border-radius:0!important;
      box-shadow:0 16px 44px rgba(0,0,0,.48)!important;
      color:var(--hammy-mw2-text)!important;
      font-family:Arial,Helvetica,sans-serif!important;
      text-shadow:0 1px 3px rgba(0,0,0,.7)!important;
    }

    .menu:before{
      content:"MULTIPLAYER  /  TRANSPORT TYCOON";
      display:block!important;
      padding:7px 13px 5px!important;
      color:#939989!important;
      background:rgba(255,255,255,.018)!important;
      border-bottom:1px solid rgba(255,255,255,.055)!important;
      font-size:9px!important;
      font-weight:700!important;
      letter-spacing:.12em!important;
    }

    .menu h1{
      position:relative!important;
      margin:0!important;
      padding:11px 13px 10px!important;
      border:0!important;
      border-bottom:1px solid rgba(225,232,211,.11)!important;
      border-radius:0!important;
      background:
        linear-gradient(90deg,rgba(116,128,94,.12),transparent 66%),
        rgba(21,24,20,.96)!important;
      color:#f0f2e8!important;
      font-size:17px!important;
      font-weight:700!important;
      line-height:1.05!important;
      letter-spacing:.01em!important;
      text-align:left!important;
      text-shadow:0 2px 8px rgba(0,0,0,.75)!important;
    }

    .menu .choices{
      padding:8px 0!important;
      background:
        repeating-linear-gradient(0deg,rgba(255,255,255,.009) 0 1px,transparent 1px 3px),
        rgba(13,15,13,.97)!important;
    }

    .menu .choices > div{
      position:relative!important;
      min-height:30px!important;
      margin:2px 0!important;
      padding:7px 13px 7px 17px!important;
      border:0!important;
      border-left:3px solid transparent!important;
      border-radius:0!important;
      background:rgba(255,255,255,.018)!important;
      color:#d7dbcf!important;
      font-size:12px!important;
      font-weight:700!important;
      line-height:1.25!important;
      transition:background .07s linear,color .07s linear,padding-left .07s linear!important;
    }

    .menu .choices > div:hover,
    .menu .choices > div.selected{
      padding-left:22px!important;
      border-left-color:#bfd394!important;
      background:
        linear-gradient(90deg,rgba(155,174,117,.31),rgba(109,121,89,.13) 72%,transparent)!important;
      color:#fbfcf7!important;
      box-shadow:
        inset 0 1px rgba(229,238,211,.07),
        inset 0 -1px rgba(0,0,0,.34)!important;
    }

    .menu .choices > div.selected:after{
      content:"";
      position:absolute!important;
      left:0!important;
      top:0!important;
      bottom:0!important;
      width:100%!important;
      pointer-events:none!important;
      background:linear-gradient(90deg,rgba(229,238,211,.035),transparent 58%)!important;
    }

    .menu .choices > div div,
    .menu .choices > div span{
      color:inherit!important;
      border-radius:0!important;
    }

    .menu_description{
      padding:9px 12px!important;
      background:rgba(13,15,13,.965)!important;
      border:1px solid rgba(225,232,211,.12)!important;
      border-radius:0!important;
      box-shadow:0 12px 34px rgba(0,0,0,.42)!important;
      color:#aeb4a3!important;
      font-family:Arial,Helvetica,sans-serif!important;
      font-size:10px!important;
      line-height:1.42!important;
      text-shadow:0 1px 3px rgba(0,0,0,.7)!important;
    }

    .div_money,.div_bmoney,.div_job{
      right:12px!important;
      width:145px!important;
      min-width:145px!important;
      min-height:34px!important;
      height:34px!important;
      padding:0 10px!important;
      display:flex!important;
      align-items:center!important;
      justify-content:flex-end!important;
      gap:7px!important;
      border:1px solid rgba(225,232,211,.11)!important;
      border-left:3px solid rgba(168,186,128,.66)!important;
      border-radius:0!important;
      background:rgba(12,14,12,.94)!important;
      box-shadow:0 8px 22px rgba(0,0,0,.34)!important;
      color:#e7eadf!important;
      font-family:Arial,Helvetica,sans-serif!important;
      font-size:12px!important;
      font-weight:700!important;
      text-shadow:0 1px 3px rgba(0,0,0,.7)!important;
    }

    .div_money{top:48px!important}
    .div_bmoney{top:84px!important}
    .div_job{top:120px!important;border-left-color:rgba(214,150,71,.72)!important}

    .div_money .symbol,.div_bmoney .symbol{
      width:25px!important;
      height:25px!important;
      object-fit:contain!important;
      flex:none!important;
      filter:saturate(.68) brightness(1.08)!important;
    }
  `;

  const PROMPT_CSS = `
    .wprompt{
      width:440px!important;
      height:170px!important;
      padding:0!important;
      gap:0!important;
      overflow:hidden!important;
      background:rgba(11,13,12,.97)!important;
      border:1px solid rgba(225,232,211,.13)!important;
      border-radius:0!important;
      box-shadow:0 16px 44px rgba(0,0,0,.48)!important;
      color:#e8ecdf!important;
      font-family:Arial,Helvetica,sans-serif!important;
    }
    .wprompt h1{
      margin:0!important;
      padding:11px 13px 10px!important;
      border-bottom:1px solid rgba(225,232,211,.11)!important;
      background:linear-gradient(90deg,rgba(116,128,94,.13),transparent 70%)!important;
      color:#f0f2e8!important;
      font-size:14px!important;
      font-weight:700!important;
      text-shadow:0 2px 8px rgba(0,0,0,.75)!important;
    }
    .wprompt textarea{
      width:calc(100% - 22px)!important;
      min-height:82px!important;
      margin:10px 11px 6px!important;
      padding:9px 10px!important;
      resize:none!important;
      outline:none!important;
      border:1px solid rgba(225,232,211,.10)!important;
      border-left:3px solid rgba(168,186,128,.64)!important;
      border-radius:0!important;
      background:rgba(255,255,255,.025)!important;
      color:#e8ecdf!important;
      font:12px Arial,Helvetica,sans-serif!important;
      box-shadow:none!important;
    }
    .wprompt textarea:focus{
      background:rgba(158,177,120,.055)!important;
      border-color:rgba(190,208,153,.28)!important;
    }
    .wprompt .help{
      margin:0 12px!important;
      color:#8e9584!important;
      font-size:8px!important;
      font-style:normal!important;
      text-shadow:none!important;
    }
  `;

  const PLAYERLIST_CSS = `
    #playerlist{
      padding:0!important;
      overflow:hidden!important;
      border:1px solid rgba(225,232,211,.12)!important;
      border-radius:0!important;
      background:rgba(11,13,12,.965)!important;
      box-shadow:0 16px 44px rgba(0,0,0,.46)!important;
      color:#e8ecdf!important;
      font-family:Arial,Helvetica,sans-serif!important;
    }
    #playerlist .titles{
      margin:0!important;
      padding:6px 5px!important;
      border-bottom:1px solid rgba(225,232,211,.10)!important;
      background:linear-gradient(90deg,rgba(116,128,94,.13),transparent)!important;
      color:#9fa694!important;
      font-size:11px!important;
      font-weight:700!important;
    }
    #playerlist .player{
      border-bottom:1px solid rgba(255,255,255,.045)!important;
      background:rgba(255,255,255,.018)!important;
      color:#dce0d4!important;
      font-size:12px!important;
      font-weight:600!important;
    }
    #playerlist .player:nth-child(even){background:rgba(255,255,255,.03)!important}
    #playerlist .player:hover{background:rgba(155,174,117,.16)!important}
    #playerlist .player .title{color:#e9ecdf!important;text-shadow:none!important}
    #playerlist .id{color:#aab19e!important}
  `;

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      if (saved && typeof saved === "object") Object.assign(state.settings, saved);
    } catch {}
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  }

  function sendCss(css) {
    window.parent.postMessage({
      type: "setDivCss",
      div: "additional_css",
      css
    }, "*");
  }

  function findFrameDocument(test) {
    try {
      const topDoc = window.top.document;
      for (const frame of Array.from(topDoc.querySelectorAll("iframe,frame"))) {
        try {
          const doc = frame.contentDocument || frame.contentWindow?.document;
          const href = doc?.location?.href || "";
          if (doc && test(href, doc)) return doc;
        } catch {}
      }
    } catch {}
    return null;
  }

  function injectFrameStyle(doc, id, css) {
    if (!doc) return false;
    try {
      let style = doc.getElementById(id);
      if (!style) {
        style = doc.createElement("style");
        style.id = id;
        (doc.head || doc.documentElement).appendChild(style);
      }
      style.textContent = css;
      return true;
    } catch {
      return false;
    }
  }

  function removeFrameStyle(doc, id) {
    try { doc?.getElementById(id)?.remove(); } catch {}
  }

  function applyTheme() {
    if (!state.settings.enabled) {
      sendCss("");
      removeFrameStyle(findFrameDocument((href, doc) => !!doc.querySelector(".wprompt")), "hammy-mw2-prompts");
      removeFrameStyle(findFrameDocument((href, doc) => !!doc.querySelector("#playerlist")), "hammy-mw2-playerlist");
      render();
      return;
    }

    let css = MW2_CSS;
    if (!state.settings.styleHud) {
      css += `
        .div_money,.div_bmoney,.div_job{
          all:revert!important;
        }
      `;
    }
    sendCss(css);

    const promptDoc = findFrameDocument((href, doc) => !!doc.querySelector(".wprompt"));
    if (state.settings.stylePrompts) injectFrameStyle(promptDoc, "hammy-mw2-prompts", PROMPT_CSS);
    else removeFrameStyle(promptDoc, "hammy-mw2-prompts");

    const playerDoc = findFrameDocument((href, doc) => !!doc.querySelector("#playerlist"));
    if (state.settings.stylePlayerList) injectFrameStyle(playerDoc, "hammy-mw2-playerlist", PLAYERLIST_CSS);
    else removeFrameStyle(playerDoc, "hammy-mw2-playerlist");

    render();
  }

  function statLine(label, value, orange = false) {
    const row = document.createElement("div");
    row.className = "stat-line";
    const l = document.createElement("span");
    l.textContent = label;
    const v = document.createElement("strong");
    v.textContent = value;
    if (orange) v.classList.add("orange");
    row.append(l, v);
    return row;
  }

  function renderSettings() {
    detailBody.innerHTML = "";
    const rows = [
      ["MW2 THEME", "enabled"],
      ["HUD BLOCKS", "styleHud"],
      ["PROMPTS", "stylePrompts"],
      ["PLAYER LIST", "stylePlayerList"]
    ];

    for (const [label, key] of rows) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "stat-line";
      row.style.cursor = "pointer";
      row.style.width = "100%";
      row.style.color = "inherit";

      const l = document.createElement("span");
      l.textContent = label;
      const v = document.createElement("strong");
      v.textContent = state.settings[key] ? "ON" : "OFF";
      if (!state.settings[key]) v.classList.add("orange");

      row.append(l, v);
      row.addEventListener("click", () => {
        state.settings[key] = !state.settings[key];
        saveSettings();
        applyTheme();
      });
      detailBody.appendChild(row);
    }
  }

  function render() {
    menuList.innerHTML = "";

    items.forEach((item, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "menu-item" + (index === state.selected ? " selected" : "");
      btn.dataset.index = index;

      const label = document.createElement("span");
      label.className = "menu-label";
      label.textContent = item.label;

      const tag = document.createElement("span");
      tag.className = "menu-tag";
      if (item.id === "theme") tag.textContent = state.settings.enabled ? "ACTIVE" : "OFF";
      else tag.textContent = item.tag;

      btn.append(label, tag);
      btn.addEventListener("mouseenter", () => select(index, false));
      btn.addEventListener("click", () => {
        select(index, true);
        activate();
      });
      menuList.appendChild(btn);
    });

    const selected = items[state.selected];
    detailTitle.textContent = selected.title;
    detailDescription.textContent = selected.description;

    if (selected.id === "settings") {
      renderSettings();
      primaryAction.textContent = "APPLY SETTINGS";
    } else {
      detailBody.innerHTML = "";
      selected.stats.forEach(([label, value], i) => {
        if (selected.id === "theme" && label === "STATUS") value = state.settings.enabled ? "ACTIVE" : "DISABLED";
        detailBody.appendChild(statLine(label, value, i === selected.stats.length - 1 && selected.id === "theme"));
      });

      if (selected.id === "theme") primaryAction.textContent = state.settings.enabled ? "DISABLE THEME" : "ENABLE THEME";
      else if (selected.id === "hide") primaryAction.textContent = "CLOSE";
      else primaryAction.textContent = "SELECT";
    }
  }

  function select(index, animate = true) {
    state.selected = (index + items.length) % items.length;
    render();

    if (animate) {
      detailPanel.classList.remove("flash");
      void detailPanel.offsetWidth;
      detailPanel.classList.add("flash");
    }
  }

  function activate() {
    const item = items[state.selected];

    if (item.id === "theme") {
      state.settings.enabled = !state.settings.enabled;
      saveSettings();
      applyTheme();
      return;
    }

    if (item.id === "prompts") {
      state.settings.stylePrompts = !state.settings.stylePrompts;
      saveSettings();
      applyTheme();
      return;
    }

    if (item.id === "hud") {
      state.settings.styleHud = !state.settings.styleHud;
      saveSettings();
      applyTheme();
      return;
    }

    if (item.id === "players") {
      state.settings.stylePlayerList = !state.settings.stylePlayerList;
      saveSettings();
      applyTheme();
      return;
    }

    if (item.id === "menus") {
      state.settings.enabled = true;
      saveSettings();
      applyTheme();
      return;
    }

    if (item.id === "settings") {
      applyTheme();
      return;
    }

    if (item.id === "hide") hide();
  }

  function hide() {
    state.visible = false;
    app.classList.add("hidden");
    showButton.classList.remove("hidden");
  }

  function show() {
    state.visible = true;
    app.classList.remove("hidden");
    showButton.classList.add("hidden");
  }

  function toggleVisible() {
    state.visible ? hide() : show();
  }

  function setupDrag() {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;

    try {
      const saved = JSON.parse(localStorage.getItem(POSITION_KEY) || "null");
      if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
        app.style.left = saved.left + "px";
        app.style.top = saved.top + "px";
      }
    } catch {}

    dragHandle.addEventListener("mousedown", e => {
      if (e.button !== 0) return;
      dragging = true;
      const rect = app.getBoundingClientRect();
      originX = rect.left;
      originY = rect.top;
      startX = e.clientX;
      startY = e.clientY;
      e.preventDefault();
    });

    window.addEventListener("mousemove", e => {
      if (!dragging) return;
      const maxLeft = Math.max(0, window.innerWidth - app.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - app.offsetHeight);
      const left = Math.min(maxLeft, Math.max(0, originX + e.clientX - startX));
      const top = Math.min(maxTop, Math.max(0, originY + e.clientY - startY));
      app.style.left = left + "px";
      app.style.top = top + "px";
    });

    window.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      const rect = app.getBoundingClientRect();
      localStorage.setItem(POSITION_KEY, JSON.stringify({ left: rect.left, top: rect.top }));
    });
  }

  window.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      window.parent.postMessage({ type: "pin" }, "*");
      return;
    }

    if (!state.visible) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      select(state.selected + 1, true);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      select(state.selected - 1, true);
    } else if (e.key === "Enter") {
      e.preventDefault();
      activate();
    }
  });

  window.addEventListener("message", event => {
    const data = event.data || {};

    if (Object.prototype.hasOwnProperty.call(data, "pinned")) {
      pinState.textContent = data.pinned ? "PINNED" : "UNPINNED";
    }

    if (Object.prototype.hasOwnProperty.call(data, TOGGLE_TRIGGER_KEY)) {
      const value = data[TOGGLE_TRIGGER_KEY];
      if (state.lastToggleTrigger !== undefined && value !== state.lastToggleTrigger) toggleVisible();
      state.lastToggleTrigger = value;
    }
  });

  primaryAction.addEventListener("click", activate);
  showButton.addEventListener("click", show);

  setInterval(() => {
    const now = new Date();
    clock.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  }, 1000);

  setInterval(() => {
    if (state.settings.enabled) applyTheme();
  }, 3500);

  loadSettings();
  setupDrag();
  render();
  applyTheme();

  window.parent.postMessage({ type: "registerTrigger", trigger: TOGGLE_TRIGGER }, "*");
  window.parent.postMessage({ type: "getData" }, "*");
})();
