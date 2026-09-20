(() => {
  "use strict";

  const DOCUMENTED_KEYS = new Set([
    "user_id","source","name","job","wallet","bank","vehicle","vehicleClass","vehicleName","vehicleMake",
    "vehicleClassName","rpm","engine","fuel","honk","car","cab","trailer","aircraft","helicopter","boat",
    "notification","pos_x","pos_y","pos_z","pos_h","zone","zoneName","street","discord","inventory","weight",
    "max_weight","waypoint","waypoint_x","waypoint_y","menu","menu_choice","chest","faction_id","faction_name",
    "faction_tag","faction_president","pkey","health","armor","landing_gear","altitude","hidden","pinned","focused",
    "tabbed","players","weather","weather_forecast","weather_frozen","weather_snow"
  ]);

  const state = {
    values: {},
    meta: {},
    events: [],
    updateTotal: 0,
    firstDataAt: null,
    lastDataAt: null,
    snapshotA: null,
    snapshotB: null,
    triggerStats: {},
    paused: false
  };

  const $ = (id) => document.getElementById(id);
  const nowIso = () => new Date().toISOString();
  const nowClock = () => new Date().toLocaleTimeString();
  const clone = (obj) => JSON.parse(JSON.stringify(obj));

  function classifyKey(key) {
    if (key.startsWith("trigger_")) return "trigger";
    if (key.startsWith("temp_")) return "temp";
    if (key.startsWith("chest_")) return "chest";
    if (key.startsWith("players_")) return "players";
    if (key.startsWith("local_")) return "local";
    if (key.startsWith("runway_")) return "runway";
    if (DOCUMENTED_KEYS.has(key)) return "documented";
    if (/^(steam|license|license2|fivem|xbl|live|ip)$/.test(key)) return "documented";
    return "unknown";
  }

  function valueType(value) {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    return typeof value;
  }

  function tryParseJson(value) {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (!trimmed || !((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]")))) return value;
    try { return JSON.parse(trimmed); } catch (_) { return value; }
  }

  function displayValue(value) {
    const parsed = tryParseJson(value);
    if (typeof parsed === "object" && parsed !== null) {
      try { return JSON.stringify(parsed, null, 2); } catch (_) {}
    }
    return String(value);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function send(payload) {
    try {
      window.parent.postMessage(payload, "*");
      $("command-result").textContent = "Sent " + JSON.stringify(payload);
      return true;
    } catch (error) {
      $("command-result").textContent = "Send failed: " + error.message;
      return false;
    }
  }

  function processData(data) {
    if (!data || typeof data !== "object") return;
    const stamp = nowIso();
    if (!state.firstDataAt) state.firstDataAt = stamp;
    state.lastDataAt = stamp;

    Object.entries(data).forEach(([key, rawValue]) => {
      const previous = Object.prototype.hasOwnProperty.call(state.values, key) ? state.values[key] : undefined;
      const isNew = !Object.prototype.hasOwnProperty.call(state.meta, key);
      const parsedValue = tryParseJson(rawValue);
      const category = classifyKey(key);

      state.values[key] = parsedValue;
      state.updateTotal += 1;
      state.meta[key] = {
        key,
        category,
        documented: category !== "unknown",
        type: valueType(parsedValue),
        updates: (state.meta[key]?.updates || 0) + 1,
        firstSeen: state.meta[key]?.firstSeen || stamp,
        lastSeen: stamp
      };

      state.events.unshift({
        time: stamp,
        key,
        value: parsedValue,
        previous,
        category,
        isNew
      });
      if (state.events.length > 1500) state.events.length = 1500;

      if (category === "trigger") {
        const prior = state.triggerStats[key];
        state.triggerStats[key] = {
          count: (prior?.count || 0) + 1,
          lastValue: parsedValue,
          lastSeen: stamp,
          delta: prior && typeof parsedValue === "number" && typeof prior.lastValue === "number" ? parsedValue - prior.lastValue : null
        };
      }
    });

    renderAll();
  }

  function renderAll() {
    renderConnection();
    renderSummary();
    renderLive();
    if (!state.paused) renderEvents();
    renderTriggers();
    renderRuntime();
    renderDiff();
  }

  function renderConnection() {
    const pill = $("connection-pill");
    if (state.lastDataAt) {
      pill.className = "pill pill-ok";
      pill.textContent = "Receiving game data";
      $("footer-state").textContent = "Last update " + new Date(state.lastDataAt).toLocaleTimeString();
    } else {
      pill.className = "pill pill-warn";
      pill.textContent = "Waiting for game data";
      $("footer-state").textContent = "No game data received yet.";
    }
  }

  function renderSummary() {
    const keys = Object.keys(state.meta);
    $("summary-keys").textContent = keys.length;
    $("summary-unknown").textContent = keys.filter(k => state.meta[k].category === "unknown").length;
    $("summary-updates").textContent = state.updateTotal.toLocaleString();
    $("summary-last").textContent = state.lastDataAt ? new Date(state.lastDataAt).toLocaleTimeString() : "—";
    $("live-count").textContent = keys.length;
    $("event-count").textContent = state.events.length;
  }

  function renderLive() {
    const search = $("live-search").value.trim().toLowerCase();
    const filter = $("live-filter").value;
    const rows = Object.keys(state.meta)
      .sort((a,b) => a.localeCompare(b))
      .filter(key => {
        const meta = state.meta[key];
        const value = displayValue(state.values[key]).toLowerCase();
        const searchOk = !search || key.toLowerCase().includes(search) || value.includes(search);
        const filterOk = filter === "all" || meta.category === filter;
        return searchOk && filterOk;
      });

    if (!rows.length) {
      $("live-table").innerHTML = '<div class="empty">No matching data yet. Click Request Data while loaded in Transport Tycoon.</div>';
      return;
    }

    const header = '<div class="data-row header"><div>Key</div><div>Type</div><div>Value</div><div>Seen</div><div>Updates</div></div>';
    $("live-table").innerHTML = header + rows.map(key => {
      const meta = state.meta[key];
      const tagClass = meta.category === "unknown" ? "tag-unknown" : meta.category === "trigger" ? "tag-trigger" : "tag-known";
      const label = meta.category === "documented" ? "documented" : meta.category;
      return '<div class="data-row">' +
        '<div><div class="key">' + escapeHtml(key) + '</div><span class="tag ' + tagClass + '">' + escapeHtml(label) + '</span></div>' +
        '<div>' + escapeHtml(meta.type) + '</div>' +
        '<div class="value">' + escapeHtml(displayValue(state.values[key])) + '</div>' +
        '<div>' + escapeHtml(new Date(meta.lastSeen).toLocaleTimeString()) + '</div>' +
        '<div>' + meta.updates + '</div>' +
      '</div>';
    }).join("");
  }

  function renderEvents() {
    const search = $("event-search").value.trim().toLowerCase();
    const events = state.events.filter(evt => {
      if (!search) return true;
      return evt.key.toLowerCase().includes(search) || displayValue(evt.value).toLowerCase().includes(search);
    }).slice(0, 400);

    if (!events.length) {
      $("event-log").innerHTML = '<div class="empty">No events recorded yet.</div>';
      return;
    }

    $("event-log").innerHTML = events.map(evt => {
      const classes = ["event"];
      if (evt.isNew) classes.push("new-key");
      if (evt.category === "trigger") classes.push("trigger");
      return '<div class="' + classes.join(" ") + '">' +
        '<div class="event-time">' + escapeHtml(new Date(evt.time).toLocaleTimeString()) + '</div>' +
        '<div class="key">' + escapeHtml(evt.key) + (evt.isNew ? ' <span class="tag tag-unknown">NEW</span>' : '') + '</div>' +
        '<div class="value">' + escapeHtml(displayValue(evt.value)) + '</div>' +
      '</div>';
    }).join("");
  }

  function renderTriggers() {
    const keys = Object.keys(state.triggerStats).sort();
    if (!keys.length) {
      $("trigger-list").innerHTML = '<span class="muted">No triggers seen yet.</span>';
      return;
    }
    $("trigger-list").innerHTML = keys.map(key => {
      const t = state.triggerStats[key];
      const delta = t.delta == null ? "" : " Δ" + t.delta + "ms";
      return '<span class="trigger-chip">' + escapeHtml(key) + ' ×' + t.count + delta + '</span>';
    }).join("");
  }

  function renderRuntime() {
    const isNui = window.parent !== window || navigator.userAgent.includes("CitizenFX");
    const lines = [
      ["Environment", isNui ? "FiveM / embedded" : "Browser"],
      ["User agent", navigator.userAgent],
      ["Started", state.firstDataAt ? new Date(state.firstDataAt).toLocaleString() : "Waiting"],
      ["Keys found", Object.keys(state.meta).length],
      ["Events stored", state.events.length],
      ["Focused", state.values.focused ?? "—"],
      ["Pinned", state.values.pinned ?? "—"],
      ["Tabbed", state.values.tabbed ?? "—"],
      ["Hidden", state.values.hidden ?? "—"]
    ];
    $("runtime-info").innerHTML = lines.map(([k,v]) => '<div><strong>' + escapeHtml(k) + ':</strong> ' + escapeHtml(v) + '</div>').join("");
  }

  function captureSnapshot(which) {
    const snap = { capturedAt: nowIso(), values: clone(state.values) };
    if (which === "A") state.snapshotA = snap;
    else state.snapshotB = snap;
    $("snapshot-" + which.toLowerCase() + "-status").textContent = which + ": " + new Date(snap.capturedAt).toLocaleTimeString() + " (" + Object.keys(snap.values).length + " keys)";
    renderDiff();
  }

  function getDiff() {
    if (!state.snapshotA || !state.snapshotB) return [];
    const keys = new Set([...Object.keys(state.snapshotA.values), ...Object.keys(state.snapshotB.values)]);
    return [...keys].sort().map(key => {
      const a = state.snapshotA.values[key];
      const b = state.snapshotB.values[key];
      const aJson = JSON.stringify(a);
      const bJson = JSON.stringify(b);
      if (aJson === bJson) return null;
      const status = !(key in state.snapshotA.values) ? "added" : !(key in state.snapshotB.values) ? "removed" : "changed";
      return { key, status, before: a, after: b };
    }).filter(Boolean);
  }

  function renderDiff() {
    const diff = getDiff();
    if (!state.snapshotA || !state.snapshotB) {
      $("snapshot-diff").innerHTML = '<div class="empty">Capture Snapshot A and Snapshot B to compare game state.</div>';
      return;
    }
    if (!diff.length) {
      $("snapshot-diff").innerHTML = '<div class="empty">No differences between snapshots.</div>';
      return;
    }
    $("snapshot-diff").innerHTML = '<div class="data-row header"><div>Key</div><div>Status</div><div>Before → After</div><div></div><div></div></div>' +
      diff.map(row => '<div class="data-row">' +
        '<div class="key">' + escapeHtml(row.key) + '</div>' +
        '<div><span class="tag ' + (row.status === "changed" ? "tag-known" : "tag-unknown") + '">' + row.status + '</span></div>' +
        '<div class="value">' + escapeHtml(displayValue(row.before)) + '\n→\n' + escapeHtml(displayValue(row.after)) + '</div><div></div><div></div>' +
      '</div>').join("");
  }

  function exportPayload() {
    return {
      app: "Hammy Diagnostics",
      version: "1.0",
      exportedAt: nowIso(),
      session: {
        firstDataAt: state.firstDataAt,
        lastDataAt: state.lastDataAt,
        updateTotal: state.updateTotal,
        uniqueKeys: Object.keys(state.meta).length,
        undocumentedKeys: Object.keys(state.meta).filter(k => state.meta[k].category === "unknown")
      },
      values: state.values,
      metadata: state.meta,
      triggerStats: state.triggerStats,
      snapshotA: state.snapshotA,
      snapshotB: state.snapshotB,
      snapshotDiff: getDiff(),
      events: state.events
    };
  }

  async function copySession() {
    const json = JSON.stringify(exportPayload(), null, 2);
    try {
      await navigator.clipboard.writeText(json);
      $("command-result").textContent = "Diagnostic JSON copied to clipboard.";
    } catch (_) {
      const area = document.createElement("textarea");
      area.value = json;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
      $("command-result").textContent = "Diagnostic JSON copied to clipboard.";
    }
  }

  function downloadSession() {
    const json = JSON.stringify(exportPayload(), null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hammy-diagnostics-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function setupUi() {
    document.querySelectorAll(".tab").forEach(tab => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
        document.querySelectorAll(".panel").forEach(x => x.classList.remove("active"));
        tab.classList.add("active");
        $("panel-" + tab.dataset.tab).classList.add("active");
      });
    });

    $("refresh-data").addEventListener("click", () => send({ type: "getData" }));
    $("pin-app").addEventListener("click", () => send({ type: "pin" }));
    $("live-search").addEventListener("input", renderLive);
    $("live-filter").addEventListener("change", renderLive);
    $("event-search").addEventListener("input", renderEvents);

    $("pause-events").addEventListener("change", (e) => {
      state.paused = e.target.checked;
      if (!state.paused) renderEvents();
    });

    $("clear-live").addEventListener("click", () => {
      state.values = {};
      state.meta = {};
      state.updateTotal = 0;
      renderAll();
    });

    $("clear-events").addEventListener("click", () => {
      state.events = [];
      renderAll();
    });

    $("snapshot-a").addEventListener("click", () => captureSnapshot("A"));
    $("snapshot-b").addEventListener("click", () => captureSnapshot("B"));
    $("clear-snapshots").addEventListener("click", () => {
      state.snapshotA = null;
      state.snapshotB = null;
      $("snapshot-a-status").textContent = "A: not captured";
      $("snapshot-b-status").textContent = "B: not captured";
      renderDiff();
    });

    document.querySelectorAll("[data-command]").forEach(btn => {
      btn.addEventListener("click", () => send({ type: btn.dataset.command }));
    });

    document.querySelectorAll("[data-text-command]").forEach(btn => {
      btn.addEventListener("click", () => send({ type: btn.dataset.textCommand, text: $("message-text").value }));
    });

    $("send-named-data").addEventListener("click", () => {
      const keys = $("named-keys").value.split(",").map(x => x.trim()).filter(Boolean);
      send({ type: "getNamedData", keys });
    });

    $("send-info").addEventListener("click", () => send({
      type: "info",
      text: $("message-text").value,
      time: Math.max(1, Number($("info-time").value) || 5)
    }));

    $("use-player-position").addEventListener("click", () => {
      $("waypoint-x").value = state.values.pos_x ?? "";
      $("waypoint-y").value = state.values.pos_y ?? "";
    });

    $("send-waypoint").addEventListener("click", () => send({
      type: "setWaypoint",
      x: Number($("waypoint-x").value),
      y: Number($("waypoint-y").value)
    }));

    $("send-sfx").addEventListener("click", () => send({ type: "sfx", sfx: Number($("sfx-id").value) }));
    $("share-local").addEventListener("click", () => send({ type: "shareLocalData", key: $("share-key").value, value: $("share-value").value }));
    $("share-server").addEventListener("click", () => send({ type: "shareServerData", key: $("share-key").value, value: $("share-value").value }));
    $("send-console").addEventListener("click", () => send({ type: "sendCommand", command: $("console-command").value }));
    $("send-popup").addEventListener("click", () => send({ type: "popup", title: $("popup-title").value, text: $("popup-text").value }));
    $("copy-session").addEventListener("click", copySession);
    $("download-session").addEventListener("click", downloadSession);

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") send({ type: "pin" });
    });
  }

  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (msg && msg.type === "data" && msg.data && typeof msg.data === "object") {
      processData(msg.data);
    } else if (msg && msg.type === "chat:open") {
      document.body.classList.add("no-blur");
    } else if (msg && msg.type === "chat:close") {
      document.body.classList.remove("no-blur");
    }
  });

  const isNui = window.parent !== window || navigator.userAgent.includes("CitizenFX");
  if (isNui) document.body.classList.add("no-blur");

  setupUi();
  renderAll();
  send({ type: "getData" });

  setTimeout(() => {
    if (!state.lastDataAt) send({ type: "getData" });
  }, 1200);
})();
