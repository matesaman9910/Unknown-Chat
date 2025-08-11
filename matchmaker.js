// matchmaker.js — v7.4 (click-proof, stable clientId, presence gate, lock)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, push, set, onValue, remove, serverTimestamp, runTransaction,
  onDisconnect, get, update
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// ===== Build banner (so you know cache is busted) =====
const BUILD = "matchmaker-7.4-20250811-2126";
console.info("[UC] Loaded", BUILD);

// ===== Firebase =====
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

// ===== Debug overlay (only if enabled via debug-toggle.html or ?debug=1) =====
const DEBUG = localStorage.getItem("uc_debug") === "1" || new URLSearchParams(location.search).get("debug") === "1";
function overlay() {
  let el = document.getElementById("uc-debug");
  if (!el) {
    el = document.createElement("div");
    el.id = "uc-debug";
    el.style.cssText = `
      position:fixed;bottom:10px;right:10px;width:360px;height:240px;
      overflow:auto;background:rgba(0,0,0,.85);color:#0ff;
      font:12px/1.35 monospace;padding:8px;border:1px solid #0d3f80;
      border-radius:10px;z-index:99999;display:block;
    `;
    document.body.appendChild(el);
  }
  return el;
}
function dbg(...args) {
  if (!DEBUG) return;
  const el = overlay();
  const t = new Date().toLocaleTimeString();
  const line = document.createElement("div");
  line.textContent = `[${t}] ${args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")}`;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
  console.log("[UC DEBUG]", ...args);
}
if (DEBUG) { (document.getElementById("uc-debug") || {}).style && (document.getElementById("uc-debug").style.display = "block"); dbg("Overlay ON", BUILD); }

// ===== UI helpers =====
const $ = (s) => document.querySelector(s);
function setStatus(msg, isError=false) {
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
  bar.textContent = msg;
  bar.style.background = isError ? "#2b0b16" : "#041a33";
  bar.style.color      = isError ? "#ffcdd2" : "#9ad1ff";
  dbg("STATUS:", msg);
}

// ===== Stable client identity (one browser = one id) =====
const CLIENT_KEY = "uc_client_id";
const clientId = (() => {
  let v = localStorage.getItem(CLIENT_KEY);
  if (!v) { v = crypto.randomUUID(); localStorage.setItem(CLIENT_KEY, v); }
  return v;
})();
dbg("clientId", clientId);

// Path helpers
const qRef    = (id) => ref(db, `queue/${id}`);
const pRef    = (id) => ref(db, `presence/${id}`);
const locksRef = (k) => ref(db, `locks/${k}`);

// ===== Single-click guard =====
let joining = false;

// ===== Janitors (defense against stale junk) =====
async function janitors() {
  const now = Date.now();
  const qsnap = await get(ref(db, "queue"));    const q = qsnap.val() || {};
  const lsnap = await get(ref(db, "locks"));    const L = lsnap.val() || {};
  for (const [k,v] of Object.entries(q)) if (!v?.hb || now - v.hb > 60000) remove(ref(db, `queue/${k}`));
  for (const [k,v] of Object.entries(L)) if (!v?.at || now - v.at > 120000) remove(ref(db, `locks/${k}`));
}
janitors(); setInterval(janitors, 60000);

// ===== Core: joinQueue (presence-gated + lock) =====
let hbTimer=null, presTimer=null, unsub=null;

async function joinQueue() {
  if (joining) { dbg("JOIN IGNORED: already joining"); return; }
  joining = true;
  dbg("CLICK: start matchmaking");
  setStatus("Joining queue…");

  // Pre-join cleanup for this client (prevents duplicates on second click)
  await remove(qRef(clientId)).catch(()=>{});
  await remove(pRef(clientId)).catch(()=>{});

  // Write queue + presence once
  await set(qRef(clientId), { ts: Date.now(), hb: Date.now(), matched: false });
  await set(pRef(clientId), { hb: Date.now() });
  onDisconnect(qRef(clientId)).remove();
  onDisconnect(pRef(clientId)).remove();
  setStatus("Joined queue. Waiting for a stranger…");
  dbg("queue+presence written");

  // Heartbeats
  hbTimer   = setInterval(()=> update(qRef(clientId), { hb: Date.now() }).catch(()=>{}), 20000);
  presTimer = setInterval(()=> update(pRef(clientId), { hb: Date.now() }).catch(()=>{}), 5000);

  // Watch queue for partner and for our room assignment
  const qRoot = ref(db, "queue");
  unsub = onValue(qRoot, async (snap) => {
    const q = snap.val() || {};
    dbg("queue size", Object.keys(q).length);

    // already matched?
    if (q[clientId]?.roomId) {
      const roomId = q[clientId].roomId;
      dbg("MATCHED →", roomId);
      cleanup();
      location.href = `room.html?room=${roomId}`;
      return;
    }

    // presence snapshot
    const presence = (await get(ref(db, "presence"))).val() || {};
    const now = Date.now();

    // choose a partner who's truly online
    const candidates = Object.keys(q)
      .filter(id => id !== clientId && q[id] && q[id].matched === false)
      .filter(id => (now - (presence[id]?.hb || 0) < 10000) && (now - (q[id]?.hb || 0) < 45000))
      .sort((a,b) => (q[a].ts||0) - (q[b].ts||0));

    dbg("candidates", candidates);
    if (!candidates.length) return;

    const partnerId = candidates[0];
    const lockKey = [clientId, partnerId].sort().join("_");
    const lockTx = await runTransaction(locksRef(lockKey), v => v || ({ by: clientId, at: Date.now() }));
    dbg("lock", { key: lockKey, committed: lockTx.committed });
    if (!lockTx.committed) return;

    onDisconnect(locksRef(lockKey)).remove();

    // Double-check presence still fresh
    const p1 = (await get(pRef(clientId))).val();
    const p2 = (await get(pRef(partnerId))).val();
    const ok1 = p1?.hb && (Date.now() - p1.hb) < 10000;
    const ok2 = p2?.hb && (Date.now() - p2.hb) < 10000;
    if (!ok1 || !ok2) { dbg("presence recheck failed", { ok1, ok2 }); return; }

    // Fresh queue recheck
    const fresh = (await get(qRoot)).val() || {};
    if (!fresh[clientId] || !fresh[partnerId] || fresh[clientId].matched || fresh[partnerId].matched) {
      dbg("fresh recheck failed"); return;
    }

    // Create room + assign atomically to both
    const roomKey = push(ref(db, "rooms")).key;
    await set(ref(db, `rooms/${roomKey}`), { createdAt: serverTimestamp() });
    await update(ref(db), {
      [`queue/${clientId}/matched`]: true,
      [`queue/${clientId}/roomId` ]: roomKey,
      [`queue/${partnerId}/matched`]: true,
      [`queue/${partnerId}/roomId` ]: roomKey
    });
    dbg("room created", roomKey);

    setTimeout(()=> remove(locksRef(lockKey)), 10000);
    cleanup();
    setStatus("Match found. Connecting…");
    location.href = `room.html?room=${roomKey}`;
  });
}

function cleanup() {
  unsub && unsub(); unsub = null;
  clearInterval(hbTimer); hbTimer=null;
  clearInterval(presTimer); presTimer=null;
  joining = false;
}

// ===== Bind click robustly (id OR data attribute) =====
const startBtn = document.getElementById("startBtn") || document.querySelector("[data-start]");
if (startBtn) {
  startBtn.addEventListener("click", (e) => { e.preventDefault(); joinQueue(); }, { once:false });
  dbg("startBtn bound");
} else {
  dbg("WARNING: start button not found (expected #startBtn or [data-start])");
}
