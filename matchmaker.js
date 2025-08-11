
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

// Helpers
const $ = (sel) => document.querySelector(sel);
function ensure(el, id){
  if (!el){
    // attempt to create a statusBar if missing
    if (id === "statusBar"){
      const b = document.createElement("div");
      b.id = "statusBar";
      b.style.display = "none";
      b.textContent = "";
      document.body.appendChild(b);
      return b;
    }
    throw new Error("Missing element: " + id);
  }
  return el;
}
function setStatus(msg, err=false){
  const bar = ensure($("#statusBar"), "statusBar");
  bar.style.display = "block";
  bar.textContent = msg;
  bar.classList.toggle("error", !!err);
}

const startBtn = $("#startBtn");
const statusEl = $("#status");
const errorEl = $("#error");

let myId = null;
let myRef = null;

startBtn?.addEventListener("click", async () => {
  try{
    startBtn.disabled = true;
    if (statusEl) statusEl.style.display = "block";
    setStatus("Joining queue…");

    myId = crypto.randomUUID();
    myRef = ref(db, `queue/${myId}`);
    await set(myRef, { ts: Date.now(), matched: false });
    onDisconnect(myRef).remove();

    const qRef = ref(db, "queue");
    const unsub = onValue(qRef, async (snap) => {
      const q = snap.val() || {};

      // if I was matched elsewhere
      if (q[myId]?.roomId){
        unsub();
        window.location.href = `room.html?room=${q[myId].roomId}`;
        return;
      }

      const candidates = Object.keys(q).filter(id => id !== myId && q[id] && q[id].matched === false)
        .sort((a,b) => (q[a].ts||0) - (q[b].ts||0));
      if (candidates.length === 0) return;

      const partnerId = candidates[0];

      // Lock
      const lockKey = [myId, partnerId].sort().join("_");
      const lockRef = ref(db, `locks/${lockKey}`);
      const tx = await runTransaction(lockRef, val => val || { by: myId, at: Date.now() });
      if (!tx.committed) return;

      // Re-check state
      const fresh = (await get(qRef)).val() || {};
      if (!fresh[myId] || !fresh[partnerId] || fresh[myId].matched || fresh[partnerId].matched){
        return;
      }

      // Create room
      const roomKey = push(ref(db, "rooms")).key;
      await set(ref(db, `rooms/${roomKey}`), { createdAt: serverTimestamp() });
      await update(ref(db, `queue/${myId}`), { matched: true, roomId: roomKey });
      await update(ref(db, `queue/${partnerId}`), { matched: true, roomId: roomKey });

      // Clean lock
      setTimeout(() => remove(lockRef), 10000);

      unsub();
      window.location.href = `room.html?room=${roomKey}`;
    });
  }catch(err){
    console.error(err);
    setStatus("Matchmaking failed.", true);
    if (errorEl) errorEl.style.display = "block";
    startBtn.disabled = false;
  }
});
