import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getDatabase, ref, get, set, remove, onValue, runTransaction } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-database.js";

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

const timeSelect = document.querySelector("#round-time");
const roomInput = document.querySelector("#room-code");
const nameInput = document.querySelector("#player-name");
const colorInput = document.querySelector("#player-color");
const gamemodeSelect = document.querySelector("#gamemode");
const gameUI = document.querySelector("#game-ui");
const deathMenu = document.querySelector("#death-menu");
const roundTimer = document.querySelector("#round-timer");
const scoreStatus = document.querySelector("#score-status");
const createButton = document.querySelector("#create-room");

let room = null;
let myId = null;
let hostId = null;
let duration = 60;
let endsAt = null;
let roundState = null;
let deathCounted = false;
let unsubscribers = [];
let singleDeaths = 0;
let singlePoints = 0;

function cleanup() {
  for (const unsubscribe of unsubscribers) unsubscribe();
  unsubscribers = [];
  room = null;
  myId = null;
  hostId = null;
  endsAt = null;
  roundState = null;
  deathCounted = false;
}

function ownName() {
  return (nameInput.value.trim() || "Cubey").substring(0, 16);
}

async function findMe(code) {
  const snapshot = await get(ref(db, `rooms/${code}/players`));
  const data = snapshot.val() || {};
  const name = ownName();
  const color = colorInput.value;
  const matches = Object.entries(data).filter(([, p]) => p.name === name && p.color === color);
  if (matches.length) myId = matches[matches.length - 1][0];
}

function formatTime(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function renderTimer() {
  if (!roundTimer) return;
  if (gamemodeSelect.value === "free-roam" || duration === 0) {
    roundTimer.textContent = "";
    return;
  }
  if (roundState === "running" && endsAt) {
    roundTimer.textContent = `time: ${formatTime(endsAt - Date.now())}`;
  } else {
    roundTimer.textContent = `time: ${formatTime(duration * 1000)}`;
  }
}

function renderScores(players = {}) {
  if (!scoreStatus) return;
  if (!room) {
    scoreStatus.textContent = `points: ${singlePoints} · deaths: ${singleDeaths}`;
    return;
  }
  const me = players[myId] || {};
  const top = Object.values(players)
    .sort((a, b) => (Number(b.points) || 0) - (Number(a.points) || 0))
    .slice(0, 3)
    .map(p => `${p.name || "Cubey"} ${Number(p.points) || 0}`)
    .join(" · ");
  scoreStatus.textContent = `points: ${Number(me.points) || 0} · deaths: ${Number(me.deaths) || 0}${top ? ` · top: ${top}` : ""}`;
}

async function countDeath() {
  if (deathCounted) return;
  deathCounted = true;

  if (!room || !myId) {
    singleDeaths++;
    renderScores();
    return;
  }

  await runTransaction(ref(db, `rooms/${room}/players/${myId}/deaths`), value => (Number(value) || 0) + 1);
  const snapshot = await get(ref(db, `rooms/${room}/players`));
  const players = snapshot.val() || {};
  await Promise.all(Object.keys(players).filter(id => id !== myId).map(id =>
    runTransaction(ref(db, `rooms/${room}/players/${id}/points`), value => (Number(value) || 0) + 1)
  ));
}

async function attachRoom(code, created = false) {
  cleanup();
  room = code;
  duration = Number(timeSelect.value) || 0;
  await findMe(code);

  if (created) {
    await set(ref(db, `rooms/${code}/roundDuration`), duration);
  }

  unsubscribers.push(onValue(ref(db, `rooms/${code}/host`), snap => {
    hostId = snap.val();
  }));

  unsubscribers.push(onValue(ref(db, `rooms/${code}/roundDuration`), snap => {
    if (snap.val() !== null) duration = Number(snap.val()) || 0;
    renderTimer();
  }));

  unsubscribers.push(onValue(ref(db, `rooms/${code}/roundEndsAt`), snap => {
    endsAt = snap.val() || null;
    renderTimer();
  }));

  unsubscribers.push(onValue(ref(db, `rooms/${code}/players`), snap => {
    const players = snap.val() || {};
    if (!myId) findMe(code).catch(console.error);
    renderScores(players);
  }));

  unsubscribers.push(onValue(ref(db, `rooms/${code}/roundState`), async snap => {
    const oldState = roundState;
    roundState = snap.val();
    if (roundState !== "running") deathCounted = false;

    if (roundState === "running" && oldState !== "running" && duration > 0 && myId === hostId) {
      const end = Date.now() + duration * 1000;
      await set(ref(db, `rooms/${code}/roundEndsAt`), end);
    }
    if (roundState === "waiting" && myId === hostId) {
      await remove(ref(db, `rooms/${code}/roundEndsAt`));
    }
    renderTimer();
  }));
}

function detectGame() {
  if (gameUI.classList.contains("hidden")) {
    if (room) cleanup();
    renderScores();
    return;
  }

  const code = roomInput.value.trim().toUpperCase();
  if (code && code !== room) {
    setTimeout(() => attachRoom(code, false).catch(console.error), 150);
  }
}

createButton.addEventListener("click", () => {
  const wantedDuration = Number(timeSelect.value) || 0;
  setTimeout(async () => {
    const code = roomInput.value.trim().toUpperCase();
    if (!code) return;
    await attachRoom(code, true);
    duration = wantedDuration;
    await set(ref(db, `rooms/${code}/roundDuration`), wantedDuration);
  }, 500);
});

new MutationObserver(detectGame).observe(gameUI, { attributes: true, attributeFilter: ["class"] });
new MutationObserver(() => {
  if (!deathMenu.classList.contains("hidden")) countDeath().catch(console.error);
  else deathCounted = false;
}).observe(deathMenu, { attributes: true, attributeFilter: ["class"] });

setInterval(async () => {
  detectGame();
  renderTimer();
  if (room && roundState === "running" && endsAt && Date.now() >= endsAt && myId === hostId) {
    await set(ref(db, `rooms/${room}/roundState`), "waiting");
    await remove(ref(db, `rooms/${room}/roundEndsAt`));
  }
}, 250);
