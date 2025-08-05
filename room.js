import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getDatabase, ref, onChildAdded, push, set, onDisconnect,
  onValue, remove, serverTimestamp, update
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

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

const roomId = new URLSearchParams(window.location.search).get("room");
if (!roomId) {
  document.getElementById("errorMessage").textContent = "❌ Room does not exist.";
  document.getElementById("errorMessage").style.display = "block";
  throw new Error("No room ID found");
}

const messagesRef = ref(db, `rooms/${roomId}/messages`);
const typingRef = ref(db, `rooms/${roomId}/typing`);
const presenceRef = ref(db, `rooms/${roomId}/presence`);
const roomRef = ref(db, `rooms/${roomId}`);

// Unique ID for this client
const userId = crypto.randomUUID();
await set(ref(db, `rooms/${roomId}/presence/${userId}`), true);
onDisconnect(ref(db, `rooms/${roomId}/presence/${userId}`)).remove();

// Remove empty rooms after both users leave
onValue(presenceRef, (snap) => {
  const present = snap.val() || {};
  const count = Object.keys(present).length;
  if (count === 1) {
    showSystemMessage("Stranger has disconnected.");
    setTimeout(() => {
      alert("Stranger left. You'll be returned to queue.");
      window.location.href = "index.html";
    }, 3000);
  } else if (count === 0) {
    remove(roomRef); // auto-cleanup
  }
});

// Message send
window.sendMessage = async () => {
  const input = document.getElementById("messageInput");
  const msg = input.value.trim();
  if (!msg) return;
  await push(messagesRef, {
    sender: userId,
    text: msg,
    timestamp: serverTimestamp()
  });
  input.value = "";
  update(typingRef, { [userId]: false });
};

// Listen for new messages
onChildAdded(messagesRef, (snap) => {
  const data = snap.val();
  const msgElem = document.createElement("div");
  msgElem.className = data.sender === userId ? "message self" : "message other";
  msgElem.textContent = data.text;
  document.getElementById("chatBox").appendChild(msgElem);
  document.getElementById("chatBox").scrollTop = 99999;
});

// Typing detection
const input = document.getElementById("messageInput");
input.addEventListener("input", () => {
  update(typingRef, { [userId]: input.value.trim().length > 0 });
});

// Show typing status
onValue(typingRef, (snap) => {
  const typingData = snap.val() || {};
  const othersTyping = Object.keys(typingData).filter(k => k !== userId && typingData[k]);
  document.getElementById("statusMessage").textContent = othersTyping.length > 0 ? "Stranger is typing..." : "";
});

// Enter = send
input.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    sendMessage();
  }
});

// Leave/new stranger
window.leaveRoom = () => {
  remove(ref(db, `rooms/${roomId}/presence/${userId}`));
  alert("You left the chat.");
  window.location.href = "index.html";
};
window.newStranger = () => {
  remove(ref(db, `rooms/${roomId}/presence/${userId}`));
  window.location.href = "index.html";
};

function showSystemMessage(msg) {
  const el = document.createElement("div");
  el.className = "system-message";
  el.textContent = msg;
  document.getElementById("chatBox").appendChild(el);
}
