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
import { top20Game } from "./games/spotify-top-artists.js";
import { TOP_20_LISTS, TOP_20_SLOT_COUNT, getTop20List } from "./games/top-20-lists.js";

registerGame(buzzerGame);
registerGame(top20Game);

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

  if (state.game.id === top20Game.id) top20Game.normalize(state);

  $("room-code").textContent = roomCode;
  $("room-code-copy").textContent = roomCode;
  startRealtime();
  render();
}

function render() {
  $("blue-score").textContent = state.scores.blue;
  $("red-score").textContent = state.scores.red;

  renderPlayers("blue");
  renderPlayers("red");

  const spotifyIsActive = state.game.id === top20Game.id;
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
  const gameScores = state.game.scores || { blue: 0, red: 0 };

  $("buzzer-blue-score").textContent = gameScores.blue;
  $("buzzer-red-score").textContent = gameScores.red;

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
    const winningTeam = state.game.winningTeam || (gameScores.blue >= BUZZER_WINNING_SCORE ? "blue" : "red");
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
  const isRoundFinished = game.status === "round-finished";
  const interactionLocked = isFinished || isRoundFinished;
  const currentTeam = game.currentTeam || "blue";
  const displayTeam = isFinished ? game.winningTeam : isRoundFinished ? game.roundWinner : currentTeam;
  const revealed = Array.isArray(game.revealed) ? game.revealed : [];
  const list = getTop20List(game.roundIndex);
  const roundNumber = game.roundIndex + 1;

  $("top20-title").textContent = `Liste ${roundNumber}: ${list.title}`;
  $("top20-description").textContent = list.description;
  $("top20-round-wins").textContent =
    `Rundensiege · Blau ${game.roundWins.blue} : ${game.roundWins.red} Rot`;
  $("spotify-status").textContent = isFinished
    ? "Spiel beendet"
    : isRoundFinished
      ? `Runde ${roundNumber} beendet`
      : `Runde ${roundNumber} von ${TOP_20_LISTS.length}`;
  $("spotify-status").className = `status-pill ${interactionLocked ? "closed" : "open"}`;
  $("spotify-turn").textContent = isFinished
    ? `${getTeamName(game.winningTeam)} gewinnt das Spiel!`
    : isRoundFinished
      ? `${getTeamName(game.roundWinner)} gewinnt Runde ${roundNumber}!`
    : `${getTeamName(currentTeam)} ist dran`;
  $("spotify-turn").className = `turn-card ${displayTeam}`;
  $("blue-strikes").textContent = renderStrikes(game.strikes?.blue);
  $("red-strikes").textContent = renderStrikes(game.strikes?.red);
  $("spotify-board").innerHTML = renderSpotifySlots(revealed, list);
  $("spotify-finished").classList.toggle("hidden", !interactionLocked);
  $("spotify-winner-message").textContent = isFinished
    ? `🏆 ${getTeamName(game.winningTeam)} gewinnt Top 20 mit ${game.roundWins[game.winningTeam]} Rundensiegen!`
    : isRoundFinished
      ? `${getTeamName(game.roundWinner)} gewinnt Liste ${roundNumber}.`
      : "";
  $("next-top20-round").classList.toggle("hidden", isFinished);
  $("next-top20-round").disabled = moderatorActionPending;

  const form = $("spotify-answer-form");
  form.querySelectorAll("select, button").forEach((control) => {
    control.disabled = interactionLocked || moderatorActionPending;
  });

  populateSpotifyRanks(list, revealed);
}

function renderSpotifySlots(revealed, list) {
  return Array.from({ length: TOP_20_SLOT_COUNT }, (_, index) => {
    const slot = revealed[index];
    const teamClass = slot?.team || "empty";
    const answer = slot ? escapeHtml(slot.answer) : "Noch offen";
    const value = slot
      ? `<span class="value">${escapeHtml(list.valueLabel)}: ${escapeHtml(slot.value)}</span>`
      : "";

    return `
      <div class="spotify-slot ${teamClass}">
        <span class="rank">${index + 1}</span>
        <span class="artist">${answer}${value}</span>
      </div>
    `;
  }).join("");
}

function populateSpotifyRanks(list, revealed) {
  const select = $("spotify-rank");
  const selectedRank = Number(select.value);

  select.innerHTML = list.entries.map((entry, index) => {
    const rank = index + 1;
    const disabled = revealed[index] ? " disabled" : "";
    const selected = selectedRank === rank && !revealed[index] ? " selected" : "";
    return `<option value="${rank}"${disabled}${selected}>#${rank} · ${escapeHtml(entry.answer)} · ${escapeHtml(entry.value)}</option>`;
  }).join("");

  if (select.selectedIndex < 0) {
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
    top20Game.start(state);
    return true;
  });
});

$("spotify-answer-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("spotify-error").textContent = "";

  const accepted = await runModeratorAction(() => top20Game.reveal(
    state,
    Number($("spotify-rank").value)
  ));

  if (!accepted) {
    $("spotify-error").textContent = "Bitte wähle eine noch nicht aufgedeckte Lösung.";
  }
});

$("spotify-miss").addEventListener("click", async () => {
  $("spotify-error").textContent = "";
  await runModeratorAction(() => top20Game.recordMiss(state));
});

$("next-top20-round").addEventListener("click", async () => {
  $("spotify-error").textContent = "";
  await runModeratorAction(() => top20Game.startNextRound(state));
});

window.addEventListener("beforeunload", () => {
  realtime?.close();
});

initializeHost().catch((error) => {
  console.error(error);
  alert("Der Raum konnte nicht gestartet werden. Siehe Browser-Konsole.");
});
