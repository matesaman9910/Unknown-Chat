import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getDatabase, ref, onValue, set, push, remove } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

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

const queueRef = ref(db, "queue");

document.getElementById("startBtn").onclick = async () => {
  const user = push(queueRef);
  await set(user, { timestamp: Date.now() });

  document.getElementById("status").style.display = "block";
  document.getElementById("startBtn").disabled = true;

  onValue(queueRef, async (snapshot) => {
    const users = Object.entries(snapshot.val() || {});
    if (users.length >= 2) {
      const [user1, user2] = users;
      const roomId = push(ref(db, "rooms")).key;

      await set(ref(db, `rooms/${roomId}`), {
        user1: user1[0],
        user2: user2[0],
        createdAt: Date.now()
      });

      await remove(ref(db, `queue/${user1[0]}`));
      await remove(ref(db, `queue/${user2[0]}`));

      window.location.href = `room.html?room=${roomId}`;
    }
  });
};
