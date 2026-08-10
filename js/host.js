import {
  createRoom,
  getRoomByCode,
  getPlayers,
  updateRoom
} from "./database.js";

import { createInitialRoomState, addOrUpdatePlayer, generateRoomCode } from "./room.js";
import { createRoomChannel } from "./realtime.js";
import { registerGame } from "./games/game-engine.js";
import { buzzerGame } from "./games/buzzer.js";

async function persistRoomState() {
  await updateRoom(roomRecord.id, {
    blue_score: state.scores.blue,
    red_score: state.scores.red,

    current_game: state.game.id,
    game_status: state.game.status,

    buzzer_winner_id: state.game.winner?.playerId ?? null,
    buzzer_winner_name: state.game.winner?.playerName ?? null,
    buzzer_winner_team: state.game.winner?.team ?? null
  });
}

async function initializeHost() {
  const params = new URLSearchParams(window.location.search);
  const existingCode = params.get("room");

  if (existingCode) {
    roomCode = existingCode.toUpperCase();

    roomRecord = await getRoomByCode(roomCode);

    if (!roomRecord) {
      alert("Dieser Raum existiert nicht mehr.");
      window.location.href = "./index.html";
      return;
    }
  } else {
    roomCode = generateRoomCode();

    roomRecord = await createRoom(roomCode);

    window.history.replaceState(
      {},
      "",
      `./host.html?room=${roomCode}`
    );
  }

  const players = await getPlayers(roomRecord.id);

  state = {
    roomCode,

    scores: {
      blue: roomRecord.blue_score,
      red: roomRecord.red_score
    },

    players: players.map((player) => ({
      id: player.id,
      name: player.name,
      team: player.team
    })),

    game: {
      id: roomRecord.current_game,
      status: roomRecord.game_status,

      winner: roomRecord.buzzer_winner_id
        ? {
            playerId: roomRecord.buzzer_winner_id,
            playerName: roomRecord.buzzer_winner_name,
            team: roomRecord.buzzer_winner_team
          }
        : null
    }
  };

  $("room-code").textContent = roomCode;
  $("room-code-copy").textContent = roomCode;

  startRealtime();

  render();
}

registerGame(buzzerGame);

let roomCode;
let roomRecord;
let state;
let realtime;

const $ = (id) => document.getElementById(id);

function render() {
  $("blue-score").textContent = state.scores.blue;
  $("red-score").textContent = state.scores.red;

  renderPlayers("blue");
  renderPlayers("red");

  const status = state.game.status;
  const isOpen = status === "open";
  const isLocked = status === "locked";
  const winner = state.game.winner;

  $("buzzer-status").textContent =
    isOpen ? "Buzzer offen" :
    isLocked ? "Buzzer gesperrt" :
    "Buzzer geschlossen";

  $("buzzer-status").className = `status-pill ${isOpen ? "open" : "closed"}`;

  $("open-buzzer").disabled = isOpen;
  $("answer-controls").classList.toggle("hidden", !winner);

  if (winner) {
    const teamName = winner.team === "blue" ? "Team Blau" : "Team Rot";
    $("buzz-result").classList.add("winner");
    $("buzz-result").innerHTML = `
      <div>
        <strong>⚡ ${escapeHtml(winner.playerName)}</strong>
        <span>${teamName} hat zuerst gebuzzert</span>
      </div>
    `;
  } else {
    $("buzz-result").classList.remove("winner");
    $("buzz-result").innerHTML = isOpen
      ? "<strong>⚡ Buzzer ist offen!</strong>"
      : '<span class="muted">Öffne den Buzzer, sobald du die Frage gestellt hast.</span>';
  }
}

function renderPlayers(team) {
  const container = $(`${team}-players`);
  const players = state.players.filter((player) => player.team === team);

  if (!players.length) {
    container.innerHTML = '<span class="muted small">Noch kein Spieler</span>';
    return;
  }

  container.innerHTML = players
    .map((player) => `<div class="player-chip"><span>${escapeHtml(player.name)}</span><span>●</span></div>`)
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function broadcastState() {
  await realtime.send("room_state", structuredClone(state));
}

async function handleEvent(event, payload) {
  if (event === "player_join") {
    const player = payload.player;
    if (!player?.id || !player?.name || !["blue", "red"].includes(player?.team)) return;

    const accepted = addOrUpdatePlayer(state, player);

    await realtime.send("join_result", {
      playerId: player.id,
      accepted,
      reason: accepted ? null : "Dieses Team ist bereits voll."
    });

    render();
    await broadcastState();
    return;
  }

  if (event === "request_state") {
    await broadcastState();
    return;
  }

  if (event === "buzz") {
    const player = state.players.find(
      (item) => item.id === payload.playerId
    );
  
    if (!player) return;
  
    const accepted = buzzerGame.registerBuzz(state, player);
  
    if (!accepted) return;
  
    await persistRoomState();
  
    render();
  
    await broadcastState();
  }
}

function startRealtime() {
  realtime = createRoomChannel(roomCode, {
    onEvent: handleEvent,

    onStatus(status, error) {
      const online = status === "SUBSCRIBED";

      $("connection-dot").classList.toggle("online", online);

      $("connection-text").textContent =
        online ? "Live verbunden" : "Verbinde…";

      if (error) {
        console.error("Realtime error:", error);
      }
    }
  });

  realtime.subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      render();
      await broadcastState();
    }
  });
}

$("open-buzzer").addEventListener("click", async () => {
  buzzerGame.open(state);

  await persistRoomState();

  render();

  await broadcastState();
});

$("reset-buzzer").addEventListener("click", async () => {
  buzzerGame.reset(state);

  await persistRoomState();

  render();

  await broadcastState();
});

$("correct-answer").addEventListener("click", async () => {
  if (!buzzerGame.awardPoint(state)) return;

  buzzerGame.reset(state);

  await persistRoomState();

  render();

  await broadcastState();
});

$("wrong-answer").addEventListener("click", async () => {
  buzzerGame.reset(state);

  await persistRoomState();

  render();

  await broadcastState();
});

window.addEventListener("beforeunload", () => {
  realtime?.close();
});

initializeHost().catch((error) => {
  console.error(error);

  alert(
    "Der Raum konnte nicht gestartet werden. Siehe Browser-Konsole."
  );
});
