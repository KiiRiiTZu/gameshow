import { createInitialRoomState, addOrUpdatePlayer, generateRoomCode } from "./room.js";
import { createRoomChannel } from "./realtime.js";
import { registerGame } from "./games/game-engine.js";
import { buzzerGame } from "./games/buzzer.js";

registerGame(buzzerGame);

const roomCode = generateRoomCode();
const state = createInitialRoomState(roomCode);

const $ = (id) => document.getElementById(id);

$("room-code").textContent = roomCode;
$("room-code-copy").textContent = roomCode;

let realtime;

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
    const player = state.players.find((item) => item.id === payload.playerId);
    if (!player) return;

    const accepted = buzzerGame.registerBuzz(state, player);
    if (!accepted) return;

    render();
    await broadcastState();
  }
}

realtime = createRoomChannel(roomCode, {
  onEvent: handleEvent,
  onStatus(status, error) {
    const online = status === "SUBSCRIBED";
    $("connection-dot").classList.toggle("online", online);
    $("connection-text").textContent = online ? "Live verbunden" : "Verbinde…";
    if (error) console.error("Realtime error:", error);
  }
});

realtime.subscribe(async (status) => {
  if (status === "SUBSCRIBED") {
    render();
    await broadcastState();
  }
});

$("open-buzzer").addEventListener("click", async () => {
  buzzerGame.open(state);
  render();
  await broadcastState();
});

$("reset-buzzer").addEventListener("click", async () => {
  buzzerGame.reset(state);
  render();
  await broadcastState();
});

$("correct-answer").addEventListener("click", async () => {
  if (!buzzerGame.awardPoint(state)) return;
  buzzerGame.reset(state);
  render();
  await broadcastState();
});

$("wrong-answer").addEventListener("click", async () => {
  buzzerGame.reset(state);
  render();
  await broadcastState();
});

window.addEventListener("beforeunload", () => {
  realtime?.close();
});

render();
