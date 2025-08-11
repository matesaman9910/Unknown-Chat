// matchmaker.js — v7.2 presence-gated
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, push, set, onValue, remove, serverTimestamp, runTransaction,
  onDisconnect, get, update
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// === Version
const BUILD = "matchmaker-7.2-20250811-2109";

// === Firebase config
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

// === Debug overlay (only if enabled)
const DEBUG = localStorage.getItem("uc_debug") === "1";
function ensureOverlay() {
  let el = document.getElementById("uc-debug");
  if (!el) {
    el = document.createElement("div");
    el.id = "uc-debug";
    el.style.cssText = `
      position:fixed;bottom:10px;right:10px;width:360px;height:240px;
      overflow:auto;background:rgba(0,0,0,.85);color:#0ff;
      font:12px monospace;padding:8px;border:1px solid #0d3f80;
      border-radius:10px;z-index:99999;
    `;
    document.body.appendChild(el);
  }
  return el;
}
function dbg(...args) {
  if (!DEBUG) return;
  const el = ensureOverlay();
  const t = new Date().toLocaleTimeString();
  const line = document.createElement("div");
  line.textContent = `[${t}] ${args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" ")}`;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
  console.log("[DEBUG]", ...args);
}

// === UI
function setStatus(msg) {
  let bar = document.getElementById("statusBar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "statusBar";
    document.body.prepend(bar);
  }
  bar.textContent = msg;
  dbg("STATUS:", msg);
}

// === Janitors
function runJanitors() {
  const now = Date.now();
  // queue cleanup
  get(ref(db, "queue")).then(snap => {
    (snap.val() || {}).forEach?.(([k,v]) => {
      if (!v.hb || now - v.hb > 60000) remove(ref(db, `queue/${k}`));
    });
  });
  // lock cleanup
  get(ref(db, "locks")).then(snap => {
    Object.entries(snap.val() || {}).forEach(([k,v]) => {
      if (!v.at || now - v.at > 120000) remove(ref(db, `locks/${k}`));
    });
  });
}
setInterval(runJanitors, 60000);

// === Matchmaking with presence
let myId, myQueueRef, myPresenceRef, unsub, heartbeat, presenceBeat;

async function joinQueue() {
  myId = crypto.randomUUID();
  myQueueRef    = ref(db, `queue/${myId}`);
  myPresenceRef = ref(db, `presence/${myId}`);

  await set(myQueueRef, { ts: Date.now(), hb: Date.now(), matched: false });
  await set(myPresenceRef, { hb: Date.now() });
  onDisconnect(myQueueRef).remove();
  onDisconnect(myPresenceRef).remove();

  heartbeat    = setInterval(() => update(myQueueRef, { hb: Date.now() }), 20000);
  presenceBeat = setInterval(() => update(myPresenceRef, { hb: Date.now() }), 5000);

  unsub = onValue(ref(db, "queue"), async snap => {
    const q = snap.val() || {};
    if (q[myId]?.roomId) {
      const r = q[myId].roomId;
      dbg("Matched → room", r);
      unsub && unsub(); clearInterval(heartbeat); clearInterval(presenceBeat);
      location.href = `room.html?room=${r}`;
      return;
    }

    const now = Date.now();
    const presence = (await get(ref(db, "presence"))).val() || {};
    const candidates = Object.keys(q)
      .filter(id => id !== myId && !q[id].matched)
      .filter(id => (now - (presence[id]?.hb || 0) < 10000) && (now - (q[id]?.hb || 0) < 45000))
      .sort((a,b) => q[a].ts - q[b].ts);

    if (!candidates.length) return;
    const partnerId = candidates[0];
    const lockKey = [myId, partnerId].sort().join("_");
    const lockRef = ref(db, `locks/${lockKey}`);
    const tx = await runTransaction(lockRef, val => val || { by: myId, at: Date.now() });
    if (!tx.committed) return;
    onDisconnect(lockRef).remove();

    // double presence check
    const p1 = (await get(ref(db, `presence/${myId}`))).val();
    const p2 = (await get(ref(db, `presence/${partnerId}`))).val();
    if (!p1 || !p2 || Date.now()-p1.hb > 10000 || Date.now()-p2.hb > 10000) return;

    const roomKey = push(ref(db, "rooms")).key;
    await set(ref(db, `rooms/${roomKey}`), { createdAt: serverTimestamp() });
    await update(ref(db, `queue/${myId}`),      { matched: true, roomId: roomKey });
    await update(ref(db, `queue/${partnerId}`), { matched: true, roomId: roomKey });

    setTimeout(() => remove(lockRef), 10000);
    unsub && unsub(); clearInterval(heartbeat); clearInterval(presenceBeat);
    location.href = `room.html?room=${roomKey}`;
  });
}

document.getElementById("startBtn")?.addEventListener("click", joinQueue);
