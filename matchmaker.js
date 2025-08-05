import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.2/firebase-app.js";
import {
  getDatabase, ref, onValue, set, push, remove, get, child, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.5.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDv484MJ-qo9ae3mM8KhW-xo9nYD1lBSEA",
  authDomain: "the-unknown-chat.firebaseapp.com",
  databaseURL: "https://the-unknown-chat-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "the-unknown-chat",
  storageBucket: "the-unknown-chat.firebasestorage.app",
  messagingSenderId: "208285058331",
  appId: "1:208285058331:web:25aa0f03fbae1371dbbfbe"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Generate a short random ID for the user
const userId = "user-" + Math.random().toString(36).substring(2, 10);
const queueRef = ref(db, "queue/" + userId);
const rootRef = ref(db);

// Join the queue
await set(queueRef, {
  joinedAt: Date.now()
});

document.getElementById("status").textContent = "Waiting for a stranger...";

// Watch the full queue
onValue(ref(db, "queue"), async (snapshot) => {
  const allUsers = snapshot.val();
  const ids = Object.keys(allUsers || {});
  if (ids.length >= 2) {
    const [first, second] = ids;

    // Let the first one create the room
    if (userId === first) {
      const roomRef = push(ref(db, "rooms"), {
        user1: first,
        user2: second,
        createdAt: Date.now()
      });
      const roomId = roomRef.key;

      // Remove both from queue
      await remove(ref(db, "queue/" + first));
      await remove(ref(db, "queue/" + second));

      // Redirect both users
      window.location.href = `room.html?room=${roomId}`;
    } else if (userId === second) {
      // Wait for the room to be created, then redirect
      const roomsRef = ref(db, "rooms");
      onValue(roomsRef, (roomsSnap) => {
        const rooms = roomsSnap.val();
        for (const id in rooms) {
          const room = rooms[id];
          if (room.user1 === first && room.user2 === second) {
            window.location.href = `room.html?room=${id}`;
            return;
          }
        }
      });
    }
  }
});
