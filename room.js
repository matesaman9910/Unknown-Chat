const db = firebase.database();
const auth = firebase.auth();
const roomId = new URLSearchParams(window.location.search).get("room");
const roomRef = db.ref("rooms/" + roomId);
const chatBox = document.getElementById("chatBox");
const msgInput = document.getElementById("msgInput");
const chatForm = document.getElementById("chatForm");
const typingStatus = document.getElementById("typingStatus");

let userId;

auth.signInAnonymously().then(() => {
  userId = auth.currentUser.uid;

  // Auto-remove after 5 minutes if both users gone
  roomRef.onDisconnect().remove();

  roomRef.child("messages").on("child_added", snap => {
    const { sender, text } = snap.val();
    const bubble = document.createElement("div");
    bubble.className = sender === userId ? "bubble own" : "bubble other";
    bubble.innerText = text;
    chatBox.appendChild(bubble);
    chatBox.scrollTop = chatBox.scrollHeight;
  });

  roomRef.child("typing").on("value", snap => {
    const val = snap.val();
    typingStatus.innerText = val && val !== userId ? "Unknown is typing..." : "";
  });

  msgInput.addEventListener("input", () => {
    roomRef.child("typing").set(userId);
    setTimeout(() => {
      roomRef.child("typing").set("");
    }, 1000);
  });
});

chatForm.addEventListener("submit", e => {
  e.preventDefault();
  const msg = msgInput.value.trim();
  if (msg !== "") {
    roomRef.child("messages").push({ sender: userId, text: msg });
    msgInput.value = "";
  }
});

function leaveRoom() {
  window.location.href = "chat.html";
}

function findNew() {
  window.location.href = "chat.html";
}
