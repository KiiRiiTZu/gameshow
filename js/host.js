import {
  createRoom,
  getRoomByCode,
  getPlayers,
  savePlayer,
  updateRoom,
  updateRoomGameState
} from "./database.js";

import { addOrUpdatePlayer, createRoomStateFromRecords, generateRoomCode } from "./room.js";
import { createRoomChannel } from "./realtime.js";
import { registerGame } from "./games/game-engine.js";
import { BUZZER_WINNING_SCORE, buzzerGame } from "./games/buzzer.js";
import { SPOTIFY_SLOT_COUNT, spotifyTopArtistsGame } from "./games/spotify-top-artists.js";

registerGame(buzzerGame);
registerGame(spotifyTopArtistsGame);

let roomCode;
let roomRecord;
let state;
let realtime;
let supportsRemoteGameState = true;
let moderatorActionPending = false;

const $ = (id) => document.getElementById(id);

function gameStorageKey() {
  return `gameshow-game-state-${roomRecord.id}`;
}

function saveLocalGameState() {
  try {
    localStorage.setItem(gameStorageKey(), JSON.stringify(state.game));
  } catch (error) {
    console.warn("Local game state could not be saved:", error);
  }
}

function restoreLocalGameState() {
  if (roomRecord.game_state) return;

  try {
    const savedGame = JSON.parse(localStorage.getItem(gameStorageKey()));
    if (savedGame?.id === roomRecord.current_game) state.game = savedGame;
  } catch (error) {
    console.warn("Local game state could not be restored:", error);
  }
}

async function persistRoomState() {
  saveLocalGameState();

  await updateRoom(roomRecord.id, {
    blue_score: state.scores.blue,
    red_score: state.scores.red,
    current_game: state.game.id,
    game_status: state.game.status,
    buzzer_winner_id: state.game.id === "buzzer" ? state.game.winner?.playerId ?? null : null,
    buzzer_winner_name: state.game.id === "buzzer" ? state.game.winner?.playerName ?? null : null,
    buzzer_winner_team: state.game.id === "buzzer" ? state.game.winner?.team ?? null : null
  });

  if (supportsRemoteGameState) {
    supportsRemoteGameState = await updateRoomGameState(roomRecord.id, state.game);

    if (!supportsRemoteGameState) {
      console.warn("Supabase game_state is not available yet; using local host recovery.");
    }
  }
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
    window.history.replaceState({}, "", `./host.html?room=${roomCode}`);
  }

  const players = await getPlayers(roomRecord.id);
  state = createRoomStateFromRecords(roomCode, roomRecord, players);
  restoreLocalGameState();

  if (state.game.id === spotifyTopArtistsGame.id && !Array.isArray(state.game.slots)) {
    spotifyTopArtistsGame.start(state);
  }

  $("room-code").textContent = roomCode;
  $("room-code-copy").textContent = roomCode;
  populateSpotifyRanks();
  startRealtime();
  render();
}

function render() {
  $("blue-score").textContent = state.scores.blue;
  $("red-score").textContent = state.scores.red;

  renderPlayers("blue");
  renderPlayers("red");

  const spotifyIsActive = state.game.id === spotifyTopArtistsGame.id;
  $("buzzer-game-panel").classList.toggle("hidden", spotifyIsActive);
  $("spotify-game-panel").classList.toggle("hidden", !spotifyIsActive);

  if (spotifyIsActive) renderSpotifyGame();
  else renderBuzzerGame();
}

