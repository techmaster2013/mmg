import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  query,
  limitToLast,
  onValue,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDcIIJrzofnRBw8woPz339R3ESbVGjZuO4",
  authDomain: "mmg-server-a8cf2.firebaseapp.com",
  databaseURL: "https://mmg-server-a8cf2-default-rtdb.firebaseio.com",
  projectId: "mmg-server-a8cf2",
  storageBucket: "mmg-server-a8cf2.firebasestorage.app",
  messagingSenderId: "812316801603",
  appId: "1:812316801603:web:441a0c8f8a9bce39cab2f6"
};

const app = getApps()[0] || initializeApp(firebaseConfig);
const db = getDatabase(app);
const chat = document.querySelector("#chat");
const log = document.querySelector("#chat-log");
const form = document.querySelector("#chat-form");
const input = document.querySelector("#chat-input");
const nameInput = document.querySelector("#player-name");
const gameUI = document.querySelector("#game-ui");
const gameStatus = document.querySelector("#game-status");

let room = null;
let stopChat = null;

function esc(text="") {
  return String(text).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function currentRoom() {
  if (gameUI.classList.contains("hidden")) return null;
  const status = gameStatus.textContent || "";
  if (status.startsWith("singleplayer")) return null;
  const code = status.split(" · ")[0]?.trim();
  return /^[A-Z2-9]{4}$/.test(code || "") ? code : null;
}

function watchRoom(code) {
  if (stopChat) stopChat();
  room = code;
  log.innerHTML = "";
  if (!room) {
    chat.classList.add("hidden");
    return;
  }

  chat.classList.remove("hidden");
  const q = query(ref(db, `rooms/${room}/chat`), limitToLast(40));
  stopChat = onValue(q, snap => {
    const rows = Object.values(snap.val() || {}).sort((a,b)=>(a.at||0)-(b.at||0));
    log.innerHTML = rows.map(m => `<div class="chat-message"><b>${esc(m.name || "Cubey")}</b> ${esc(m.text || "")}</div>`).join("");
    log.scrollTop = log.scrollHeight;
  });
}

setInterval(() => {
  const next = currentRoom();
  if (next !== room) watchRoom(next);
}, 300);

form.addEventListener("submit", async event => {
  event.preventDefault();
  const text = input.value.trim();
  if (!room || !text) return;
  input.value = "";
  await push(ref(db, `rooms/${room}/chat`), {
    name: (nameInput.value.trim() || "Cubey").slice(0,16),
    text: text.slice(0,240),
    at: serverTimestamp()
  });
});

input.addEventListener("keydown", event => event.stopPropagation());
input.addEventListener("keyup", event => event.stopPropagation());
