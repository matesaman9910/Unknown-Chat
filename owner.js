
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, onValue, remove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

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
const db = getDatabase(app);

const $ = (sel)=>document.querySelector(sel);
function bar(msg,err=false){
  let b = $("#statusBar"); if(!b){ b=document.createElement("div"); b.id="statusBar"; document.body.prepend(b); }
  b.style.display="block"; b.textContent=msg; b.classList.toggle("error", !!err);
}

$("#back").addEventListener("click", ()=> location.href="index.html");
$("#wipeQueue").addEventListener("click", async ()=>{
  if (!confirm("Delete ALL queue entries?")) return;
  await remove(ref(db, "queue"));
  bar("Queue wiped.");
});
$("#wipeEmptyRooms").addEventListener("click", async ()=>{
  if (!confirm("Delete rooms with 0 users?")) return;
  onValue(ref(db,"rooms"), async (snap)=>{
    const rooms = snap.val()||{};
    let n=0;
    for (const [rk,rv] of Object.entries(rooms)){
      const users = rv && rv.users ? Object.keys(rv.users) : [];
      if (users.length===0){ await remove(ref(db,`rooms/${rk}`)); n++; }
    }
    bar(`Deleted ${n} empty rooms.`);
  }, {onlyOnce:true});
});
$("#wipeAll").addEventListener("click", async ()=>{
  if (!confirm("DELETE EVERYTHING under /queue, /rooms, /locks ?")) return;
  await remove(ref(db, "queue"));
  await remove(ref(db, "rooms"));
  await remove(ref(db, "locks"));
  bar("All core paths wiped.");
});
