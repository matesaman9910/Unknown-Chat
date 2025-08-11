
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, onValue, set, remove, serverTimestamp, onDisconnect, push } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

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

const qs = new URLSearchParams(location.search);
const roomId = qs.get("room");
if (!roomId){ location.href = "index.html"; }

const $ = (sel) => document.querySelector(sel);
function setBar(msg, err=false){
  let bar = $("#statusBar");
  if(!bar){ bar = document.createElement("div"); bar.id="statusBar"; document.body.prepend(bar); }
  bar.textContent = msg;
  bar.classList.toggle("error", !!err);
}
function sys(text){
  const div = document.createElement("div");
  div.className = "msg system";
  div.textContent = text;
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

const messagesDiv = $("#messages");
const input = $("#messageInput");
const sendBtn = $("#sendButton");
const typingIndicator = $("#typingIndicator");
const leaveBtn = $("#leaveBtn");
const newStrangerBtn = $("#newStrangerBtn");

if(!messagesDiv||!input||!sendBtn||!typingIndicator||!leaveBtn||!newStrangerBtn){ throw new Error("Missing DOM"); }

const roomRef = ref(db, `rooms/${roomId}`);
const messagesRef = ref(db, `rooms/${roomId}/messages`);
const usersRef = ref(db, `rooms/${roomId}/users`);
const typingRef = ref(db, `rooms/${roomId}/typing`);

const userId = crypto.randomUUID();

await set(ref(db, `rooms/${roomId}/users/${userId}`), { joined: serverTimestamp(), hb: Date.now() });
onDisconnect(ref(db, `rooms/${roomId}/users/${userId}`)).remove();
onDisconnect(ref(db, `rooms/${roomId}/typing/${userId}`)).remove();

// Heartbeat to avoid ghost users
setInterval(() => set(ref(db, `rooms/${roomId}/users/${userId}`), { joined: serverTimestamp(), hb: Date.now() }), 20000);

let hadPeer = false;

onValue(usersRef, (snap) => {
  const users = snap.val() || {};
  const ids = Object.keys(users);
  const now = Date.now();
  // prune remote ghosts (no hb in 60s)
  for (const [id, val] of Object.entries(users)){ if (!val.hb || now - val.hb > 60000) remove(ref(db, `rooms/${roomId}/users/${id}`)); }

  const activeIds = Object.keys(users).filter(id => users[id]?.hb && now - users[id].hb < 60000);

  if (activeIds.length >= 2){ setBar("🔗 Connected"); hadPeer = true; }
  else if (activeIds.length === 1){ 
    setBar("⏳ Waiting for a stranger…"); 
    if (hadPeer) { sys("Stranger disconnected. Re-queueing in 5 seconds…"); setTimeout(()=> location.href="index.html?requeue=1", 5000); }
  }
  else { setBar("Room empty", true); }
});

onValue(roomRef, (snap) => { if (!snap.exists()){ setBar("Room closed.", true); setTimeout(()=> location.href="index.html", 1200); } });

input.addEventListener("input", async () => { await set(ref(db, `rooms/${roomId}/typing/${userId}`), input.value.length > 0); });
onValue(typingRef, (snap) => { const t = snap.val() || {}; const someone = Object.keys(t).some(id => id !== userId && t[id]); typingIndicator.textContent = someone ? "Stranger is typing…" : ""; });

function sendMessage(){ const text = input.value.trim(); if (!text) return; const msgRef = push(messagesRef); set(msgRef, { userId, text, ts: serverTimestamp() }); input.value = ""; set(ref(db, `rooms/${roomId}/typing/${userId}`), false); }
sendBtn.addEventListener("click", sendMessage);
input.addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });

onValue(messagesRef, (snap) => { const msgs = snap.val() || {}; const entries = Object.entries(msgs).sort((a,b)=> a[0].localeCompare(b[0])); messagesDiv.innerHTML = ""; for (const [key, m] of entries){ const div = document.createElement("div"); div.className = "msg " + (m.userId === userId ? "you" : "other"); div.textContent = m.text; messagesDiv.appendChild(div); } messagesDiv.scrollTop = messagesDiv.scrollHeight; });

leaveBtn.addEventListener("click", async () => { await remove(ref(db, `rooms/${roomId}/users/${userId}`)); location.href = "index.html"; });
newStrangerBtn.addEventListener("click", async () => { sys("Leaving room. Re-queueing in 5 seconds…"); await remove(ref(db, `rooms/${roomId}/users/${userId}`)); setTimeout(()=> location.href = "index.html?requeue=1", 5000); });