function renderBuzzerGame() {
  const status = state.game.status;
  const isOpen = status === "open";
  const isLocked = status === "locked";
  const isFinished = status === "finished";
  const winner = state.game.winner;

  $("buzzer-status").textContent = isOpen
    ? "Buzzer offen"
    : isLocked
      ? "Buzzer gesperrt"
      : isFinished
        ? "Spiel beendet"
        : "Buzzer geschlossen";
  $("buzzer-status").className = `status-pill ${isOpen ? "open" : "closed"}`;

  $("open-buzzer").disabled = moderatorActionPending || status !== "waiting";
  $("reset-buzzer").disabled = moderatorActionPending || isFinished;
  $("correct-answer").disabled = moderatorActionPending;
  $("wrong-answer").disabled = moderatorActionPending;
  $("start-spotify-game").disabled = moderatorActionPending;
  $("answer-controls").classList.toggle("hidden", !winner || isFinished);
  $("buzzer-finished-controls").classList.toggle("hidden", !isFinished);

  if (isFinished) {
    const winningTeam = state.game.winningTeam || (state.scores.blue >= BUZZER_WINNING_SCORE ? "blue" : "red");
    const teamName = getTeamName(winningTeam);
    $("buzzer-winner-message").textContent = `🏆 ${teamName} gewinnt das Buzzer Quiz mit ${BUZZER_WINNING_SCORE} Punkten!`;
    $("buzz-result").classList.add("winner");
    $("buzz-result").innerHTML = `<strong>${teamName} gewinnt Spiel 1</strong>`;
    return;
  }

  if (winner) {
    $("buzz-result").classList.add("winner");
    $("buzz-result").innerHTML = `
      <div>
        <strong>⚡ ${escapeHtml(winner.playerName)}</strong>
        <span>${getTeamName(winner.team)} hat zuerst gebuzzert</span>
      </div>
    `;
  } else {
    $("buzz-result").classList.remove("winner");
    $("buzz-result").innerHTML = isOpen
      ? "<strong>⚡ Buzzer ist offen!</strong>"
      : '<span class="muted">Öffne den Buzzer, sobald du die Frage gestellt hast.</span>';
  }
}

function renderSpotifyGame() {
  const game = state.game;
  const isFinished = game.status === "finished";
  const currentTeam = game.currentTeam || "blue";
  const slots = Array.isArray(game.slots) ? game.slots : [];

  $("spotify-status").textContent = isFinished ? "Spiel beendet" : "Läuft";
  $("spotify-status").className = `status-pill ${isFinished ? "closed" : "open"}`;
  $("spotify-turn").textContent = isFinished
    ? `${getTeamName(game.winningTeam)} gewinnt!`
    : `${getTeamName(currentTeam)} ist dran`;
  $("spotify-turn").className = `turn-card ${isFinished ? game.winningTeam : currentTeam}`;
  $("blue-strikes").textContent = renderStrikes(game.strikes?.blue);
  $("red-strikes").textContent = renderStrikes(game.strikes?.red);
  $("spotify-board").innerHTML = renderSpotifySlots(slots);
  $("spotify-finished").classList.toggle("hidden", !isFinished);
  $("spotify-winner-message").textContent = isFinished
    ? `🏆 ${getTeamName(game.winningTeam)} gewinnt das Spotify-Spiel!`
    : "";

  const form = $("spotify-answer-form");
  form.querySelectorAll("input, select, button").forEach((control) => {
    control.disabled = isFinished || moderatorActionPending;
  });

  updateAvailableRanks(slots);
}

function renderSpotifySlots(slots) {
  return Array.from({ length: SPOTIFY_SLOT_COUNT }, (_, index) => {
    const slot = slots[index];
    const teamClass = slot?.team || "empty";
    const artist = slot ? escapeHtml(slot.artist) : "Noch offen";

    return `
      <div class="spotify-slot ${teamClass}">
        <span class="rank">${index + 1}</span>
        <span class="artist">${artist}</span>
      </div>
    `;
  }).join("");
}

function populateSpotifyRanks() {
  $("spotify-rank").innerHTML = Array.from(
    { length: SPOTIFY_SLOT_COUNT },
    (_, index) => `<option value="${index + 1}">#${index + 1}</option>`
  ).join("");
}

