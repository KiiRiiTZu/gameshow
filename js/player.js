import {
  getRoomByCode,
  getPlayers
} from "./database.js";

import { createRoomStateFromRecords, normalizeRoomCode } from "./room.js";
import { createRoomChannel } from "./realtime.js";
import { playBuzzerSound } from "./audio.js";
import { GERMANY_MAP_QUESTIONS } from "./games/germany-map.js";
import { createGermanyMap } from "./germany-map-view.js";
import {
  MATCHING_ASSIGNERS,
  MATCHING_GAME_ROUNDS,
  MATCHING_TURNS
} from "./games/matching-game.js";
import { encryptMatchingSubmission } from "./matching-crypto.js";

const TOP_20_GAME_ID = "spotify-top-artists";
const TOP_20_SLOT_COUNT = 20;
const GERMANY_MAP_GAME_ID = "germany-map";
const MATCHING_GAME_ID = "matching-game";

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
let playerMap = null;
let matchingSubmissionPending = false;
let matchingDraft = { key: "", values: ["", "", "", ""] };

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

  playerMap = createGermanyMap($("player-germany-map"), {
    async onPlacePin(position) {
      if (!player || roomState?.game?.id !== GERMANY_MAP_GAME_ID ||
          roomState.game.status !== "placing") return;

      await realtime.send("map_pin", { playerId, position });
    }
  });

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

function currentMatchingAssignment() {
  if (!player || roomState?.game?.id !== MATCHING_GAME_ID ||
      roomState.game.status !== "assigning") return null;

  const turn = MATCHING_TURNS[roomState.game.activeTurnIndex];
  const assignerIndex = turn?.assignerIndexes?.[player.team];
  const expectedPlayer = roomState.game.assignerOrder?.[assignerIndex];
  if (expectedPlayer?.id !== playerId) return null;

  return { turn, assignerIndex };
}

$("player-matching-board").addEventListener("input", (event) => {
  const input = event.target.closest("[data-player-matching-input]");
  if (!input) return;
  matchingDraft.values[Number(input.dataset.imageIndex)] = input.value;
});

$("submit-matching-assignment").addEventListener("click", async () => {
  $("player-matching-error").textContent = "";
  const assignment = currentMatchingAssignment();
  const values = matchingDraft.values.map((value) => value.trim());

  if (!assignment || matchingSubmissionPending ||
      roomState.game.submittedTeams?.[player.team]) return;
  if (!roomState.matchingSubmissionKey) {
    $("player-matching-error").textContent = "Die sichere Verbindung zum Moderator wird noch aufgebaut.";
    return;
  }
  if (values.some((value) => !value)) {
    $("player-matching-error").textContent = "Bitte für alle vier Bilder einen Spieler auswählen.";
    return;
  }
  const registeredNames = new Set(roomState.players.map((roomPlayer) => roomPlayer.name));
  if (values.some((value) => !registeredNames.has(value))) {
    $("player-matching-error").textContent = "Bitte ausschließlich registrierte Spieler auswählen.";
    return;
  }

  matchingSubmissionPending = true;
  render();

  try {
    const encrypted = await encryptMatchingSubmission(roomState.matchingSubmissionKey, {
      playerId,
      roundIndex: roomState.game.roundIndex,
      turnIndex: roomState.game.activeTurnIndex,
      values
    });
    await realtime.send("matching_assignment", { playerId, encrypted });
  } catch (error) {
    console.error("Matching submission could not be encrypted:", error);
    matchingSubmissionPending = false;
    $("player-matching-error").textContent = "Die Zuordnungen konnten nicht gesendet werden.";
    render();
  }
});

