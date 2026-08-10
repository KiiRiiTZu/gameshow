import { normalizeRoomCode } from "./room.js";
import { createRoomChannel } from "./realtime.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(window.location.search);
const roomCode = normalizeRoomCode(params.get("room"));

if (!roomCode) {
  window.location.href = "./index.html";
}

$("room-code").textContent = roomCode;

const storedId = sessionStorage.getItem(`gameshow-player-id-${roomCode}`);
const playerId = storedId || crypto.randomUUID();
sessionStorage.setItem(`gameshow-player-id-${roomCode}`, playerId);

let player = null;
let roomState = null;
let joined = false;
let sendingBuzz = false;

const realtime = createRoomChannel(roomCode, {
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
    await realtime.send("request_state", { playerId });
  }
});

$("player-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("join-error").textContent = "";

  const name = $("player-name").value.trim();
  const team = new FormData(event.currentTarget).get("team");

  if (!name) return;

  player = { id: playerId, name, team };
  await realtime.send("player_join", { player });
});

$("buzzer").addEventListener("click", async () => {
  if (!joined || !roomState || roomState.game.status !== "open" || sendingBuzz) return;

  // Disable immediately for better UX. The host still decides who actually won.
  sendingBuzz = true;
  $("buzzer").disabled = true;
  $("player-message").textContent = "Buzz gesendet…";

  await realtime.send("buzz", {
    playerId,
    clientSentAt: Date.now()
  });
});

async function handleEvent(event, payload) {
  if (event === "join_result" && payload.playerId === playerId) {
    if (!payload.accepted) {
      joined = false;
      $("join-error").textContent = payload.reason || "Beitritt nicht möglich.";
      return;
    }

    joined = true;
    $("join-card").classList.add("hidden");
    $("game-card").classList.remove("hidden");

    $("player-name-display").textContent = player.name;
    $("team-display").textContent = player.team === "blue" ? "Team Blau" : "Team Rot";
    $("team-display").className = `status-pill ${player.team}`;
    render();
    return;
  }

  if (event === "room_state") {
    roomState = payload;

    if (player && roomState.players?.some((item) => item.id === playerId)) {
      joined = true;
      $("join-card").classList.add("hidden");
      $("game-card").classList.remove("hidden");
      $("player-name-display").textContent = player.name;
      $("team-display").textContent = player.team === "blue" ? "Team Blau" : "Team Rot";
      $("team-display").className = `status-pill ${player.team}`;
    }

    sendingBuzz = false;
    render();
  }
}

function render() {
  if (!joined || !roomState) return;

  const status = roomState.game?.status;
  const winner = roomState.game?.winner;
  const buzzer = $("buzzer");

  buzzer.disabled = status !== "open";

  if (status === "open") {
    $("player-message").textContent = "Buzzer ist offen!";
    return;
  }

  if (winner) {
    if (winner.playerId === playerId) {
      $("player-message").textContent = "⚡ Du warst zuerst!";
    } else {
      $("player-message").textContent = `${winner.playerName} war schneller.`;
    }
    return;
  }

  $("player-message").textContent = "Warte auf den Moderator…";
}

window.addEventListener("beforeunload", () => {
  realtime?.close();
});
