// room.js — v6.3 with debug + cleanup fixes

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, onValue, set, remove, get, update, onDisconnect
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// === Debug overlay (only if enabled)
const DEBUG = localStorage.getItem("uc_debug") === "1";
function dbg(...args) {
  if (!DEBUG) return;
  const el = document.getElementById("uc-debug") || (() => {
    const e = document.createElement("div");
    e.id = "uc-debug";
    e.style.cssText = `
      position:fixed;bottom:10px;right:10px;width:360px;height:240px;
      overflow:auto;background:rgba(0,0,0,.85);color:#0ff;
      font:12px monospace;padding:8px;border:1px solid #0d3f80;
      border-radius:10px;z-index:99999;
    `;
    document.body.appendChild(e);
    return e;
  })();
  const t = new Date().toLocaleTimeString();
  const line = document.createElement("div");
  line.textContent = `[${t}] ${args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" ")}`;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
  console.log("[DEBUG]", ...args);
}

// === Firebase
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

// === Get params
const urlParams = new URLSearchParams(window.location.search);
const roomId    = urlParams.get("room");
const playerId  = sessionStorage.getItem("playerId") || `p_${Math.random().toString(36).slice(2,9)}`;
sessionStorage.setItem("playerId", playerId);

const statusEl   = document.getElementById("statusBar");
const messagesEl = document.getElementById("messages");
const inputEl    = document.getElementById("messageInput");
const sendBtn    = document.getElementById("sendButton");
const leaveBtn   = document.getElementById("leaveBtn");
const typingEl   = document.getElementById("typingIndicator");

dbg("Init", { roomId, playerId });

// === Presence setup
const playerRef = ref(db, `rooms/${roomId}/players/${playerId}`);
set(playerRef, { ready: true });
onDisconnect(playerRef).remove();

// === Players listener
const playersRef = ref(db, `rooms/${roomId}/players`);
onValue(playersRef, snap => {
  const players = snap.val() || {};
  const total = Object.keys(players).length;
  const readyCount = Object.values(players).filter(p => p.ready).length;
  dbg("Players snapshot:", { total, readyCount, ids: Object.keys(players) });

  if (total === 2 && readyCount === 2) {
    statusEl.innerText = "Connected to stranger!";
  } else {
    statusEl.innerText = "Waiting for other player…";
  }
});

// === Messages listener
const messagesRef = ref(db, `rooms/${roomId}/messages`);
onValue(messagesRef, snap => {
  const msgs = snap.val() || {};
  messagesEl.innerHTML = "";
  Object.values(msgs).forEach(msg => {
    const div = document.createElement("div");
    div.textContent = msg.text;
    messagesEl.appendChild(div);
  });
  dbg("Messages changed. Count =", Object.keys(msgs).length);
});

// === Send
function sendMessage() {
  const text = inputEl.value.trim();
  if (!text) return;
  const msgRef = ref(db, `rooms/${roomId}/messages/${Date.now()}`);
  set(msgRef, { sender: playerId, text });
  dbg("Send:", text);
  inputEl.value = "";
}
sendBtn.onclick = sendMessage;
inputEl.addEventListener("keydown", e => {
  if (e.key === "Enter") sendMessage();
});

// === Leave
leaveBtn.onclick = async () => {
  dbg("Leave clicked");
  await remove(playerRef);
  // also try to remove empty room
  const players = (await get(playersRef)).val() || {};
  if (Object.keys(players).length <= 1) {
    dbg("Deleting empty room");
    await remove(ref(db, `rooms/${roomId}`));
  }
  window.location.href = "index.html";
};

// === Timeout safety
setTimeout(async () => {
  const snap = await get(playersRef);
  const players = snap.val() || {};
  const total = Object.keys(players).length;
  const readyCount = Object.values(players).filter(p => p.ready).length;
  dbg("Timeout check → readyCount:", readyCount);
  if (total < 2 || readyCount < 2) {
    statusEl.innerText = "No connection. Returning to queue…";
    await remove(ref(db, `rooms/${roomId}`));
    window.location.href = "index.html";
  }
}, 15000);
