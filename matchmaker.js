// matchmaker.js — v7 (debug-aware, lock cleanup, heartbeats, safe statuses)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, push, set, onValue, remove, serverTimestamp, runTransaction,
  onDisconnect, get, update
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

// ---------- Debug (overlay only when enabled) ----------
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
  dbg("Matchmaker debug overlay active.");
}

// ---------- UI helpers ----------
const $ = (s) => document.querySelector(s);
function ensureStatusBar() {
  let bar = $("#statusBar");
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
  bar.textContent = msg;
  bar.style.background = isError ? "#2b0b16" : "#041a33";
  bar.style.color      = isError ? "#ffcdd2" : "#9ad1ff";
  dbg("STATUS:", msg);
}

// ---------- Elements ----------
const startBtn = $("#startBtn");
const statusEl = $("#status");
const howBtn   = $("#howBtn");
const closeHow = $("#closeHow");

// modal hooks (if present)
howBtn?.addEventListener("click", ()=> { const m=$("#howModal"); if(m) m.style.display="flex"; });
closeHow?.addEventListener("click", ()=> { const m=$("#howModal"); if(m) m.style.display="none"; });
document.addEventListener("keydown", (e)=>{ if(e.key==="Escape"){ const m=$("#howModal"); if(m) m.style.display="none"; }});

let myId = null;
let myRef = null;
let unsub = null;
let heartbeat = null;

// ---------- Janitors ----------
function cleanQueue() {
  const now = Date.now();
  onValue(ref(db, "queue"), (snap) => {
    const q = snap.val() || {};
    for (const [k,v] of Object.entries(q)) {
      if (!v || !v.hb || (now - v.hb) > 60000) {
        dbg("Prune queue stale:", k);
        remove(ref(db, `queue/${k}`));
      }
    }
  }, { onlyOnce: true });
}
function cleanEmptyRooms() {
  onValue(ref(db,"rooms"), (snap)=>{
    const rooms = snap.val() || {};
    for (const [rk, rv] of Object.entries(rooms)) {
      const users = rv && rv.users ? Object.keys(rv.users) : [];
      if (users.length === 0) {
        dbg("Prune empty room:", rk);
        remove(ref(db, `rooms/${rk}`));
      }
    }
  }, { onlyOnce: true });
}
function cleanLocks() {
  const now = Date.now();
  onValue(ref(db,"locks"), (snap)=>{
    const locks = snap.val() || {};
    for (const [k,v] of Object.entries(locks)) {
      if (!v || !v.at || (now - v.at) > 120000) {
        dbg("Prune old lock:", k);
        remove(ref(db, `locks/${k}`));
      }
    }
  }, { onlyOnce: true });
}

// run janitors immediately and periodically
function runJanitors() { cleanQueue(); cleanEmptyRooms(); cleanLocks(); }
runJanitors();
setInterval(runJanitors, 60000);

// ---------- Queue join ----------
async function joinQueue() {
  try {
    startBtn && (startBtn.disabled = true);
    statusEl && (statusEl.style.display = "block");
    setStatus("Joined queue. Waiting for a stranger…");

    myId = crypto.randomUUID();
    myRef = ref(db, `queue/${myId}`);
    await set(myRef, { ts: Date.now(), hb: Date.now(), matched: false });
    onDisconnect(myRef).remove();

    heartbeat = setInterval(()=> update(myRef, { hb: Date.now() }).catch(()=>{}), 20000);

    const qRef = ref(db, "queue");
    unsub = onValue(qRef, async (snap) => {
      const q = snap.val() || {};

      // got assigned a room?
      if (q[myId]?.roomId) {
        dbg("Matched → room", q[myId].roomId);
        unsub && unsub(); clearInterval(heartbeat);
        setStatus("Match found. Connecting…");
        window.location.href = `room.html?room=${q[myId].roomId}`;
        return;
      }

      // find fresh partner (<45s since last hb)
      const now = Date.now();
      const candidates = Object.keys(q)
        .filter(id => id !== myId && q[id] && q[id].matched === false && (now - (q[id].hb||0) < 45000))
        .sort((a,b) => (q[a].ts||0) - (q[b].ts||0));
      if (candidates.length === 0) return;

      const partnerId = candidates[0];
      const lockKey = [myId, partnerId].sort().join("_");
      const lockRef = ref(db, `locks/${lockKey}`);

      // acquire lock
      const tx = await runTransaction(lockRef, val => val || ({ by: myId, at: Date.now() }));
      if (!tx.committed) { dbg("Lock busy:", lockKey); return; }

      // ensure lock dies if we disconnect
      onDisconnect(lockRef).remove();

      // re-read fresh queue
      const fresh = (await get(qRef)).val() || {};
      if (!fresh[myId] || !fresh[partnerId] || fresh[myId].matched || fresh[partnerId].matched) return;

      // create room + mark users
      const roomKey = push(ref(db, "rooms")).key;
      await set(ref(db, `rooms/${roomKey}`), { createdAt: serverTimestamp() });
      await update(ref(db, `queue/${myId}`),      { matched: true, roomId: roomKey, hb: Date.now() });
      await update(ref(db, `queue/${partnerId}`), { matched: true, roomId: roomKey, hb: Date.now() });

      // backstop: auto-remove lock after 10s anyway
      setTimeout(() => remove(lockRef), 10000);

      unsub && unsub(); clearInterval(heartbeat);
      setStatus("Match found. Connecting…");
      window.location.href = `room.html?room=${roomKey}`;
    });

  } catch (e) {
    console.error(e);
    dbg("joinQueue error:", e.message || e);
    setStatus("Matchmaking failed.", true);
    startBtn && (startBtn.disabled = false);
  }
}

// auto-join if coming from requeue
const url = new URL(location.href);
if (url.searchParams.get("requeue") === "1") joinQueue();

// button hook
startBtn?.addEventListener("click", joinQueue);
