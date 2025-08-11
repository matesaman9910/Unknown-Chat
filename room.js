
// Fixed room.js for v6
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, onValue, set, remove, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// Firebase config PUBLIC
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

// Get room ID and player info
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');
const playerId = sessionStorage.getItem('playerId');

const statusEl = document.getElementById("status");
const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const leaveBtn = document.getElementById("leave-btn");

statusEl.innerText = "Connecting...";

// Watch room state
const roomRef = ref(db, "rooms/" + roomId + "/players");
onValue(roomRef, (snapshot) => {
    const players = snapshot.val() || {};
    const playerCount = Object.keys(players).length;

    if (playerCount === 2) {
        statusEl.innerText = "Connected to stranger!";
    } else if (playerCount === 1) {
        statusEl.innerText = "Connecting...";
    }
});

// Safety timeout to prevent stuck states
setTimeout(async () => {
    const snap = await get(roomRef);
    const players = snap.val() || {};
    if (Object.keys(players).length < 2) {
        statusEl.innerText = "No connection. Returning to queue...";
        await remove(ref(db, "rooms/" + roomId));
        window.location.href = "index.html";
    }
}, 10000);

// Send message
sendBtn.onclick = () => {
    const text = inputEl.value.trim();
    if (!text) return;
    const msgRef = ref(db, `rooms/${roomId}/messages/${Date.now()}`);
    set(msgRef, { sender: playerId, text });
    inputEl.value = "";
};

// Leave room
leaveBtn.onclick = async () => {
    await remove(ref(db, "rooms/" + roomId + "/players/" + playerId));
    window.location.href = "index.html";
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
