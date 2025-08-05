const firebaseConfig = {
  apiKey: "AIzaSyDv484MJ-qo9ae3mM8KhW-xo9nYD1lBSEA",
  authDomain: "the-unknown-chat.firebaseapp.com",
  projectId: "the-unknown-chat",
  storageBucket: "the-unknown-chat.appspot.com",
  messagingSenderId: "208285058331",
  appId: "1:208285058331:web:25aa0f03fbae1371dbbfbe",
  databaseURL: "https://the-unknown-chat-default-rtdb.europe-west1.firebasedatabase.app"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();

auth.signInAnonymously().then(() => {
  const userId = auth.currentUser.uid;
  const queueRef = db.ref("queue");
  const roomsRef = db.ref("rooms");

  queueRef.once("value", (snapshot) => {
    const queue = snapshot.val() || {};
    const available = Object.keys(queue).find(id => id !== userId);

    if (available) {
      const room = roomsRef.push();
      const roomId = room.key;
      room.set({ users: { [userId]: true, [available]: true }, messages: [], createdAt: Date.now() });
      db.ref("queue/" + available).remove();
      window.location.href = "room.html?room=" + roomId;
    } else {
      queueRef.child(userId).set(true);
      queueRef.child(userId).onDisconnect().remove();
    }
  });
});
