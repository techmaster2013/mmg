import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";

import {
  getDatabase,
  ref,
  set,
  remove,
  update as firebaseUpdate,
  onValue,
  onDisconnect,
  get,
  runTransaction
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-database.js";


// ========================================
// FIREBASE
// ========================================

const firebaseConfig = {
  apiKey: "AIzaSyDcIIJrzofnRBw8woPz339R3ESbVGjZuO4",
  authDomain: "mmg-server-a8cf2.firebaseapp.com",
  databaseURL: "https://mmg-server-a8cf2-default-rtdb.firebaseio.com",
  projectId: "mmg-server-a8cf2",
  storageBucket: "mmg-server-a8cf2.firebasestorage.app",
  messagingSenderId: "812316801603",
  appId: "1:812316801603:web:441a0c8f8a9bce39cab2f6"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);


// ========================================
// HTML
// ========================================

const menu = document.querySelector("#menu");

const nameInput = document.querySelector("#player-name");
const colorInput = document.querySelector("#player-color");
const gamemodeSelect = document.querySelector("#gamemode");

const singleplayerButton = document.querySelector("#singleplayer");
const createButton = document.querySelector("#create-room");
const joinButton = document.querySelector("#join-room");

const roomInput = document.querySelector("#room-code");
const menuStatus = document.querySelector("#menu-status");

const gameUI = document.querySelector("#game-ui");
const gameStatus = document.querySelector("#game-status");
const coordinates = document.querySelector("#coordinates");
const modeStatus = document.querySelector("#mode-status");

const startRoundButton = document.querySelector("#start-round");
const leaveButton = document.querySelector("#leave-game");

const countdown = document.querySelector("#countdown");

const pauseMenu = document.querySelector("#pause-menu");
const resumeButton = document.querySelector("#resume-game");
const pauseExitButton = document.querySelector("#pause-exit");

const exitMenu = document.querySelector("#exit-menu");
const exitMessage = document.querySelector("#exit-message");
const confirmExitButton = document.querySelector("#confirm-exit");
const cancelExitButton = document.querySelector("#cancel-exit");

const deathMenu = document.querySelector("#death-menu");
const deathStatus = document.querySelector("#death-status");
const deathExitButton = document.querySelector("#death-exit");


// ========================================
// CANVAS
// ========================================

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

function resize() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
}

addEventListener("resize", resize);
resize();


// ========================================
// PLAYER
// ========================================

const playerId = crypto.randomUUID();

const player = {
  x: 0,
  y: 0,

  size: 40,
  speed: 4,

  name: "Cubey",
  color: "#ffffff",

  alive: true
};

const players = {};


// ========================================
// CAMERA
// ========================================

const camera = {
  x: 0,
  y: 0
};

function resetCamera() {
  camera.x = player.x;
  camera.y = player.y;
}

function updateCamera() {
  const smoothness = 0.12;

  camera.x +=
    (player.x - camera.x) *
    smoothness;

  camera.y +=
    (player.y - camera.y) *
    smoothness;
}

function worldToScreenX(worldX) {
  return (
    worldX -
    camera.x +
    canvas.width / 2 -
    player.size / 2
  );
}

function worldToScreenY(worldY) {
  return (
    worldY -
    camera.y +
    canvas.height / 2 -
    player.size / 2
  );
}


// ========================================
// GAME STATE
// ========================================

let playing = false;
let paused = false;
let multiplayer = false;

let room = null;
let myPlayerRef = null;

let currentGamemode = "free-roam";

let hostPlayerId = null;

let unsubscribePlayers = null;
let unsubscribeGamemode = null;
let unsubscribeRoundState = null;
let unsubscribeCountdown = null;
let unsubscribeTag = null;
let unsubscribeHost = null;

let roundState = "running";
let countdownStartedAt = null;

let tagPlayerId = null;
let lastTagTime = 0;

let lastNetworkSend = 0;
const NETWORK_INTERVAL = 50;


// ========================================
// HOST
// ========================================

function amIHost() {
  /*
    Singleplayer is always effectively host.
  */

  if (!multiplayer) {
    return true;
  }

  return hostPlayerId === playerId;
}


// ========================================
// TRAILS
// ========================================

const trails = [];

let lastTrailTime = 0;

function addTrail(now) {
  if (
    now - lastTrailTime <
    70
  ) {
    return;
  }

  trails.push({
    x:
      player.x +
      player.size / 2,

    y:
      player.y +
      player.size / 2,

    color:
      player.color,

    created:
      now
  });

  lastTrailTime = now;
}

function updateTrails(now) {
  for (
    let i =
      trails.length - 1;

    i >= 0;

    i--
  ) {
    if (
      now -
      trails[i].created >
      500
    ) {
      trails.splice(i, 1);
    }
  }
}


// ========================================
// SURVIVAL
// ========================================

const hazards = [];