async function handleEvent(event, payload) {
  if (event === "buzz_winner") {
    void playBuzzerSound();
    return;
  }

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

  if (event === "matching_submission_result" && payload.playerId === playerId) {
    matchingSubmissionPending = false;
    $("player-matching-error").textContent = payload.accepted
      ? "Zuordnungen sicher an den Moderator gesendet."
      : "Die Zuordnungen konnten nicht übernommen werden. Bitte erneut versuchen.";
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
  const mapIsActive = roomState.game?.id === GERMANY_MAP_GAME_ID;
  const matchingIsActive = roomState.game?.id === MATCHING_GAME_ID;
  document.querySelector(".player-shell").classList.toggle(
    "wide-game",
    spotifyIsActive || mapIsActive || matchingIsActive
  );
  $("player-buzzer-game").classList.toggle("hidden", spotifyIsActive || mapIsActive || matchingIsActive);
  $("player-spotify-game").classList.toggle("hidden", !spotifyIsActive);
  $("player-map-game").classList.toggle("hidden", !mapIsActive);
  $("player-matching-game").classList.toggle("hidden", !matchingIsActive);

  if (matchingIsActive) {
    renderMatchingGame();
    return;
  }

  if (mapIsActive) {
    renderMapGame();
    return;
  }

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

function renderMapGame() {
  const game = roomState.game;
  const question = GERMANY_MAP_QUESTIONS[game.roundIndex];
  const isRevealed = game.status === "revealed" || game.status === "finished";
  const isFinished = game.status === "finished";
  const ownPin = game.pins?.[player.team];

  $("player-map-question-number").textContent =
    `FRAGE ${game.roundIndex + 1} VON ${GERMANY_MAP_QUESTIONS.length}`;
  $("player-map-question").textContent = question.prompt;
  $("player-map-blue-score").textContent = game.roundScores.blue;
  $("player-map-red-score").textContent = game.roundScores.red;
  $("player-map-instruction").textContent = isRevealed
    ? "Der Moderator hat das Ziel aufgedeckt."
    : ownPin
      ? "Euer Team-Pin ist gesetzt. Ihr könnt ihn bis zur Auswertung noch verschieben."
      : "Tippt auf die Karte, um euren gemeinsamen Team-Pin zu setzen.";

  playerMap?.render({
    pins: isRevealed
      ? game.pins
      : { blue: player.team === "blue" ? ownPin : null, red: player.team === "red" ? ownPin : null },
    target: question.target,
    revealed: isRevealed,
    locked: isRevealed
  });

  if (isRevealed) {
    const blueDistance = Math.round(game.distances.blue);
    const redDistance = Math.round(game.distances.red);
    $("player-map-result").textContent = isFinished
      ? `🏆 ${getTeamName(game.winningTeam)} gewinnt das Kartenspiel! Blau: ${blueDistance} km · Rot: ${redDistance} km`
      : `${question.answer} · ${getTeamName(game.roundWinner)} ist näher! Blau: ${blueDistance} km · Rot: ${redDistance} km`;
  } else {
    $("player-map-result").textContent = ownPin
      ? "Pin gesetzt ✓ Wartet auf das andere Team und den Moderator."
      : "Euer Team hat noch keinen Pin gesetzt.";
  }
}

function renderPlayerMatchingBox(value, assignerIndex, imageIndex, editable = false) {
  const assigner = MATCHING_ASSIGNERS[assignerIndex];
  const positions = ["top-left", "top-right", "bottom-left", "bottom-right"];
  const attributes = editable
    ? `data-player-matching-input data-image-index="${imageIndex}"`
    : "disabled";
  const options = [
    `<option value="">Spieler wählen</option>`,
    ...roomState.players.map((roomPlayer) =>
      `<option value="${escapeHtml(roomPlayer.name)}"${roomPlayer.name === value ? " selected" : ""}>${escapeHtml(roomPlayer.name)}</option>`
    )
  ].join("");

  return `
    <label class="matching-assignment ${positions[assignerIndex]} ${assigner.team}${editable ? " active" : " revealed"}">
      <select aria-label="${escapeHtml(assigner.label)}" ${attributes}>
        ${options}
      </select>
    </label>
  `;
}

function renderPlayerMatchingOverlays(game, imageIndex, assignment) {
  const overlays = [];

  if (game.revealedTeams?.blue) {
    const values = game.revealedAssignments.blue[imageIndex];
    overlays.push(renderPlayerMatchingBox(values[0], 0, imageIndex));
    overlays.push(renderPlayerMatchingBox(values[1], 2, imageIndex));
  }
  if (game.revealedTeams?.red) {
    const values = game.revealedAssignments.red[imageIndex];
    overlays.push(renderPlayerMatchingBox(values[0], 1, imageIndex));
    overlays.push(renderPlayerMatchingBox(values[1], 3, imageIndex));
  }
  if (assignment && !game.submittedTeams?.[player.team]) {
    overlays.push(renderPlayerMatchingBox(
      matchingDraft.values[imageIndex],
      assignment.assignerIndex,
      imageIndex,
      true
    ));
  }

  return overlays.join("");
}

function renderMatchingGame() {
  const game = roomState.game;
  const round = MATCHING_GAME_ROUNDS[game.roundIndex];
  const turn = MATCHING_TURNS[game.activeTurnIndex] || MATCHING_TURNS[0];
  const bluePlayer = game.assignerOrder?.[turn.assignerIndexes.blue];
  const redPlayer = game.assignerOrder?.[turn.assignerIndexes.red];
  const assignment = currentMatchingAssignment();
  const draftKey = assignment
    ? `${game.roundIndex}-${game.activeTurnIndex}-${assignment.assignerIndex}`
    : "";
  const isFinished = game.status === "finished";
  const isRoundFinished = game.status === "round-finished";
  const isRevealing = ["ready-to-reveal", "revealing"].includes(game.status);
  const result = game.roundResults?.[game.roundIndex];

  if (draftKey && matchingDraft.key !== draftKey) {
    matchingDraft = { key: draftKey, values: ["", "", "", ""] };
    matchingSubmissionPending = false;
    $("player-matching-error").textContent = "";
  }

  $("player-matching-round").textContent =
    `Runde ${game.roundIndex + 1} von ${MATCHING_GAME_ROUNDS.length} · ${round.title}`;
  $("player-matching-blue-score").textContent = game.scores.blue;
  $("player-matching-red-score").textContent = game.scores.red;
  $("player-matching-board").innerHTML = round.images.map((image, imageIndex) => `
    <article class="matching-card">
      <div class="matching-image-frame">
        <img src="${image.src}" alt="${escapeHtml(image.label)}">
        ${renderPlayerMatchingOverlays(game, imageIndex, assignment)}
      </div>
    </article>
  `).join("");

  if (isFinished || isRoundFinished || isRevealing) {
    $("player-matching-turn").className = "matching-turn finished";
    $("player-matching-turn").textContent = isFinished
      ? "Alle Runden sind ausgewertet."
      : isRoundFinished
        ? `Runde ${game.roundIndex + 1} ist beendet.`
        : "Der Moderator deckt gleich alle Antworten auf.";
  } else {
    $("player-matching-turn").className = "matching-turn split";
    $("player-matching-turn").textContent =
      `${turn.label}: ${bluePlayer?.name || "Blau fehlt"} und ${redPlayer?.name || "Rot fehlt"} ordnen gleichzeitig zu.`;
  }

  const ownSubmissionComplete = Boolean(game.submittedTeams?.[player.team]);
  $("submit-matching-assignment").classList.toggle(
    "hidden",
    !assignment || ownSubmissionComplete || game.status !== "assigning"
  );
  $("submit-matching-assignment").disabled = matchingSubmissionPending;
  $("submit-matching-assignment").textContent = matchingSubmissionPending
    ? "Wird sicher gesendet…"
    : "Meine Zuordnungen senden";

  if (isFinished) {
    $("player-matching-result").textContent = game.winningTeam
      ? `🏆 ${getTeamName(game.winningTeam)} gewinnt das Zuordnungsspiel!`
      : "Das Zuordnungsspiel endet unentschieden.";
  } else if (isRoundFinished) {
    $("player-matching-result").textContent =
      `Runde ${game.roundIndex + 1}: Blau ${result.blue} · ${result.red} Rot. Wartet auf die nächste Runde.`;
  } else if (isRevealing) {
    const revealed = game.revealedTeams.blue ? "Team Blau" :
      game.revealedTeams.red ? "Team Rot" : "Noch kein Team";
    $("player-matching-result").textContent = `${revealed} ist aufgedeckt.`;
  } else if (ownSubmissionComplete) {
    $("player-matching-result").textContent = "Eure Zuordnungen sind beim Moderator angekommen ✓";
  } else if (assignment) {
    $("player-matching-result").textContent = "Trage deine vier Zuordnungen ein. Das andere Team kann sie nicht lesen.";
  } else {
    $("player-matching-result").textContent = "Warte auf euren nächsten Zuordnungsdurchgang.";
  }
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
