// room.js — v6.4 DEBUG + connectivity watchdog + ghost prune
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, onValue, set, remove, get, onDisconnect, serverTimestamp, update
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// ----- CONFIG -----
const cfg = {
  apiKey: "AIzaSyDv484MJ-qo9ae3mM8KhW-xo9nYD1lBSEA",
  authDomain: "the-unknown-chat.firebaseapp.com",
  databaseURL: "https://the-unknown-chat-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "the-unknown-chat",
  storageBucket: "the-unknown-chat.appspot.com",
  messagingSenderId: "208285058331",
  appId: "1:208285058331:web:25aa0f03fbae1371dbbfbe"
};

// ----- APP/DB -----
const app = initializeApp(cfg);
const db  = getDatabase(app);

// ----- UTIL / DEBUG -----
const qs = new URLSearchParams(location.search);
const DEBUG = qs.get("debug") === "1";

const pad = n => (n<10?"0":"")+n;
function ts() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${(d.getMilliseconds()+"").padStart(3,"0")}`;
}
function log(...args){ console.log(`[room ${ts()}]`, ...args); }
function warn(...args){ console.warn(`[room ${ts()}]`, ...args); }
function err(...args){ console.error(`[room ${ts()}]`, ...args); }

let overlay;
function dbg(msg){
  if (!DEBUG) return;
  if (!overlay){
    overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;right:8px;bottom:8px;max-width:40vw;max-height:45vh;overflow:auto;background:#061226;color:#9ad1ff;border:1px solid #0d3f80;padding:8px 10px;border-radius:10px;font:12px/1.4 monospace;z-index:99999;opacity:.95";
    document.body.appendChild(overlay);
  }
  const line = document.createElement("div");
  line.textContent = `[${ts()}] ${msg}`;
  overlay.appendChild(line);
  overlay.scrollTop = overlay.scrollHeight;
}
function setStatus(msg, isError=false){
  let bar = document.getElementById("statusBar");
  if (!bar){
    bar = document.createElement("div");
    bar.id = "statusBar";
    bar.style.cssText = "position:fixed;top:12px;left:50%;transform:translateX(-50%);background:#041a33;color:#9ad1ff;padding:8px 14px;border:1px solid #0d3f80;border-radius:10px;font:14px/1.2 monospace;z-index:9999";
    document.body.prepend(bar);
  }
  bar.textContent = msg;
  bar.style.background = isError ? "#2b0b16" : "#041a33";
  bar.style.color      = isError ? "#ffcdd2" : "#9ad1ff";
  dbg(`STATUS: ${msg}`);
}

// tolerant selectors
const pick = (...sels) => sels.map(s => document.querySelector(s)).find(Boolean) || null;
const messagesEl = pick("#messages", ".messages");
const inputEl    = pick("#message-input", "#messageInput");
const sendBtn    = pick("#send-btn", "#sendButton");
const leaveBtn   = pick("#leave-btn", "#leaveBtn");

// ----- ROOM / PLAYER -----
const roomId   = qs.get("room");
const playerId = sessionStorage.getItem("playerId") || `p_${Math.random().toString(36).slice(2,9)}`;
sessionStorage.setItem("playerId", playerId);

const playersRef  = ref(db, `rooms/${roomId}/players`);
const myPlayerRef = ref(db, `rooms/${roomId}/players/${playerId}`);
const msgsRef     = ref(db, `rooms/${roomId}/messages`);
const connectedRef = ref(db, ".info/connected");

setStatus("Connecting to Firebase…");
dbg(`roomId=${roomId} playerId=${playerId}`);
log("init", { roomId, playerId });

// Firebase connection state
onValue(connectedRef, (snap) => {
  const isConnected = !!snap.val();
  dbg(`/.info/connected = ${isConnected}`);
  if (isConnected) setStatus("Joined room… setting presence");
});

// Join: write full record with ready + heartbeat
const joinAt = Date.now();
await set(myPlayerRef, { ready:true, joinedAt: serverTimestamp(), hb: Date.now() });
onDisconnect(myPlayerRef).remove();
setStatus("Waiting for other player…");
dbg("Wrote presence → ready:true + hb");

// Heartbeat every 20s
const hbTimer = setInterval(() => {
  update(myPlayerRef, { hb: Date.now() }).catch(()=>{});
}, 20000);

// Presence + handshake + ghost prune
let hadPeer = false;
let requeueTimer = null;

onValue(playersRef, async (snap) => {
  const raw = snap.val() || {};
  const now = Date.now();
  // prune ghosts (>60s without heartbeat)
  for (const [id, p] of Object.entries(raw)){
    if (!p || !p.hb || (now - p.hb) > 60000){
      warn("prune ghost", id, p);
      await remove(ref(db, `rooms/${roomId}/players/${id}`));
      delete raw[id];
    }
  }

  const players = raw;
  const readyCount = Object.values(players).filter(p => p && p.ready).length;
  const totalCount = Object.keys(players).length;

  dbg(`players snapshot: total=${totalCount} ready=${readyCount} keys=[${Object.keys(players).join(", ")}]`);

  if (readyCount >= 2) {
    hadPeer = true;
    if (requeueTimer) { clearInterval(requeueTimer); requeueTimer = null; }
    setStatus("Connected to stranger!");
  } else {
    // As soon as we’re alone → clear messages (no history)
    await remove(msgsRef).catch(()=>{});
    if (hadPeer && !requeueTimer) {
      // peer dropped after being connected
      let left = 5;
      systemMsg("Player disconnected — re-queueing in 5s…");
      setStatus(`Player disconnected — re-queueing in ${left}s…`);
      requeueTimer = setInterval(async () => {
        left -= 1;
        setStatus(`Player disconnected — re-queueing in ${left}s…`);
        if (left <= 0) {
          clearInterval(requeueTimer); requeueTimer = null;
          await remove(myPlayerRef).catch(()=>{});
          const leftSnap = await get(playersRef);
          const anyLeft = leftSnap.exists() && Object.keys(leftSnap.val()||{}).length > 0;
          if (!anyLeft) await remove(ref(db, `rooms/${roomId}`)).catch(()=>{});
          location.href = "index.html";
        }
      }, 1000);
    } else {
      setStatus("Waiting for other player…");
    }
  }

  if (totalCount === 0) {
    dbg("No players left → delete room");
    await remove(ref(db, `rooms/${roomId}`)).catch(()=>{});
  }
});

// 30s safety timeout if partner never appears
setTimeout(async () => {
  const snap = await get(playersRef);
  const players = snap.val() || {};
  const readyCount = Object.values(players).filter(p => p && p.ready).length;
  dbg(`timeout check: ready=${readyCount}`);
  if (readyCount < 2 && !hadPeer) {
    setStatus("No one joined. Returning to queue…", true);
    await remove(myPlayerRef).catch(()=>{});
    await remove(msgsRef).catch(()=>{});
    const leftSnap = await get(playersRef);
    if (!leftSnap.exists() || Object.keys(leftSnap.val()||{}).length === 0) {
      await remove(ref(db, `rooms/${roomId}`)).catch(()=>{});
    }
    location.href = "index.html";
  }
}, 30000);

// Messaging (safe bindings)
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
  });
}

function sendMessage() {
  const text = (inputEl?.value || "").trim();
  if (!text) return;
  const entry = ref(db, `rooms/${roomId}/messages/${Date.now()}_${Math.random().toString(36).slice(2,6)}`);
  set(entry, { sender: playerId, text, ts: serverTimestamp() });
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

// Leave button
if (leaveBtn) {
  leaveBtn.addEventListener("click", async () => {
    await remove(myPlayerRef).catch(()=>{});
    const leftSnap = await get(playersRef);
    if (!leftSnap.exists() || Object.keys(leftSnap.val()||{}).length === 0) {
      await remove(ref(db, `rooms/${roomId}`)).catch(()=>{});
    } else {
      await remove(msgsRef).catch(()=>{});
    }
    location.href = "index.html";
  });
}

// Cleanup on tab close (best effort)
window.addEventListener("beforeunload", async () => {
  clearInterval(hbTimer);
  await remove(myPlayerRef).catch(()=>{});
  const leftSnap = await get(playersRef);
  if (!leftSnap.exists() || Object.keys(leftSnap.val()||{}).length === 0) {
    await remove(ref(db, `rooms/${roomId}`)).catch(()=>{});
  } else {
    await remove(msgsRef).catch(()=>{});
  }
});