let survivalStartTime = 0;
let lastHazardSpawn = 0;
let checkingSurvivalEnd = false;

function prepareSurvival() {
  hazards.length = 0;

  player.alive = true;

  deathMenu.classList.add(
    "hidden"
  );

  updateModeStatus();
}

function beginSurvival() {
  hazards.length = 0;

  player.alive = true;

  survivalStartTime =
    performance.now();

  lastHazardSpawn =
    performance.now();

  deathMenu.classList.add(
    "hidden"
  );

  if (
    multiplayer &&
    myPlayerRef
  ) {
    firebaseUpdate(
      myPlayerRef,
      {
        alive: true
      }
    ).catch(console.error);
  }

  updateModeStatus();
}

function spawnHazard() {
  const width =
    30 +
    Math.random() * 40;

  const height =
    30 +
    Math.random() * 40;

  hazards.push({
    x:
      player.x -
      canvas.width / 2 +
      Math.random() *
      canvas.width,

    y:
      player.y -
      canvas.height / 2 -
      100,

    width,
    height,

    speed:
      2.5 +
      Math.random() * 2.5
  });
}

function updateSurvival(now) {
  if (
    currentGamemode !==
      "survival" ||
    roundState !==
      "running" ||
    !player.alive
  ) {
    return;
  }

  const seconds =
    (
      now -
      survivalStartTime
    ) / 1000;

  const spawnDelay =
    Math.max(
      250,
      900 -
      seconds * 10
    );

  if (
    now -
    lastHazardSpawn >=
    spawnDelay
  ) {
    spawnHazard();

    lastHazardSpawn =
      now;
  }


  for (
    const hazard
    of hazards
  ) {
    hazard.y +=
      hazard.speed;
  }


  for (
    let i =
      hazards.length - 1;

    i >= 0;

    i--
  ) {
    if (
      hazards[i].y >
      player.y +
      canvas.height +
      500
    ) {
      hazards.splice(
        i,
        1
      );
    }
  }


  for (
    const hazard
    of hazards
  ) {
    if (
      rectanglesTouch(
        player.x,
        player.y,
        player.size,
        player.size,

        hazard.x,
        hazard.y,
        hazard.width,
        hazard.height
      )
    ) {
      killPlayer();
      break;
    }
  }
}

async function killPlayer() {
  if (!player.alive) {
    return;
  }

  player.alive = false;

  clearKeys();

  deathStatus.textContent =
    "waiting for the round to end...";

  deathMenu.classList.remove(
    "hidden"
  );


  if (
    multiplayer &&
    myPlayerRef
  ) {
    try {
      await firebaseUpdate(
        myPlayerRef,
        {
          alive: false
        }
      );
    } catch (error) {
      console.error(error);
    }

    checkSurvivalRoundEnd();
  } else {
    finishSingleplayerSurvival();
  }


  updateModeStatus();
}

function finishSingleplayerSurvival() {
  roundState = "waiting";

  hazards.length = 0;

  deathMenu.classList.add(
    "hidden"
  );

  player.alive = true;

  updateRoundButton();
  updateModeStatus();
}

async function checkSurvivalRoundEnd() {
  if (
    checkingSurvivalEnd ||
    !multiplayer ||
    currentGamemode !==
      "survival" ||
    roundState !==
      "running"
  ) {
    return;
  }

  checkingSurvivalEnd = true;

  try {
    const snapshot =
      await get(
        ref(
          db,
          `rooms/${room}/players`
        )
      );

    const data =
      snapshot.val() || {};

    const ids =
      Object.keys(data);

    if (
      ids.length === 0
    ) {
      return;
    }

    const everybodyDead =
      ids.every(
        id =>
          data[id].alive ===
          false
      );

    if (everybodyDead) {
      await runTransaction(
        ref(
          db,
          `rooms/${room}/roundState`
        ),

        current => {
          if (
            current ===
            "running"
          ) {
            return "waiting";
          }

          return current;
        }
      );
    }

  } catch (error) {
    console.error(error);

  } finally {
    checkingSurvivalEnd = false;
  }
}


// ========================================
// CONTROLS
// ========================================

const keys = {};

addEventListener(
  "keydown",

  event => {
    const key =
      event.key.toLowerCase();


    if (
      key === "escape" &&
      playing
    ) {
      event.preventDefault();


      if (
        !exitMenu.classList.contains(
          "hidden"
        )
      ) {
        closeExitMenu();
        return;
      }


      if (
        !deathMenu.classList.contains(
          "hidden"
        )
      ) {
        return;
      }


      if (paused) {
        resumeGame();
      } else {
        pauseGame();
      }

      return;
    }


    if (
      !playing ||
      paused ||
      !player.alive
    ) {
      return;
    }


    if (
      roundState ===
      "countdown"
    ) {
      return;
    }


    keys[key] = true;
  }
);


