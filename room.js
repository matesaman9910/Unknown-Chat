// room.js — v7 (debug-aware, handshake stable, typing debounce, cleanup, status fade)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, onValue, set, remove, get, update, onDisconnect, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// ---------- Firebase ----------
const cfg = {
  apiKey: "AIzaSyDv484MJ-qo9ae3mM8KhW-xo9nYD1lBSEA",
  authDomain: "the-unknown-chat.firebaseapp.com",
  databaseURL: "https://the-unknown-chat-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "the-unknown-chat",
  storageBucket: "the-unknown-chat.appspot.com",
  messagingSenderId: "208285058331",
  appId: "1:208285058331:web:25aa0f03fbae1371dbbfbe"
};
const app = initializeApp(cfg);
const db  = getDatabase(app);

// ---------- Debug ----------
const qs = new URLSearchParams(location.search);
const DEBUG = qs.get("debug") === "1" || localStorage.getItem("uc_debug") === "1";
function ensureOverlay() {
  let el = document.getElementById("uc-debug");
  if (!el) {
    el = document.createElement("div");
    el.id = "uc-debug";
    el.style.cssText = `
      position:fixed;bottom:10px;right:10px;width:340px;height:220px;
      overflow:auto;background:rgba(0,0,0,.85);color:#00ffff;
      font:12px/1.4 monospace;padding:8px;border:1px solid #0d3f80;
      border-radius:10px;z-index:99999;display:block;
    `;
    document.body.appendChild(el);
  }
  return el;
}
function dbg(...args) {
  if (!DEBUG) return;
  const el = ensureOverlay();
  const line = document.createElement("div");
  const t = new Date().toLocaleTimeString();
  line.textContent = `[${t}] ${args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")}`;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
  console.log("[UC DEBUG]", ...args);
}
if (DEBUG) {
  const existing = document.getElementById("uc-debug");
  if (existing) existing.style.display = "block";
  dbg("Room debug overlay active.");
}

// ---------- Safe DOM + status ----------
const pick = (...sels) => sels.map(s => document.querySelector(s)).find(Boolean) || null;
function ensureStatusBar() {
  let bar = document.getElementById("statusBar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "statusBar";
    bar.style.cssText =
      "position:fixed;top:12px;left:50%;transform:translateX(-50%);" +
      "background:#041a33;color:#9ad1ff;padding:8px 14px;border:1px solid #0d3f80;" +
      "border-radius:10px;font:14px/1.2 monospace;z-index:9999";
    document.body.prepend(bar);
  }
  return bar;
}
function setStatus(msg, isError=false) {
  const bar = ensureStatusBar();
  bar.style.display = "block";
  bar.textContent = msg;
  bar.style.background = isError ? "#2b0b16" : "#041a33";
  bar.style.color      = isError ? "#ffcdd2" : "#9ad1ff";
  dbg("STATUS:", msg);
}
function hideStatusAfter(ms=2500) {
  setTimeout(() => {
    const bar = document.getElementById("statusBar");
    if (bar) bar.style.display = "none";
  }, ms);
}

// ---------- UI elements (supports both id variants) ----------
const messagesEl = pick("#messages", ".messages");
const inputEl    = pick("#messageInput", "#message-input");
const sendBtn    = pick("#sendButton", "#send-btn");
const leaveBtn   = pick("#leaveBtn", "#leave-btn");
const typingEl   = pick("#typingIndicator", "#typing-indicator");

// ---------- Room / presence ----------
const roomId   = qs.get("room");
const playerId = sessionStorage.getItem("playerId") || `p_${Math.random().toString(36).slice(2,9)}`;
sessionStorage.setItem("playerId", playerId);
if (!roomId) { setStatus("Missing room id. Returning to lobby…", true); setTimeout(()=>location.href="index.html", 1200); throw new Error("no room"); }

dbg("Init", { roomId, playerId });

const playersRef  = ref(db, `rooms/${roomId}/players`);
const myPlayerRef = ref(db, `rooms/${roomId}/players/${playerId}`);
const msgsRef     = ref(db, `rooms/${roomId}/messages`);
const typingRef   = ref(db, `rooms/${roomId}/typing`);

// Join + presence + heartbeat
await set(myPlayerRef, { ready: true, hb: Date.now(), joinedAt: serverTimestamp() });
onDisconnect(myPlayerRef).remove();
setStatus("Waiting for other player…");

const hbTimer = setInterval(() => { update(myPlayerRef, { hb: Date.now() }).catch(()=>{}); }, 20000);

// Handshake + ghost prune + cleanup
let hadPeer = false;
let requeueTimer = null;

