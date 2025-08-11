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
function setStatus(msg, err=false){
  let bar = $("#statusBar");
  if(!bar){ bar = document.createElement("div"); bar.id="statusBar"; document.body.prepend(bar); }
  bar.style.display = "block";
  bar.textContent = msg;
  bar.classList.toggle("error", !!err);
}
function modal(id, show){ const m = document.querySelector(id); if(m) m.style.display = show ? "flex" : "none"; }

const startBtn = $("#startBtn");
const howBtn = $("#howBtn");
const closeHow = $("#closeHow");
const statusEl = $("#status");
const errorEl = $("#error");
howBtn?.addEventListener("click", ()=> modal("#howModal", true));
closeHow?.addEventListener("click", ()=> modal("#howModal", false));
document.addEventListener("keydown", (e)=>{ if(e.key==="Escape") modal("#howModal", false); });

let myId = null;
let unsub = null;
let myRef = null;

async function joinQueue(){
  try{
    startBtn && (startBtn.disabled = true);
    statusEl && (statusEl.style.display = "block");
    setStatus("Joining queue…");

    myId = crypto.randomUUID();
    myRef = ref(db, `queue/${myId}`);
    await set(myRef, { ts: Date.now(), matched: false });
    onDisconnect(myRef).remove();

    cleanStale();

    const qRef = ref(db, "queue");
    unsub = onValue(qRef, async (snap) => {
      const q = snap.val() || {};

      if (q[myId]?.roomId){
        unsub && unsub();
        window.location.href = `room.html?room=${q[myId].roomId}`;
        return;
      }

      const candidates = Object.keys(q).filter(id => id !== myId && q[id] && q[id].matched === false)
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
      await set(ref(db, `rooms/${roomKey}`), { createdAt: serverTimestamp() });
      await update(ref(db, `queue/${myId}`), { matched: true, roomId: roomKey });
      await update(ref(db, `queue/${partnerId}`), { matched: true, roomId: roomKey });

      setTimeout(() => remove(lockRef), 10000);

      unsub && unsub();
      window.location.href = `room.html?room=${roomKey}`;
    });
  }catch(err){
    console.error(err);
    setStatus("Matchmaking failed.", true);
    errorEl && (errorEl.style.display = "block");
    startBtn && (startBtn.disabled = false);
  }
}

function cleanStale(){
  const now = Date.now();
  onValue(ref(db,"queue"), (snap) => {
    const q = snap.val() || {};
    for (const [k,v] of Object.entries(q)){
      if (!v || !v.ts) continue;
      if (now - v.ts > 3*60*1000) remove(ref(db, `queue/${k}`));
    }
  }, { onlyOnce: true });

  onValue(ref(db,"rooms"), (snap) => {
    const rooms = snap.val() || {};
    for (const [rk, rv] of Object.entries(rooms)){
      const users = (rv && rv.users) ? Object.keys(rv.users) : [];
      if (users.length === 0) remove(ref(db, `rooms/${rk}`));
    }
  }, { onlyOnce: true });
}

const url = new URL(location.href);
if (url.searchParams.get("requeue") === "1"){
  joinQueue();
}

startBtn?.addEventListener("click", joinQueue);