addEventListener(
  "keyup",

  event => {
    keys[
      event.key.toLowerCase()
    ] = false;
  }
);


function clearKeys() {
  for (
    const key
    in keys
  ) {
    keys[key] = false;
  }
}


addEventListener(
  "blur",
  clearKeys
);


// ========================================
// PAUSE
// ========================================

function pauseGame() {
  if (!playing) {
    return;
  }

  paused = true;

  clearKeys();

  pauseMenu.classList.remove(
    "hidden"
  );
}

function resumeGame() {
  paused = false;

  clearKeys();

  pauseMenu.classList.add(
    "hidden"
  );
}

resumeButton.addEventListener(
  "click",
  resumeGame
);


// ========================================
// EXIT MESSAGES
// ========================================

const exitMessages = [
  "abandoning cubey? :(",
  "cubey will remember this",
  "touching grass already?",
  "cowardice detected",
  "fine. leave.",
  "🧊 goodbye gamer",
  "bro JUST got here 😭",
  "the cubes will miss you",
  "leaving the cube dimension?",
  "you sure about that chief?"
];

function openExitMenu() {
  if (!playing) {
    return;
  }

  clearKeys();

  pauseMenu.classList.add(
    "hidden"
  );

  deathMenu.classList.add(
    "hidden"
  );

  paused = true;

  const message =
    exitMessages[
      Math.floor(
        Math.random() *
        exitMessages.length
      )
    ];

  exitMessage.textContent =
    message;

  exitMenu.classList.remove(
    "hidden"
  );
}

function closeExitMenu() {
  exitMenu.classList.add(
    "hidden"
  );

  paused = false;

  clearKeys();

  if (
    currentGamemode ===
      "survival" &&
    !player.alive
  ) {
    deathMenu.classList.remove(
      "hidden"
    );
  }
}

pauseExitButton.addEventListener(
  "click",
  openExitMenu
);

leaveButton.addEventListener(
  "click",
  openExitMenu
);

deathExitButton.addEventListener(
  "click",
  openExitMenu
);

cancelExitButton.addEventListener(
  "click",
  closeExitMenu
);

confirmExitButton.addEventListener(
  "click",
  leaveGame
);


// ========================================
// PLAYER SETTINGS
// ========================================

function getPlayerName() {
  const name =
    nameInput.value.trim();

  if (name) {
    return name.substring(
      0,
      16
    );
  }

  return "Cubey";
}

function applyPlayerSettings() {
  player.name =
    getPlayerName();

  player.color =
    colorInput.value;

  currentGamemode =
    gamemodeSelect.value;
}


// ========================================
// RESET
// ========================================

function resetPlayer() {
  player.x = 0;
  player.y = 0;

  player.alive = true;

  trails.length = 0;
  hazards.length = 0;

  resetCamera();

  lastNetworkSend = 0;
}

function prepareGamemode() {
  lastTagTime = 0;

  countdownStartedAt = null;

  hazards.length = 0;

  if (
    currentGamemode ===
    "free-roam"
  ) {
    roundState = "running";

    player.alive = true;
  } else {
    roundState = "waiting";

    player.alive = true;
  }

  deathMenu.classList.add(
    "hidden"
  );

  countdown.classList.add(
    "hidden"
  );

  updateRoundButton();
  updateModeStatus();
}


// ========================================
// ROOM CODE
// ========================================

function generateRoomCode() {
  const characters =
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let code = "";

  for (
    let i = 0;
    i < 4;
    i++
  ) {
    code +=
      characters[
        Math.floor(
          Math.random() *
          characters.length
        )
      ];
  }

  return code;
}


// ========================================
// SINGLEPLAYER
// ========================================

function startSingleplayer() {
  applyPlayerSettings();

  playing = true;
  paused = false;

  multiplayer = false;

  room = null;
  myPlayerRef = null;

  hostPlayerId = playerId;
  tagPlayerId = null;

  resetPlayer();
  clearRemotePlayers();

  prepareGamemode();

  menu.classList.add(
    "hidden"
  );

  gameUI.classList.remove(
    "hidden"
  );

  pauseMenu.classList.add(
    "hidden"
  );

  exitMenu.classList.add(
    "hidden"
  );

  deathMenu.classList.add(
    "hidden"
  );

  updateGameStatus();
  updateCoordinates();
  updateModeStatus();
  updateRoundButton();
}


// ========================================
// MULTIPLAYER
// ========================================

