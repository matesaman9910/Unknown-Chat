import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, onValue, set, remove, update, serverTimestamp, onDisconnect } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDv484MJ-qo9ae3mM8KhW-xo9nYD1lBSEA",
  authDomain: "the-unknown-chat.firebaseapp.com",
  databaseURL: "https://the-unknown-chat-default-rtdb.europe-west1.firebasedatabase.app", // UPDATED
  projectId: "the-unknown-chat",
  storageBucket: "the-unknown-chat.appspot.com",
  messagingSenderId: "208285058331",
  appId: "1:208285058331:web:25aa0f03fbae1371dbbfbe"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const roomId = new URLSearchParams(window.location.search).get("room");
const messagesRef = ref(db, `rooms/${roomId}/messages`);
const roomRef = ref(db, `rooms/${roomId}`);
const userId = crypto.randomUUID();

let hasConnected = false;
let hasWarned = false;

// Elements
const messagesDiv = document.getElementById("messages");
const input = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendButton");
const typingIndicator = document.getElementById("typingIndicator");
const statusBar = document.getElementById("statusBar");

// Set user as present
set(ref(db, `rooms/${roomId}/users/${userId}`), {
  joined: Date.now()
});

onDisconnect(ref(db, `rooms/${roomId}/users/${userId}`)).remove();

// Auto-delete if both leave
onValue(ref(db, `rooms/${roomId}/users`), (snapshot) => {
  const users = snapshot.val();
  if (!users || Object.keys(users).length === 0) {
    remove(ref(db, `rooms/${roomId}`));
    return;
  }
});

// Watch for room existence
onValue(roomRef, (snap) => {
  if (!snap.exists()) {
    showError("Room does not exist or has been closed.");
    setTimeout(() => {
      window.location.href = "index.html";
    }, 3000);
  }
});

// Watch for disconnects
onValue(ref(db, `rooms/${roomId}/users`), (snap) => {
  const users = snap.val() || {};
  if (!users[userId] && !hasWarned) {
    showError("⚠️ Other user disconnected. Returning to queue...");
    hasWarned = true;
    setTimeout(() => {
      window.location.href = "index.html";
    }, 4000);
  }
});

// Typing indicator
input.addEventListener("input", () => {
  set(ref(db, `rooms/${roomId}/typing/${userId}`), input.value.length > 0);
});

// Show typing
onValue(ref(db, `rooms/${roomId}/typing`), (snap) => {
  const typing = snap.val() || {};
  const someoneElseTyping = Object.keys(typing).some(id => id !== userId && typing[id]);
  typingIndicator.innerText = someoneElseTyping ? "Stranger is typing..." : "";
});

// Send message
sendBtn.onclick = sendMessage;
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

function sendMessage() {
  const text = input.value.trim();
  if (!text) return;

  const messageData = {
    userId,
    text,
    timestamp: serverTimestamp()
  };

  const newMsgRef = ref(db, `rooms/${roomId}/messages/${Date.now()}`);
  set(newMsgRef, messageData);

  input.value = "";
  set(ref(db, `rooms/${roomId}/typing/${userId}`), false);
}

// Display messages
onValue(messagesRef, (snap) => {
  const msgs = snap.val() || {};
  messagesDiv.innerHTML = "";

  Object.values(msgs).forEach(msg => {
    const msgDiv = document.createElement("div");
    msgDiv.className = "message " + (msg.userId === userId ? "you" : "other");
    msgDiv.innerText = msg.text;
    messagesDiv.appendChild(msgDiv);
  });

  messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

function showError(text) {
  if (statusBar) {
    statusBar.innerText = text;
    statusBar.classList.add("error");
  }
}
