// room.js v6 debug-enabled
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getDatabase, ref, onValue, set, remove, get, onDisconnect
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

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

// --- Debug Toggle ---
const qs = new URLSearchParams(location.search);
const DEBUG = qs.get("debug") === "1" || localStorage.getItem("uc_debug") === "1";
function debugLog(...msg) {
    console.log("[UC DEBUG]", ...msg);
    if (DEBUG) {
        const el = document.getElementById("uc-debug");
        if (el) el.innerHTML += msg.join(" ") + "<br>";
    }
}
if (DEBUG) {
    const dbg = document.createElement("div");
    dbg.id = "uc-debug";
    dbg.style.cssText = `
        position:fixed;bottom:0;right:0;width:320px;height:200px;
        overflow:auto;background:rgba(0,0,0,0.85);color:#0ff;
        font-size:12px;padding:6px;z-index:99999;font-family:monospace;
    `;
    document.body.appendChild(dbg);
    debugLog("Debug overlay active.");
}

// --- UI Elements ---
const statusEl = document.getElementById("status");
const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const leaveBtn = document.getElementById("leave-btn");

// --- Room Info ---
const roomId = new URLSearchParams(window.location.search).get("room");
const playerId = sessionStorage.getItem("playerId");
if (!roomId || !playerId) {
    debugLog("Missing roomId or playerId — redirecting.");
    window.location.href = "index.html";
}

// --- Firebase Presence ---
import { ref as dbRef } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
const connectedRef = ref(db, ".info/connected");
onValue(connectedRef, snap => {
    debugLog("Firebase connected:", snap.val());
});

// --- Status watcher ---
statusEl.innerText = "Connecting...";
const roomRef = ref(db, `rooms/${roomId}/players`);
onValue(roomRef, (snapshot) => {
    const players = snapshot.val() || {};
    const playerCount = Object.keys(players).length;
    debugLog("Players in room:", JSON.stringify(players));

    if (playerCount === 2) {
        statusEl.innerText = "Connected to stranger!";
    } else if (playerCount === 1) {
        statusEl.innerText = "Waiting for stranger...";
    } else {
        statusEl.innerText = "Stranger disconnected — returning to queue...";
        setTimeout(() => {
            remove(ref(db, `rooms/${roomId}`));
            window.location.href = "index.html";
        }, 5000);
    }
});

// --- Stuck safeguard ---
setTimeout(async () => {
    const snap = await get(roomRef);
    const players = snap.val() || {};
    if (Object.keys(players).length < 2) {
        debugLog("Timeout: less than 2 players — cleaning up room.");
        statusEl.innerText = "No connection. Returning to queue...";
        await remove(ref(db, `rooms/${roomId}`));
        window.location.href = "index.html";
    }
}, 10000);

// --- Message send ---
sendBtn.onclick = () => {
    const text = inputEl.value.trim();
    if (!text) return;
    debugLog("Sending message:", text);
    const msgRef = ref(db, `rooms/${roomId}/messages/${Date.now()}`);
    set(msgRef, { sender: playerId, text });
    inputEl.value = "";
};
inputEl.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendBtn.click();
});

// --- Leave room ---
leaveBtn.onclick = async () => {
    debugLog("Player leaving room.");
    await remove(ref(db, `rooms/${roomId}/players/${playerId}`));
    window.location.href = "index.html";
};

// --- Messages watcher ---
const messagesRef = ref(db, `rooms/${roomId}/messages`);
onValue(messagesRef, (snapshot) => {
    const msgs = snapshot.val() || {};
    debugLog("Messages snapshot:", msgs);
    messagesEl.innerHTML = "";
    Object.values(msgs).forEach(msg => {
        const div = document.createElement("div");
        div.textContent = msg.text;
        messagesEl.appendChild(div);
    });
});
