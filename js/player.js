import {
  getRoomByCode,
  getPlayers
} from "./database.js";

import { createRoomStateFromRecords, normalizeRoomCode } from "./room.js";
import { createRoomChannel } from "./realtime.js";

const TOP_20_GAME_ID = "spotify-top-artists";
const TOP_20_SLOT_COUNT = 20;

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
let realtime = null;

function showPlayerGame() {
  if (!player) return;

  joined = true;
  $("join-card").classList.add("hidden");
  $("game-card").classList.remove("hidden");
  $("player-name-display").textContent = player.name;
  $("team-display").textContent = player.team === "blue" ? "Team Blau" : "Team Rot";
  $("team-display").className = `status-pill ${player.team}`;
}

function startRealtime() {
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
      await realtime.send("request_state", { playerId });
    }
  });
}

async function initializePlayer() {
  const room = await getRoomByCode(roomCode);

  if (!room) {
    $("join-error").textContent = "Dieser Raum existiert nicht.";
    $("player-form").querySelector("button[type='submit']").disabled = true;
    $("connection-text").textContent = "Raum nicht gefunden";
    return;
  }

  const players = await getPlayers(room.id);
  roomState = createRoomStateFromRecords(roomCode, room, players);

  const restoredPlayer = roomState.players.find((item) => item.id === playerId);

  if (restoredPlayer) {
    player = restoredPlayer;
    showPlayerGame();
  }

  startRealtime();
  render();
}

$("player-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  $("join-error").textContent = "";

  const name = $("player-name").value.trim();
  const team = new FormData(event.currentTarget).get("team");

  if (!name || !realtime) return;

  player = {
    id: playerId,
    name,
    team
  };

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
      const restoredPlayer = roomState?.players?.find((item) => item.id === playerId);
      player = restoredPlayer || null;
      joined = Boolean(restoredPlayer);

      if (restoredPlayer) showPlayerGame();

      $("join-error").textContent = payload.reason || "Beitritt nicht möglich.";
      return;
    }

    player = payload.player || player;
    showPlayerGame();
    render();
    return;
  }

  if (event === "room_state") {
    roomState = payload;

    if (player && roomState.players?.some((item) => item.id === playerId)) {
      showPlayerGame();
    }

    sendingBuzz = false;
    render();
  }
}

function render() {
  if (!joined || !roomState) return;

  const spotifyIsActive = roomState.game?.id === TOP_20_GAME_ID;
  $("player-buzzer-game").classList.toggle("hidden", spotifyIsActive);
  $("player-spotify-game").classList.toggle("hidden", !spotifyIsActive);

  if (spotifyIsActive) {
    renderSpotifyGame();
    return;
  }

  const status = roomState.game?.status;
  const winner = roomState.game?.winner;
  const buzzer = $("buzzer");
  const gameScores = roomState.game?.scores || { blue: 0, red: 0 };

  $("player-buzzer-blue-score").textContent = gameScores.blue;
  $("player-buzzer-red-score").textContent = gameScores.red;

  buzzer.disabled = status !== "open";

  if (status === "open") {
    $("player-message").textContent = "Buzzer ist offen!";
    return;
  }

  if (status === "finished") {
    const winningTeam = roomState.game.winningTeam ||
      (gameScores.blue >= gameScores.red ? "blue" : "red");
    $("player-message").textContent = `🏆 ${getTeamName(winningTeam)} gewinnt das Buzzer Quiz!`;
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

function renderSpotifyGame() {
  const game = roomState.game;
  const isFinished = game.status === "finished";
  const isRoundFinished = game.status === "round-finished";
  const displayTeam = isFinished ? game.winningTeam : isRoundFinished ? game.roundWinner : game.currentTeam;
  const roundNumber = game.roundIndex + 1;

  $("player-top20-title").textContent = `Liste ${roundNumber}: ${game.listTitle || "Top 20"}`;
  $("player-top20-description").textContent = game.listDescription || "";
  $("player-top20-round-wins").textContent =
    `Rundensiege · Blau ${game.roundWins.blue} : ${game.roundWins.red} Rot`;
  $("player-spotify-turn").textContent = isFinished
    ? `${getTeamName(game.winningTeam)} gewinnt das Spiel!`
    : isRoundFinished
      ? `${getTeamName(game.roundWinner)} gewinnt Runde ${roundNumber}!`
    : `${getTeamName(game.currentTeam)} ist dran`;
  $("player-spotify-turn").className = `turn-card ${displayTeam}`;
  $("player-blue-strikes").textContent = renderStrikes(game.strikes?.blue);
  $("player-red-strikes").textContent = renderStrikes(game.strikes?.red);
  $("player-spotify-board").innerHTML = renderSpotifySlots(game.revealed, game.valueLabel);
  $("player-spotify-result").textContent = isFinished
    ? `🏆 ${getTeamName(game.winningTeam)} gewinnt Top 20!`
    : isRoundFinished
      ? `Liste ${roundNumber} ist beendet. Wartet auf die nächste Liste.`
      : `Nennt abwechselnd einen Eintrag. Der Moderator deckt richtige Lösungen auf.`;
}

function renderSpotifySlots(revealed = [], valueLabel = "Wert") {
  return Array.from({ length: TOP_20_SLOT_COUNT }, (_, index) => {
    const slot = revealed[index];
    const teamClass = slot?.team || "empty";
    const answer = slot ? escapeHtml(slot.answer) : "Noch offen";
    const value = slot
      ? `<span class="value">${escapeHtml(valueLabel)}: ${escapeHtml(slot.value)}</span>`
      : "";

    return `
      <div class="spotify-slot ${teamClass}">
        <span class="rank">${index + 1}</span>
        <span class="artist">${answer}${value}</span>
      </div>
    `;
  }).join("");
}

function getTeamName(team) {
  return team === "blue" ? "Team Blau" : "Team Rot";
}

function renderStrikes(value = 0) {
  return value > 0 ? "✕".repeat(value) : "—";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

window.addEventListener("beforeunload", () => {
  realtime?.close();
});

initializePlayer().catch((error) => {
  console.error(error);
  $("join-error").textContent = "Der Raum konnte nicht geladen werden.";
  $("connection-text").textContent = "Verbindung fehlgeschlagen";
});