async function enterRoom(
  code,
  createdRoom = false
) {
  const cleanedCode =
    code
      .trim()
      .toUpperCase()
      .substring(0, 4);


  if (!cleanedCode) {
    menuStatus.textContent =
      "enter a room code";

    return;
  }


  applyPlayerSettings();

  room = cleanedCode;

  multiplayer = true;
  playing = true;
  paused = false;

  resetPlayer();
  clearRemotePlayers();


  const roomRef =
    ref(
      db,
      `rooms/${room}`
    );

  const hostRef =
    ref(
      db,
      `rooms/${room}/host`
    );

  const gamemodeRef =
    ref(
      db,
      `rooms/${room}/gamemode`
    );

  const roundStateRef =
    ref(
      db,
      `rooms/${room}/roundState`
    );

  const countdownRef =
    ref(
      db,
      `rooms/${room}/countdown`
    );

  const tagRef =
    ref(
      db,
      `rooms/${room}/tagPlayer`
    );


  if (!createdRoom) {
    const roomSnapshot =
      await get(roomRef);


    if (
      !roomSnapshot.exists()
    ) {
      playing = false;
      multiplayer = false;

      room = null;

      menuStatus.textContent =
        "room doesn't exist";

      return;
    }


    const mode =
      roomSnapshot
        .child("gamemode")
        .val();


    if (mode) {
      currentGamemode =
        mode;
    }


    hostPlayerId =
      roomSnapshot
        .child("host")
        .val();
  }


  myPlayerRef =
    ref(
      db,
      `rooms/${room}/players/${playerId}`
    );


  await onDisconnect(
    myPlayerRef
  ).remove();


  if (createdRoom) {

    /*
      CREATOR BECOMES HOST.
    */

    hostPlayerId =
      playerId;


    await set(
      hostRef,
      playerId
    );


    /*
      If the host's connection dies,
      remove the host field.

      This does NOT automatically transfer
      host yet. That's a future Cubey problem.
    */

    await onDisconnect(
      hostRef
    ).remove();


    await set(
      gamemodeRef,
      currentGamemode
    );


    if (
      currentGamemode ===
      "free-roam"
    ) {
      await set(
        roundStateRef,
        "running"
      );
    } else {
      await set(
        roundStateRef,
        "waiting"
      );
    }


    await remove(
      countdownRef
    );

    await remove(
      tagRef
    );
  }


  await set(
    myPlayerRef,
    {
      x:
        player.x,

      y:
        player.y,

      name:
        player.name,

      color:
        player.color,

      alive:
        true
    }
  );


  const roomPlayersRef =
    ref(
      db,
      `rooms/${room}/players`
    );


  unsubscribePlayers =
    onValue(
      roomPlayersRef,

      snapshot => {
        const data =
          snapshot.val() || {};

        clearRemotePlayers();

        Object.assign(
          players,
          data
        );

        updateGameStatus();
        updateModeStatus();

        if (
          currentGamemode ===
            "survival" &&
          roundState ===
            "running"
        ) {
          const ids =
            Object.keys(data);

          if (
            ids.length > 0 &&
            ids.every(
              id =>
                data[id].alive ===
                false
            )
          ) {
            checkSurvivalRoundEnd();
          }
        }
      }
    );


  /*
    HOST LISTENER

    Everyone knows who owns the room.
  */

  unsubscribeHost =
    onValue(
      hostRef,

      snapshot => {
        hostPlayerId =
          snapshot.val();

        updateRoundButton();
        updateModeStatus();
      }
    );


  unsubscribeGamemode =
    onValue(
      gamemodeRef,

      snapshot => {
        const mode =
          snapshot.val();

        if (!mode) {
          return;
        }

        currentGamemode =
          mode;

        updateGameStatus();
        updateModeStatus();
        updateRoundButton();
      }
    );


  unsubscribeRoundState =
    onValue(
      roundStateRef,

      snapshot => {
        const newState =
          snapshot.val();

        if (!newState) {
          return;
        }

        const oldState =
          roundState;

        roundState =
          newState;


        if (
          roundState ===
          "countdown"
        ) {
          clearKeys();
        }


        if (
          oldState !==
            "running" &&
          roundState ===
            "running" &&
          currentGamemode ===
            "survival"
        ) {
          beginSurvival();
        }


        if (
          roundState ===
            "waiting" &&
          currentGamemode ===
            "survival"
        ) {
          prepareSurvival();
        }


        if (
          roundState ===
          "running"
        ) {
          countdown.classList.add(
            "hidden"
          );
        }


        updateRoundButton();
        updateModeStatus();
      }
    );


  unsubscribeCountdown =
    onValue(
      countdownRef,

      snapshot => {
        countdownStartedAt =
          snapshot.val();

        if (
          countdownStartedAt
        ) {
          clearKeys();
        }
      }
    );


  unsubscribeTag =
    onValue(
      tagRef,

      snapshot => {
        tagPlayerId =
          snapshot.val();

        updateModeStatus();
      }
    );


  roomInput.value =
    room;


  menu.classList.add(
    "hidden"
  );

  gameUI.classList.remove(
    "hidden"
  );

  pauseMenu.classList.add(
    "hidden"
  );

  exitMenu.classList.add(
    "hidden"
  );

  deathMenu.classList.add(
    "hidden"
  );


  updateGameStatus();
  updateCoordinates();
  updateModeStatus();
  updateRoundButton();
}


