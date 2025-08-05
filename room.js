import { initializeApp } from "https://www.gstatic.com/firebasejs/9.24.0/firebase-app.js";
import { getDatabase, ref, push, onChildAdded, onValue, remove, set, onDisconnect } from "https://www.gstatic.com/firebasejs/9.24.0/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.24.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDv484MJ-qo9ae3mM8KhW-xo9nYD1lBSEA",
  authDomain: "the-unknown-chat.firebaseapp.com",
  projectId: "the-unknown-chat",
  storageBucket: "the-unknown-chat.appspot.com",
  messagingSenderId: "208285058331",
  appId: "1:208285058331:web:25aa0f03fbae1371dbbfbe",
  databaseURL: "https://the-unknown-chat-default-rtdb.europe-west1.firebasedatabase.app"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth();

const chatBox = document.getElementById("chatBox");
const messageInput = document.getElementById("messageInput");
const chatForm = document.getElementById("chatForm");
const typingStatus = document.getElementById("typingStatus");

const roomId = new URLSearchParams(window.location.search).get("room");
const roomRef = ref(db, "rooms/" + roomId);
const messagesRef = ref(db, "rooms/" + roomId + "/messages");
const typingRef = ref(db, "rooms/" + roomId + "/typing");

let userId;

signInAnonymously(auth).then(() => {
  onAuthStateChanged(auth, user => {
    if (!user) return;
    userId = user.uid;

    // Auto-delete after 5 minutes if both gone
    setTimeout(() => {
      remove(roomRef);
    }, 1000 * 60 * 5);

    onDisconnect(roomRef).remove();

    // Typing
    messageInput.addEventListener("input", () => {
      set(typingRef, userId);
      setTimeout(() => {
        set(typingRef, "");
      }, 1200);
    });

    // Typing indicator
    onValue(typingRef, snap => {
      const val = snap.val();
      if (val && val !== userId) {
        typingStatus.textContent = "Unknown is typing...";
      } else {
        typingStatus.textContent = "";
      }
    });

    // Messages
    onChildAdded(messagesRef, (data) => {
      const msg = data.val();
      const bubble = document.createElement("div");
      bubble.className = msg.sender === userId ? "bubble self" : "bubble other";
      bubble.textContent = msg.text;
      chatBox.appendChild(bubble);
      chatBox.scrollTop = chatBox.scrollHeight;
    });

    // Send message
    chatForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = messageInput.value.trim();
      if (text === "") return;
      push(messagesRef, { sender: userId, text });
      messageInput.value = "";
    });
  });
});

function leave() {
  window.location.href = "chat.html";
}
