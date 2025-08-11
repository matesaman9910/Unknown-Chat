
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, push, set, onValue, remove, serverTimestamp, runTransaction, onDisconnect, get, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

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
const db = getDatabase(app);

const $ = (sel) => document.querySelector(sel);
function setBar(msg, err=false){
  let bar = $("#statusBar");
  if(!bar){ bar = document.createElement("div"); bar.id="statusBar"; document.body.prepend(bar); }
  bar.style.display = "block";
  bar.textContent = msg;
  bar.classList.toggle("error", !!err);
}

const startBtn = $("#startBtn");
const howBtn = $("#howBtn");
const closeHow = $("#closeHow");
const statusEl = $("#status");
const errorEl = $("#error");
howBtn?.addEventListener("click", ()=> document.querySelector("#howModal").style.display="flex");
closeHow?.addEventListener("click", ()=> document.querySelector("#howModal").style.display="none");
document.addEventListener("keydown", (e)=>{ if(e.key==="Escape") document.querySelector("#howModal").style.display="none"; });

let myId = null;
let myRef = null;
let unsub = null;
let heartbeat = null;

async function joinQueue(){
  try{
    if (startBtn) startBtn.disabled = true;
    if (statusEl) statusEl.style.display = "block";
    setBar("Joined queue. Waiting for a stranger…");

    myId = crypto.randomUUID();
    myRef = ref(db, `queue/${myId}`);
    await set(myRef, { ts: Date.now(), matched: false, hb: Date.now() });
    onDisconnect(myRef).remove();

    // Heartbeat (every 20s)
    heartbeat = setInterval(()=> set(myRef, { ts: Date.now(), matched: false, hb: Date.now() }), 20000);

    // Sweep stale stuff on load and every minute
    const sweep = ()=> cleanStale();
    sweep(); setInterval(sweep, 60000);

    const qRef = ref(db, "queue");
    unsub = onValue(qRef, async (snap) => {
      const q = snap.val() || {};

      if (q[myId]?.roomId){
        unsub && unsub();
        clearInterval(heartbeat);
        setBar("Match found. Connecting…");
        window.location.href = `room.html?room=${q[myId].roomId}`;
        return;
      }

      // candidates: unmatched and fresh heartbeat (< 45s)
      const now = Date.now();
      const candidates = Object.keys(q).filter(id => id !== myId && q[id] && q[id].matched===false && (now - (q[id].hb||0) < 45000))
        .sort((a,b) => (q[a].ts||0) - (q[b].ts||0));
      if (candidates.length === 0) return;

      const partnerId = candidates[0];

      const lockKey = [myId, partnerId].sort().join("_");
      const lockRef = ref(db, `locks/${lockKey}`);
      const tx = await runTransaction(lockRef, val => val || { by: myId, at: Date.now() });
      if (!tx.committed) return;

      const fresh = (await get(qRef)).val() || {};
      if (!fresh[myId] || !fresh[partnerId] || fresh[myId].matched || fresh[partnerId].matched) return;

      const roomKey = push(ref(db, "rooms")).key;
      await set(ref(db, `rooms/${roomKey}`), { createdAt: serverTimestamp(), state: "open" });
      await update(ref(db, `queue/${myId}`), { matched: true, roomId: roomKey });
      await update(ref(db, `queue/${partnerId}`), { matched: true, roomId: roomKey });

      setTimeout(() => remove(lockRef), 10000);

      unsub && unsub();
      clearInterval(heartbeat);
      setBar("Match found. Connecting…");
      window.location.href = `room.html?room=${roomKey}`;
    });
  }catch(err){
    console.error(err);
    setBar("Matchmaking failed.", true);
    if (errorEl) errorEl.style.display = "block";
    if (startBtn) startBtn.disabled = false;
    clearInterval(heartbeat);
  }
}

function cleanStale(){
  const now = Date.now();
  // Queue stale: hb older than 60s
  onValue(ref(db, "queue"), (snap)=> {
    const q = snap.val() || {};
    for (const [id, v] of Object.entries(q)){
      if (!v || !v.hb) { remove(ref(db, `queue/${id}`)); continue; }
      if (now - v.hb > 60000) remove(ref(db, `queue/${id}`));
    }
  }, { onlyOnce: true });

  // Rooms: delete if no users or only 1 user and older than 3 min
  onValue(ref(db, "rooms"), (snap)=> {
    const rooms = snap.val() || {};
    for (const [rk, rv] of Object.entries(rooms)){
      const users = rv && rv.users ? Object.keys(rv.users) : [];
      if (users.length === 0) remove(ref(db, `rooms/${rk}`));
    }
  }, { onlyOnce: true });
}

// Auto-queue if coming from requeue
const url = new URL(location.href);
if (url.searchParams.get("requeue") === "1") joinQueue();
startBtn?.addEventListener("click", joinQueue);