// ========================================
// START ROUND
// ========================================

startRoundButton.addEventListener(
  "click",
  startRound
);

async function startRound() {
  if (
    currentGamemode ===
      "free-roam" ||
    roundState !==
      "waiting"
  ) {
    return;
  }


  /*
    EXTRA CHECK:

    Even if somebody manually unhides the
    button in DevTools, a non-host client
    won't start the round through this code.
  */

  if (
    multiplayer &&
    !amIHost()
  ) {
    return;
  }


  /*
    SINGLEPLAYER
  */

  if (!multiplayer) {
    resetPlayer();

    if (
      currentGamemode ===
      "tag"
    ) {
      tagPlayerId =
        playerId;
    }


    roundState =
      "countdown";

    countdownStartedAt =
      Date.now();

    clearKeys();

    updateRoundButton();
    updateModeStatus();

    return;
  }


  /*
    MULTIPLAYER HOST ONLY
  */

  const stateRef =
    ref(
      db,
      `rooms/${room}/roundState`
    );


  const transaction =
    await runTransaction(
      stateRef,

      current => {
        if (
          current ===
            "waiting" ||
          current ===
            null
        ) {
          return "starting";
        }

        return;
      }
    );


  if (
    !transaction.committed
  ) {
    return;
  }


  const playersRef =
    ref(
      db,
      `rooms/${room}/players`
    );

  const snapshot =
    await get(playersRef);

  const currentPlayers =
    snapshot.val() || {};

  const ids =
    Object.keys(
      currentPlayers
    );


  if (
    ids.length === 0
  ) {
    await set(
      stateRef,
      "waiting"
    );

    return;
  }


  const updates = {};

  for (
    const id
    of ids
  ) {
    updates[
      `${id}/alive`
    ] = true;
  }


  await firebaseUpdate(
    playersRef,
    updates
  );


  /*
    TAG:
    HOST PICKS ONE RANDOM CONNECTED PLAYER.
  */

  if (
    currentGamemode ===
    "tag"
  ) {
    const randomId =
      ids[
        Math.floor(
          Math.random() *
          ids.length
        )
      ];


    await set(
      ref(
        db,
        `rooms/${room}/tagPlayer`
      ),
      randomId
    );
  }


  const startedAt =
    Date.now();


  await set(
    ref(
      db,
      `rooms/${room}/countdown`
    ),
    startedAt
  );


  await set(
    stateRef,
    "countdown"
  );
}


// ========================================
// COUNTDOWN
// ========================================

let finishingCountdown =
  false;

async function updateCountdown() {
  if (
    (
      currentGamemode !==
        "tag" &&
      currentGamemode !==
        "survival"
    ) ||
    roundState !==
      "countdown" ||
    !countdownStartedAt
  ) {
    countdown.classList.add(
      "hidden"
    );

    return;
  }


  const elapsed =
    Date.now() -
    countdownStartedAt;


  let text = "";


  if (
    elapsed < 1000
  ) {
    text = "3";

  } else if (
    elapsed < 2000
  ) {
    text = "2";

  } else if (
    elapsed < 3000
  ) {
    text = "1";

  } else if (
    elapsed < 3500
  ) {
    text = "GO";

  } else {

    countdown.classList.add(
      "hidden"
    );


    if (
      finishingCountdown
    ) {
      return;
    }


    /*
      Only the HOST advances multiplayer
      countdown -> running.

      Everyone else just waits for Firebase.
    */

    if (
      multiplayer &&
      !amIHost()
    ) {
      return;
    }


    finishingCountdown =
      true;


    if (multiplayer) {
      try {
        await runTransaction(
          ref(
            db,
            `rooms/${room}/roundState`
          ),

          current => {
            if (
              current ===
              "countdown"
            ) {
              return "running";
            }

            return current;
          }
        );
      } catch (error) {
        console.error(error);
      }

    } else {
      roundState =
        "running";

      if (
        currentGamemode ===
        "survival"
      ) {
        beginSurvival();
      }

      updateRoundButton();
      updateModeStatus();
    }


    finishingCountdown =
      false;

    return;
  }


  countdown.textContent =
    text;

  countdown.classList.remove(
    "hidden"
  );
}


// ========================================
// START BUTTON
// ========================================