function updateAvailableRanks(slots) {
  const select = $("spotify-rank");
  let selectedIsAvailable = false;

  Array.from(select.options).forEach((option, index) => {
    option.disabled = Boolean(slots[index]);
    if (option.selected && !option.disabled) selectedIsAvailable = true;
  });

  if (!selectedIsAvailable) {
    const firstAvailable = Array.from(select.options).find((option) => !option.disabled);
    if (firstAvailable) firstAvailable.selected = true;
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

async function broadcastState() {
  await realtime.send("room_state", structuredClone(state));
}

async function persistRenderAndBroadcast() {
  render();
  await persistRoomState();
  await broadcastState();
}

async function runModeratorAction(action) {
  if (moderatorActionPending) return false;

  moderatorActionPending = true;

  try {
    if (!action()) return false;
    await persistRenderAndBroadcast();
    return true;
  } finally {
    moderatorActionPending = false;
    render();
  }
}

async function handlePlayerJoin(incomingPlayer) {
  if (!incomingPlayer?.id || !incomingPlayer?.name || !["blue", "red"].includes(incomingPlayer?.team)) return;

  const player = {
    id: incomingPlayer.id,
    name: String(incomingPlayer.name).trim().slice(0, 20),
    team: incomingPlayer.team
  };

  if (!player.name) return;

  const previousPlayer = state.players.find((item) => item.id === player.id);
  const accepted = addOrUpdatePlayer(state, player);

  if (!accepted) {
    await realtime.send("join_result", {
      playerId: player.id,
      accepted: false,
      reason: "Dieses Team ist bereits voll."
    });
    return;
  }

  try {
    await savePlayer(player, roomRecord.id);
  } catch (error) {
    if (previousPlayer) {
      const playerIndex = state.players.findIndex((item) => item.id === player.id);
      if (playerIndex >= 0) state.players[playerIndex] = previousPlayer;
    } else {
      state.players = state.players.filter((item) => item.id !== player.id);
    }

    console.error("Player could not be saved:", error);
    await realtime.send("join_result", {
      playerId: player.id,
      accepted: false,
      reason: "Der Beitritt konnte nicht gespeichert werden."
    });
    return;
  }

  await realtime.send("join_result", { playerId: player.id, accepted: true, player });
  render();
  await broadcastState();
}

async function handleEvent(event, payload) {
  if (event === "player_join") {
    await handlePlayerJoin(payload.player);
    return;
  }

  if (event === "request_state") {
    await broadcastState();
    return;
  }

  if (event === "buzz") {
    const player = state.players.find((item) => item.id === payload.playerId);
    if (!player || !buzzerGame.registerBuzz(state, player)) return;
    await persistRenderAndBroadcast();
  }
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
      render();
      await broadcastState();
    }
  });
}

$("open-buzzer").addEventListener("click", async () => {
  await runModeratorAction(() => buzzerGame.open(state));
});

$("reset-buzzer").addEventListener("click", async () => {
  await runModeratorAction(() => buzzerGame.reset(state));
});

$("correct-answer").addEventListener("click", async () => {
  await runModeratorAction(() => {
    if (!buzzerGame.awardPoint(state)) return false;
    if (state.game.status !== "finished") buzzerGame.reset(state);
    return true;
  });
});

$("wrong-answer").addEventListener("click", async () => {
  await runModeratorAction(() => buzzerGame.reset(state));
});

$("start-spotify-game").addEventListener("click", async () => {
  await runModeratorAction(() => {
    if (state.game.id !== "buzzer" || state.game.status !== "finished") return false;
    spotifyTopArtistsGame.start(state);
    return true;
  });
});

$("spotify-answer-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("spotify-error").textContent = "";

  const accepted = await runModeratorAction(() => spotifyTopArtistsGame.recordHit(
      state,
      $("spotify-artist").value,
      Number($("spotify-rank").value)
    ));

  if (!accepted) {
    $("spotify-error").textContent = "Bitte wähle eine freie Position und einen noch nicht genannten Künstler.";
    return;
  }

  $("spotify-artist").value = "";
});

$("spotify-miss").addEventListener("click", async () => {
  $("spotify-error").textContent = "";
  await runModeratorAction(() => spotifyTopArtistsGame.recordMiss(state));
});

window.addEventListener("beforeunload", () => {
  realtime?.close();
});

initializeHost().catch((error) => {
  console.error(error);
  alert("Der Raum konnte nicht gestartet werden. Siehe Browser-Konsole.");
});
