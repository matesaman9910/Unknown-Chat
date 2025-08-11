// room.js — v6.3 handshake + instant cleanup + safe DOM + countdown
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, onValue, set, remove, get, update, onDisconnect
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// --- Firebase config (your real one) ---
const firebaseConfig = {
  apiKey: "AIzaSyDv484MJ-qo9ae3mM8KhW-xo9nYD1lBSEA",
  authDomain: "the-unknown-chat.firebaseapp.com",
  databaseURL: "https://the-unknown-chat-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "the-unknown-chat",
  storageBucket: "the-unknown-chat.appspot.com",
  messagingSenderId: "208285058331",
  appId: "1:208285058331:web:25aa0f03fbae1371dbbfbe"
};
const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

// --- Helpers: tolerant DOM + status bar + system msg ---
const pick = (...sels) => sels.map(s=>document.querySelector(s)).find(Boolean) || null;

function ensureStatusBar() {
  let bar = document.getElementById("statusBar") || document.getElementById("status");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "statusBar";
    bar.style.cssText = "position:fixed;top:12px;left:50%;transform:translateX(-50%);background:#041a33;color:#9ad1ff;padding:8px 14px;border:1px solid #0d3f80;border-radius:10px;font:14px/1.2 monospace;z-index:9999";
    document.body.prepend(bar);
  }
  return bar;
}
function setStatus(msg, isError=false) {
  const bar = ensureStatusBar();
  bar.textContent = msg;
  bar.style.background = isError ? "#2b0b16" : "#041a33";
  bar.style.color = isError ? "#ffcdd2" : "#9ad1ff";
}

const messagesEl = pick("#messages", ".messages");
const inputEl    = pick("#message-input", "#messageInput");
const sendBtn    = pick("#send-btn", "#sendButton");
const leaveBtn   = pick("#leave-btn", "#leaveBtn");

function addSystem(text) {
  if (!messagesEl) { setStatus(text); return; }
  const div = document.createElement("div");
  div.className = "msg system";
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// --- Room/session info ---
const qs = new URLSearchParams(location.search);
const roomId = qs.get("room");
const playerId = sessionStorage.getItem("playerId") || `p_${Math.random().toString(36).slice(2,9)}`;
sessionStorage.setItem("playerId", playerId);

const playersRef  = ref(db, `rooms/${roomId}/players`);
const myPlayerRef = ref(db, `rooms/${roomId}/players/${playerId}`);
const msgsRef     = ref(db, `rooms/${roomId}/messages`);

setStatus("Joining room...");

// Mark myself present + ready; auto-remove on disconnect
await update(myPlayerRef, { ready: true, joinedAt: Date.now() });
onDisconnect(myPlayerRef).remove();

// --- Handshake + presence watcher ---
let hadPeer = false;
let requeueTimer = null;

onValue(playersRef, async (snap) => {
  const players = snap.val() || {};
  const readyCount = Object.values(players).filter(p => p && p.ready).length;
  const totalCount = Object.keys(players).length;

  if (readyCount >= 2) {
    hadPeer = true;
    if (requeueTimer) { clearInterval(requeueTimer); requeueTimer = null; }
    setStatus("Connected to stranger!");
  } else {
    // If one leaves or only one present → wipe messages immediately
    await remove(msgsRef);

    if (hadPeer && !requeueTimer) {
      // Peer dropped after we were connected → show countdown and bounce
      let left = 5;
      addSystem("Player disconnected — re-queueing in 5s…");
      setStatus(`Player disconnected — re-queueing in ${left}s…`);
      requeueTimer = setInterval(async () => {
        left -= 1;
        setStatus(`Player disconnected — re-queueing in ${left}s…`);
        if (left <= 0) {
          clearInterval(requeueTimer); requeueTimer = null;
          await remove(myPlayerRef);
          const leftSnap = await get(playersRef);
          const anyoneLeft = leftSnap.exists() && Object.keys(leftSnap.val()||{}).length > 0;
          if (!anyoneLeft) await remove(ref(db, `rooms/${roomId}`));
          location.href = "index.html";
        }
      }, 1000);
    } else {
      setStatus("Waiting for other player...");
    }
  }

  // If nobody remains → nuke the room entirely
  if (totalCount === 0) {
    await remove(ref(db, `rooms/${roomId}`));
  }
});

// --- 30s safety timeout if partner never arrives ---
setTimeout(async () => {
  const snap = await get(playersRef);
  const players = snap.val() || {};
  const readyCount = Object.values(players).filter(p => p && p.ready).length;
  if (readyCount < 2 && !hadPeer) {
    setStatus("No one joined. Returning to queue...", true);
    await remove(myPlayerRef);
    await remove(msgsRef);
    const leftSnap = await get(playersRef);
    if (!leftSnap.exists() || Object.keys(leftSnap.val()||{}).length === 0) {
      await remove(ref(db, `rooms/${roomId}`));
    }
    location.href = "index.html";
  }
}, 30000);

// --- Messaging (guarded so missing DOM won’t crash) ---
if (sendBtn && inputEl && messagesEl) {
  sendBtn.addEventListener("click", sendMessage);
  inputEl.addEventListener("keydown", (e)=>{ if (e.key === "Enter") sendMessage(); });

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
  set(entry, { sender: playerId, text });
  inputEl.value = "";
}

// --- Leave button (guarded) ---
if (leaveBtn) {
  leaveBtn.addEventListener("click", async () => {
    await remove(myPlayerRef);
    const leftSnap = await get(playersRef);
    if (!leftSnap.exists() || Object.keys(leftSnap.val()||{}).length === 0) {
      await remove(ref(db, `rooms/${roomId}`));
    } else {
      await remove(msgsRef); // clear chat if the other is still there
    }
    location.href = "index.html";
  });
}

// --- Cleanup on tab close (best effort) ---
window.addEventListener("beforeunload", async () => {
  await remove(myPlayerRef);
  const leftSnap = await get(playersRef);
  if (!leftSnap.exists() || Object.keys(leftSnap.val()||{}).length === 0) {
    await remove(ref(db, `rooms/${roomId}`));
  } else {
    await remove(msgsRef);
  }
});