function updateRoundButton() {
  /*
    Free roam NEVER gets one.
  */

  if (
    currentGamemode ===
    "free-roam"
  ) {
    startRoundButton.classList.add(
      "hidden"
    );

    return;
  }


  if (
    roundState !==
    "waiting"
  ) {
    startRoundButton.classList.add(
      "hidden"
    );

    return;
  }


  /*
    Multiplayer guests cannot see it.
  */

  if (
    multiplayer &&
    !amIHost()
  ) {
    startRoundButton.classList.add(
      "hidden"
    );

    return;
  }


  if (
    currentGamemode ===
    "tag"
  ) {
    startRoundButton.textContent =
      "start tag";

    startRoundButton.classList.remove(
      "hidden"
    );

    return;
  }


  if (
    currentGamemode ===
    "survival"
  ) {
    startRoundButton.textContent =
      "start survival";

    startRoundButton.classList.remove(
      "hidden"
    );

    return;
  }


  startRoundButton.classList.add(
    "hidden"
  );
}


// ========================================
// MENU BUTTONS
// ========================================

singleplayerButton.addEventListener(
  "click",
  startSingleplayer
);


createButton.addEventListener(
  "click",

  () => {
    const code =
      generateRoomCode();

    enterRoom(
      code,
      true
    );
  }
);


joinButton.addEventListener(
  "click",

  () => {
    enterRoom(
      roomInput.value,
      false
    );
  }
);


roomInput.addEventListener(
  "keydown",

  event => {
    if (
      event.key ===
      "Enter"
    ) {
      joinButton.click();
    }
  }
);


// ========================================
// LEAVE
// ========================================

async function leaveGame() {
  playing = false;
  paused = false;

  clearKeys();


  pauseMenu.classList.add(
    "hidden"
  );

  exitMenu.classList.add(
    "hidden"
  );

  deathMenu.classList.add(
    "hidden"
  );

  countdown.classList.add(
    "hidden"
  );


  if (myPlayerRef) {
    try {
      await remove(
        myPlayerRef
      );
    } catch (error) {
      console.error(error);
    }
  }


  if (
    unsubscribePlayers
  ) {
    unsubscribePlayers();

    unsubscribePlayers =
      null;
  }


  if (
    unsubscribeHost
  ) {
    unsubscribeHost();

    unsubscribeHost =
      null;
  }


  if (
    unsubscribeGamemode
  ) {
    unsubscribeGamemode();

    unsubscribeGamemode =
      null;
  }


  if (
    unsubscribeRoundState
  ) {
    unsubscribeRoundState();

    unsubscribeRoundState =
      null;
  }


  if (
    unsubscribeCountdown
  ) {
    unsubscribeCountdown();

    unsubscribeCountdown =
      null;
  }


  if (
    unsubscribeTag
  ) {
    unsubscribeTag();

    unsubscribeTag =
      null;
  }


  clearRemotePlayers();


  multiplayer = false;

  room = null;
  myPlayerRef = null;

  hostPlayerId = null;
  tagPlayerId = null;

  roundState =
    "running";

  countdownStartedAt =
    null;

  hazards.length = 0;
  trails.length = 0;

  resetPlayer();


  menu.classList.remove(
    "hidden"
  );

  gameUI.classList.add(
    "hidden"
  );


  menuStatus.textContent =
    "";
}


// ========================================
// PLAYERS
// ========================================

function clearRemotePlayers() {
  for (
    const id
    in players
  ) {
    delete players[id];
  }
}


function getPlayerCount() {
  if (!multiplayer) {
    return 1;
  }

  return Object.keys(
    players
  ).length;
}


// ========================================
// HUD
// ========================================

function gamemodeName(mode) {
  if (
    mode ===
    "free-roam"
  ) {
    return "free roam";
  }

  if (
    mode ===
    "tag"
  ) {
    return "tag";
  }

  if (
    mode ===
    "survival"
  ) {
    return "survival";
  }

  return mode;
}


function updateGameStatus() {
  const mode =
    gamemodeName(
      currentGamemode
    );


  if (multiplayer) {
    const count =
      getPlayerCount();

    gameStatus.textContent =
      `${room} · ${mode} · ${count} player${count === 1 ? "" : "s"}`;
  } else {
    gameStatus.textContent =
      `singleplayer · ${mode}`;
  }
}


function updateCoordinates() {
  coordinates.textContent =
    `x: ${Math.round(player.x)} · y: ${Math.round(player.y)}`;
}


function updateModeStatus() {
  if (
    currentGamemode ===
    "free-roam"
  ) {
    modeStatus.textContent =
      "";

    return;
  }


  if (
    roundState ===
    "waiting"
  ) {
    if (
      multiplayer &&
      !amIHost()
    ) {
      modeStatus.textContent =
        "waiting for host";
    } else {
      modeStatus.textContent =
        "waiting to start";
    }

    return;
  }


  if (
    roundState ===
      "starting" ||
    roundState ===
      "countdown"
  ) {
    modeStatus.textContent =
      "get ready";

    return;
  }


  if (
    currentGamemode ===
    "tag"
  ) {
    if (
      tagPlayerId ===
      playerId
    ) {
      modeStatus.textContent =
        "YOU'RE IT";
    } else {
      modeStatus.textContent =
        "don't get tagged";
    }

    return;
  }


  if (
    currentGamemode ===
    "survival"
  ) {
    if (
      !player.alive
    ) {
      modeStatus.textContent =
        "eliminated";
    } else {
      modeStatus.textContent =
        "stay alive";
    }

    return;
  }


  modeStatus.textContent =
    "";
}


