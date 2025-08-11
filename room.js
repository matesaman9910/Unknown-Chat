// room.js — v6 handshake fix
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, onValue, set, remove, get, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// Firebase config
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
const db = getDatabase(app);

// Get room ID & player ID
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get("room");
const playerId = sessionStorage.getItem("playerId") || `p_${Date.now()}`;
sessionStorage.setItem("playerId", playerId);

// UI elements
const statusEl = document.getElementById("status");
const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const leaveBtn = document.getElementById("leave-btn");

statusEl.innerText = "Joining room...";

// Mark player as ready
const playerRef = ref(db, `rooms/${roomId}/players/${playerId}`);
await update(playerRef, { ready: true, joinedAt: Date.now() });

// Listen for players
const playersRef = ref(db, `rooms/${roomId}/players`);
onValue(playersRef, (snapshot) => {
    const players = snapshot.val() || {};
    const playerList = Object.values(players);
    const readyCount = playerList.filter(p => p.ready).length;

    if (readyCount === 2) {
        statusEl.innerText = "Connected to stranger!";
    } else {
        statusEl.innerText = "Waiting for other player...";
    }
});

// Timeout if second player never joins
setTimeout(async () => {
    const snap = await get(playersRef);
    const players = snap.val() || {};
    const readyCount = Object.values(players).filter(p => p.ready).length;
    if (readyCount < 2) {
        statusEl.innerText = "No connection. Returning to queue...";
        await remove(ref(db, `rooms/${roomId}`));
        window.location.href = "index.html";
    }
}, 30000);

// Auto-remove player on leave/close
window.addEventListener("beforeunload", () => {
    remove(playerRef);
});

// Send message
sendBtn.onclick = () => {
    const text = inputEl.value.trim();
    if (!text) return;
    const msgRef = ref(db, `rooms/${roomId}/messages/${Date.now()}`);
    set(msgRef, { sender: playerId, text });
    inputEl.value = "";
};

// Listen for messages
const messagesRef = ref(db, `rooms/${roomId}/messages`);
onValue(messagesRef, (snapshot) => {
    const msgs = snapshot.val() || {};
    messagesEl.innerHTML = "";
    Object.values(msgs).forEach(msg => {
        const div = document.createElement("div");
        div.textContent = msg.text;
        messagesEl.appendChild(div);
    });
});

// Leave button
leaveBtn.onclick = async () => {
    await remove(playerRef);
    window.location.href = "index.html";
};