onValue(playersRef, async (snap) => {
  const now = Date.now();
  const raw = snap.val() || {};

  // Ghost prune (>60s without hb)
  for (const [id, p] of Object.entries(raw)) {
    if (!p || !p.hb || (now - p.hb) > 60000) {
      dbg("Prune ghost:", id);
      await remove(ref(db, `rooms/${roomId}/players/${id}`)).catch(()=>{});
      delete raw[id];
    }
  }

  const total = Object.keys(raw).length;
  const readyCount = Object.values(raw).filter(p => p && p.ready).length;

  dbg("Players snapshot:", { total, readyCount, ids: Object.keys(raw) });

  if (readyCount >= 2) {
    hadPeer = true;
    if (requeueTimer) { clearInterval(requeueTimer); requeueTimer = null; }
    setStatus("Connected to stranger!");
    hideStatusAfter(2500);
  } else {
    await remove(msgsRef).catch(()=>{});
    if (hadPeer && !requeueTimer) {
      let left = 5;
      systemMsg("Player disconnected — re-queueing in 5s…");
      setStatus(`Player disconnected — re-queueing in ${left}s…`);
      requeueTimer = setInterval(async () => {
        left -= 1;
        setStatus(`Player disconnected — re-queueing in ${left}s…`);
        if (left <= 0) {
          clearInterval(requeueTimer); requeueTimer = null;
          await remove(myPlayerRef).catch(()=>{});
          const leftover = await get(playersRef);
          const anyLeft = leftover.exists() && Object.keys(leftover.val()||{}).length > 0;
          if (!anyLeft) await remove(ref(db, `rooms/${roomId}`)).catch(()=>{});
          location.href = "index.html?requeue=1";
        }
      }, 1000);
    } else {
      setStatus("Waiting for other player…");
    }
  }

  if (total === 0) {
    dbg("No players remain → delete room");
    await remove(ref(db, `rooms/${roomId}`)).catch(()=>{});
  }
});

// 30s timeout if nobody joins
setTimeout(async () => {
  const snap = await get(playersRef);
  const readyCount = Object.values(snap.val() || {}).filter(p => p && p.ready).length;
  dbg("Timeout check → readyCount:", readyCount);
  if (readyCount < 2 && !hadPeer) {
    setStatus("No one joined. Returning to queue…", true);
    await remove(myPlayerRef).catch(()=>{});
    await remove(msgsRef).catch(()=>{});
    const leftover = await get(playersRef);
    if (!leftover.exists() || Object.keys(leftover.val()||{}).length === 0) {
      await remove(ref(db, `rooms/${roomId}`)).catch(()=>{});
    }
    location.href = "index.html?requeue=1";
  }
}, 30000);

// ---------- Typing indicator (debounced + auto-clear) ----------
const typingMineRef = ref(db, `rooms/${roomId}/typing/${playerId}`);
onDisconnect(typingMineRef).remove();

function markTyping(active) {
  if (active) set(typingMineRef, { t: Date.now() }).catch(()=>{});
  else        remove(typingMineRef).catch(()=>{});
}
if (inputEl) {
  let lastVal = "";
  let typeTimer = null;
  inputEl.addEventListener("input", () => {
    const v = inputEl.value;
    if (v !== lastVal) {
      lastVal = v;
      if (v.trim().length > 0) markTyping(true);
      clearTimeout(typeTimer);
      typeTimer = setTimeout(() => markTyping(false), 1500);
    }
  });
  inputEl.addEventListener("blur", () => markTyping(false));
}
onValue(typingRef, (snap) => {
  const all = snap.val() || {};
  const now = Date.now();
  const someoneElse = Object.entries(all).some(([uid, obj]) =>
    uid !== playerId && obj && obj.t && (now - obj.t) < 2000
  );
  if (typingEl) typingEl.textContent = someoneElse ? "Stranger is typing..." : "";
});

// ---------- Messaging ----------
if (sendBtn && inputEl && messagesEl) {
  sendBtn.addEventListener("click", sendMessage);
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  onValue(msgsRef, (snap) => {
    const msgs = snap.val() || {};
    messagesEl.innerHTML = "";
    Object.values(msgs).forEach(m => {
      const div = document.createElement("div");
      div.className = "msg " + (m.sender === playerId ? "you" : "other");
      div.textContent = m.text;
      messagesEl.appendChild(div);
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
    dbg("Messages changed. Count =", Object.keys(msgs).length);
  });
}

function sendMessage() {
  const text = (inputEl?.value || "").trim();
  if (!text) return;
  const id = `${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
  set(ref(db, `rooms/${roomId}/messages/${id}`), { sender: playerId, text, ts: serverTimestamp() });
  markTyping(false);
  dbg("Send:", text);
  inputEl.value = "";
}

function systemMsg(text) {
  if (!messagesEl) { setStatus(text); return; }
  const div = document.createElement("div");
  div.className = "msg system";
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ---------- Leave / cleanup ----------
if (leaveBtn) {
  leaveBtn.addEventListener("click", async () => {
    dbg("Leave clicked");
    await remove(myPlayerRef).catch(()=>{});
    const leftover = await get(playersRef);
    if (!leftover.exists() || Object.keys(leftover.val()||{}).length === 0) {
      await remove(ref(db, `rooms/${roomId}`)).catch(()=>{});
    } else {
      await remove(msgsRef).catch(()=>{});
    }
    location.href = "index.html";
  });
}

window.addEventListener("beforeunload", async () => {
  clearInterval(hbTimer);
  await remove(myPlayerRef).catch(()=>{});
  const leftover = await get(playersRef);
  if (!leftover.exists() || Object.keys(leftover.val()||{}).length === 0) {
    await remove(ref(db, `rooms/${roomId}`)).catch(()=>{});
  } else {
    await remove(msgsRef).catch(()=>{});
  }
  dbg("beforeunload cleanup done");
});