// ========================================
// COLLISION
// ========================================

function rectanglesTouch(
  ax,
  ay,
  aw,
  ah,

  bx,
  by,
  bw,
  bh
) {
  return (
    ax < bx + bw &&
    ax + aw > bx &&
    ay < by + bh &&
    ay + ah > by
  );
}


// ========================================
// TAG
// ========================================

async function updateTag(now) {
  if (
    currentGamemode !==
      "tag" ||
    roundState !==
      "running" ||
    !multiplayer ||
    tagPlayerId !==
      playerId
  ) {
    return;
  }


  if (
    now -
    lastTagTime <
    1000
  ) {
    return;
  }


  for (
    const id
    in players
  ) {
    if (
      id ===
      playerId
    ) {
      continue;
    }


    const other =
      players[id];


    if (
      typeof other.x !==
        "number" ||
      typeof other.y !==
        "number"
    ) {
      continue;
    }


    if (
      rectanglesTouch(
        player.x,
        player.y,
        player.size,
        player.size,

        other.x,
        other.y,
        player.size,
        player.size
      )
    ) {
      lastTagTime =
        now;


      try {
        await runTransaction(
          ref(
            db,
            `rooms/${room}/tagPlayer`
          ),

          current => {
            if (
              current ===
              playerId
            ) {
              return id;
            }

            return current;
          }
        );
      } catch (error) {
        console.error(error);
      }


      break;
    }
  }
}


// ========================================
// MOVEMENT
// ========================================

function update(now) {
  if (!playing) {
    return;
  }


  updateCountdown();


  if (
    paused ||
    !player.alive
  ) {
    updateCamera();
    updateTrails(now);

    return;
  }


  if (
    roundState ===
    "countdown"
  ) {
    updateCamera();
    updateCoordinates();
    updateTrails(now);

    return;
  }


  const oldX =
    player.x;

  const oldY =
    player.y;


  if (
    keys.w ||
    keys.arrowup
  ) {
    player.y -=
      player.speed;
  }


  if (
    keys.s ||
    keys.arrowdown
  ) {
    player.y +=
      player.speed;
  }


  if (
    keys.a ||
    keys.arrowleft
  ) {
    player.x -=
      player.speed;
  }


  if (
    keys.d ||
    keys.arrowright
  ) {
    player.x +=
      player.speed;
  }


  const moved =
    oldX !== player.x ||
    oldY !== player.y;


  if (moved) {
    addTrail(now);
  }


  updateTrails(now);
  updateCamera();
  updateCoordinates();


  if (
    currentGamemode ===
    "survival"
  ) {
    updateSurvival(now);
  }


  if (
    currentGamemode ===
    "tag"
  ) {
    updateTag(now);
  }


  if (
    multiplayer &&
    myPlayerRef &&
    moved &&
    now -
      lastNetworkSend >=
      NETWORK_INTERVAL
  ) {
    firebaseUpdate(
      myPlayerRef,

      {
        x:
          player.x,

        y:
          player.y,

        name:
          player.name,

        color:
          player.color,

        alive:
          player.alive
      }
    ).catch(
      console.error
    );


    lastNetworkSend =
      now;
  }
}


// ========================================
// GRID
// ========================================

function drawGrid() {
  const gridSize =
    100;


  const left =
    camera.x -
    canvas.width / 2;

  const top =
    camera.y -
    canvas.height / 2;


  const startX =
    Math.floor(
      left / gridSize
    ) * gridSize;

  const startY =
    Math.floor(
      top / gridSize
    ) * gridSize;


  ctx.beginPath();

  ctx.strokeStyle =
    "#1d1d1d";

  ctx.lineWidth =
    1;


  for (
    let worldX =
      startX;

    worldX <
      left +
      canvas.width +
      gridSize;

    worldX +=
      gridSize
  ) {
    const screenX =
      worldX -
      camera.x +
      canvas.width / 2;


    ctx.moveTo(
      Math.round(
        screenX
      ) + 0.5,
      0
    );

    ctx.lineTo(
      Math.round(
        screenX
      ) + 0.5,
      canvas.height
    );
  }


  for (
    let worldY =
      startY;

    worldY <
      top +
      canvas.height +
      gridSize;

    worldY +=
      gridSize
  ) {
    const screenY =
      worldY -
      camera.y +
      canvas.height / 2;


    ctx.moveTo(
      0,
      Math.round(
        screenY
      ) + 0.5
    );

    ctx.lineTo(
      canvas.width,
      Math.round(
        screenY
      ) + 0.5
    );
  }


  ctx.stroke();
}


