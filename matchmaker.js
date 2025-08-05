import { initializeApp } from "https://www.gstatic.com/firebasejs/9.24.0/firebase-app.js";
import { getDatabase, ref, push, onValue, remove, onDisconnect } from "https://www.gstatic.com/firebasejs/9.24.0/firebase-database.js";
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

signInAnonymously(auth).then(() => {
  onAuthStateChanged(auth, async user => {
    if (!user) return;
    const uid = user.uid;
    const queueRef = ref(db, "queue");
    const myRef = push(queueRef);
    await myRef.set({ uid });
    onDisconnect(myRef).remove();

    onValue(queueRef, async (snapshot) => {
      const queue = snapshot.val();
      if (!queue) return;

      const entries = Object.entries(queue).filter(([key, val]) => val.uid !== uid);
      if (entries.length > 0) {
        const [partnerKey, partnerVal] = entries[0];
        await remove(ref(db, `queue/${partnerKey}`));
        await remove(myRef);

        const roomRef = push(ref(db, "rooms"));
        await roomRef.set({
          users: { [uid]: true, [partnerVal.uid]: true },
          createdAt: Date.now()
        });

        window.location.href = `room.html?room=${roomRef.key}`;
      }
    });
  });
});