// ========================================
// ORIGIN
// ========================================

function drawOrigin() {
  const x =
    0 -
    camera.x +
    canvas.width / 2;

  const y =
    0 -
    camera.y +
    canvas.height / 2;


  if (
    x < -100 ||
    x >
      canvas.width + 100 ||
    y < -100 ||
    y >
      canvas.height + 100
  ) {
    return;
  }


  ctx.strokeStyle =
    "#444";

  ctx.lineWidth =
    2;


  ctx.beginPath();

  ctx.moveTo(
    x - 15,
    y
  );

  ctx.lineTo(
    x + 15,
    y
  );

  ctx.moveTo(
    x,
    y - 15
  );

  ctx.lineTo(
    x,
    y + 15
  );

  ctx.stroke();


  ctx.fillStyle =
    "#666";

  ctx.font =
    "11px monospace";

  ctx.textAlign =
    "left";

  ctx.textBaseline =
    "top";


  ctx.fillText(
    "0, 0",
    x + 8,
    y + 8
  );
}


// ========================================
// TRAILS
// ========================================

function drawTrails(now) {
  for (
    const trail
    of trails
  ) {
    const age =
      now -
      trail.created;

    const alpha =
      Math.max(
        0,
        1 -
        age / 500
      );


    const x =
      worldToScreenX(
        trail.x
      ) +
      player.size / 2;

    const y =
      worldToScreenY(
        trail.y
      ) +
      player.size / 2;


    ctx.globalAlpha =
      alpha * 0.35;

    ctx.fillStyle =
      trail.color;


    const size =
      8 * alpha;


    ctx.fillRect(
      x -
      size / 2,

      y -
      size / 2,

      size,
      size
    );
  }


  ctx.globalAlpha =
    1;
}


// ========================================
// HAZARDS
// ========================================

function drawHazards() {
  if (
    currentGamemode !==
      "survival" ||
    roundState !==
      "running"
  ) {
    return;
  }


  ctx.fillStyle =
    "#c92d2d";


  for (
    const hazard
    of hazards
  ) {
    const x =
      worldToScreenX(
        hazard.x
      );

    const y =
      worldToScreenY(
        hazard.y
      );


    ctx.fillRect(
      x,
      y,
      hazard.width,
      hazard.height
    );
  }
}


// ========================================
// CUBEY
// ========================================

function drawCubey(
  cubey,
  id,
  isLocal = false
) {
  const size =
    player.size;


  const screenX =
    worldToScreenX(
      cubey.x
    );

  const screenY =
    worldToScreenY(
      cubey.y
    );


  if (
    screenX < -100 ||
    screenX >
      canvas.width + 100 ||
    screenY < -100 ||
    screenY >
      canvas.height + 100
  ) {
    return;
  }


  if (
    cubey.alive ===
    false
  ) {
    ctx.globalAlpha =
      0.25;
  }


  ctx.fillStyle =
    cubey.color ||
    "#ffffff";


  ctx.fillRect(
    screenX,
    screenY,
    size,
    size
  );


  ctx.globalAlpha =
    1;


  ctx.font =
    "14px Arial";

  ctx.textAlign =
    "center";

  ctx.textBaseline =
    "bottom";

  ctx.fillStyle =
    "#ffffff";


  let label =
    cubey.name ||
    "Cubey";


  if (
    multiplayer &&
    id ===
      hostPlayerId
  ) {
    label +=
      " · HOST";
  }


  if (
    currentGamemode ===
      "tag" &&
    roundState ===
      "running" &&
    id ===
      tagPlayerId
  ) {
    label +=
      " · IT";
  }


  if (
    currentGamemode ===
      "survival" &&
    cubey.alive ===
      false
  ) {
    label +=
      " · dead";
  }


  ctx.fillText(
    label,
    screenX +
      size / 2,
    screenY - 5
  );


  if (isLocal) {
    ctx.fillStyle =
      "#ffffff";

    ctx.fillRect(
      screenX +
        size / 2 -
        2,

      screenY +
        size +
        4,

      4,
      4
    );
  }
}


// ========================================
// DRAW
// ========================================

function draw(now) {
  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );


  if (!playing) {
    return;
  }


  drawGrid();
  drawOrigin();

  drawTrails(now);
  drawHazards();


  if (multiplayer) {
    for (
      const id
      in players
    ) {
      drawCubey(
        players[id],
        id,
        id === playerId
      );
    }


    if (
      !players[
        playerId
      ]
    ) {
      drawCubey(
        player,
        playerId,
        true
      );
    }

  } else {

    drawCubey(
      player,
      playerId,
      true
    );
  }
}


// ========================================
// LOOP
// ========================================

function loop(now) {
  update(now);
  draw(now);

  requestAnimationFrame(
    loop
  );
}


requestAnimationFrame(
  loop
);
