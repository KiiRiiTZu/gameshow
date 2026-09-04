import {
  createRoom,
  getRoomByCode,
  getPlayers,
  savePlayer,
  updateRoom,
  updateRoomGameState
} from "./database.js";

import { addOrUpdatePlayer, createRoomStateFromRecords, generateRoomCode, getShowWinner } from "./room.js";
import { createRoomChannel } from "./realtime.js";
import { playBuzzerSound } from "./audio.js";
import { registerGame } from "./games/game-engine.js";
import { BUZZER_WINNING_SCORE, buzzerGame } from "./games/buzzer.js";
import { BUZZER_QUESTIONS, getBuzzerQuestion } from "./games/buzzer-questions.js";
import { top20Game } from "./games/spotify-top-artists.js";
import { TOP_20_LISTS, TOP_20_SLOT_COUNT, getTop20List } from "./games/top-20-lists.js";
import { rankingGame } from "./games/ranking-game.js";
import { RANKING_LISTS, getRankingEntry, getRankingList } from "./games/ranking-lists.js";
import { captureRankingMove, playRankingMove } from "./ranking-motion.js";
import { GERMANY_MAP_QUESTIONS, GERMANY_MAP_ROUNDS_TO_WIN, germanyMapGame } from "./games/germany-map.js";
import { createEuropeMap } from "./europe-map-view.js";
import {
  MATCHING_ASSIGNERS,
  MATCHING_GAME_ROUNDS,
  MATCHING_TURNS,
  areMatchingValuesUnique,
  getMatchingTurn,
  matchingGame
} from "./games/matching-game.js";
import {
  formatEuroAmount,
  formatSignedEuroDifference,
  guessThePriceGame,
  parseEuroAmount
} from "./games/guess-the-price.js";
import { PRICE_PRODUCTS, getPriceProduct } from "./games/guess-the-price-products.js";
import { estimationGame, parseEstimate } from "./games/estimation-game.js";
import { ESTIMATION_QUESTIONS, getEstimationQuestion } from "./games/estimation-questions.js";
import {
  WORD_MATCH_CATEGORIES,
  WORD_MATCH_PHASE_SECONDS,
  WORD_MATCH_SEED_SECONDS,
  WORD_MATCH_TERM_COUNT,
  WORD_MATCH_TIEBREAK_SECONDS,
  getWordMatchGuessOrder,
  getWordMatchRoles,
  getWordMatchTiebreakTurn,
  wordMatchGame
} from "./games/word-match-game.js";
import {
  createMatchingKeyPair,
  exportMatchingPublicKey
} from "./matching-crypto.js";
import { decryptPrivatePayload, encryptPrivatePayload } from "./private-channel-crypto.js";
import { showGameTransition } from "./game-effects.js";
import {
  addTeamChatMessage,
  clearExpiredTeamChatTyping,
  createTeamChat,
  getTeamChatView,
  setTeamChatTyping,
  supportsTeamChat
} from "./team-chat.js";

registerGame(buzzerGame);
registerGame(top20Game);
registerGame(rankingGame);
registerGame(germanyMapGame);
registerGame(matchingGame);
registerGame(guessThePriceGame);
registerGame(estimationGame);
registerGame(wordMatchGame);

let roomCode;
let roomRecord;
let state;
let realtime;
let supportsRemoteGameState = true;
let moderatorActionPending = false;
let hostMap;
let matchingAssignments = [];
let matchingKeyPair;
let matchingPublicKey;
let top20Notes = emptyTop20Notes();
let mapNotes = emptyMapNotes();
let priceDrafts = emptyPriceDrafts();
let teamChat = createTeamChat();
let estimationDrafts = emptyEstimationDrafts();
let wordMatchDrafts = emptyWordMatchDrafts();
const pricePlayerKeys = new Map();
let wordTimerActionPending = false;
let wordMatchEditTimer = null;
let previousGameId = null;
let previousGameStatus = null;
let rankingSelection = { itemId: null, position: null };

const $ = (id) => document.getElementById(id);

function gameStorageKey() {
  return `gameshow-game-state-${roomRecord.id}`;
}

function matchingStorageKey() {
  return `gameshow-matching-assignments-${roomRecord.id}`;
}

function top20StorageKey() {
  return `gameshow-top20-notes-${roomRecord.id}`;
}

function priceStorageKey() {
  return `gameshow-price-drafts-${roomRecord.id}`;
}

function mapNotesStorageKey() {
  return `gameshow-map-notes-${roomRecord.id}`;
}

function estimationStorageKey() {
  return `gameshow-estimation-drafts-${roomRecord.id}`;
}

function wordMatchStorageKey() {
  return `gameshow-word-match-drafts-${roomRecord.id}`;
}

function emptyWordTerms() {
  return Array.from({ length: WORD_MATCH_TERM_COUNT }, () => "");
}

function emptyWordMatchDrafts(roundIndex = 0) {
  return { roundIndex, terms: {} };
}

function getWordMatchLists() {
  const roles = getWordMatchRoles(state.game);
  return Object.fromEntries(["blue", "red"].map((team) => [
    team,
    [...(wordMatchDrafts.terms[roles.seeders[team]?.id] || emptyWordTerms())]
  ]));
}

function saveWordMatchDrafts() {
  try {
    localStorage.setItem(wordMatchStorageKey(), JSON.stringify(wordMatchDrafts));
  } catch (error) {
    console.warn("Private word lists could not be saved:", error);
  }
}

function restoreWordMatchDrafts() {
  wordMatchDrafts = emptyWordMatchDrafts(state.game.roundIndex);
  try {
    const saved = JSON.parse(localStorage.getItem(wordMatchStorageKey()));
    if (!saved || saved.roundIndex !== state.game.roundIndex) return false;
    for (const participant of state.game.participants || []) {
      if (!Array.isArray(saved.terms?.[participant.id])) continue;
      wordMatchDrafts.terms[participant.id] = emptyWordTerms().map((_, index) =>
        String(saved.terms[participant.id][index] || "").slice(0, 60)
      );
    }
    return true;
  } catch (error) {
    console.warn("Private word lists could not be restored:", error);
    return false;
  }
}

function emptyEstimationDrafts(roundIndex = 0) {
  return { roundIndex, values: {} };
}

function saveEstimationDrafts() {
  try {
    localStorage.setItem(estimationStorageKey(), JSON.stringify(estimationDrafts));
  } catch (error) {
    console.warn("Private estimation drafts could not be saved:", error);
  }
}

function restoreEstimationDrafts() {
  estimationDrafts = emptyEstimationDrafts(state.game.roundIndex);
  try {
    const saved = JSON.parse(localStorage.getItem(estimationStorageKey()));
    if (!saved || saved.roundIndex !== state.game.roundIndex) return false;
    for (const participant of state.game.participants || []) {
      const value = String(saved.values?.[participant.id] || "").slice(0, 40);
      if (value) estimationDrafts.values[participant.id] = value;
    }
    return true;
  } catch (error) {
    console.warn("Private estimation drafts could not be restored:", error);
    return false;
  }
}

function normalizePersonalNotes(value, legacyText = "", legacyUpdatedBy = null) {
  const notes = {};
  const source = value && typeof value === "object" ? value : {};
  for (const [playerId, text] of Object.entries(source)) {
    notes[playerId] = String(text || "").slice(0, 280);
  }
  if (legacyUpdatedBy && legacyText && !notes[legacyUpdatedBy]) {
    notes[legacyUpdatedBy] = String(legacyText).slice(0, 280);
  }
  return notes;
}

function emptyTop20Notes(roundIndex = 0) {
  return {
    roundIndex,
    blue: { notes: {} },
    red: { notes: {} }
  };
}

function saveTop20Notes() {
  try {
    localStorage.setItem(top20StorageKey(), JSON.stringify(top20Notes));
  } catch (error) {
    console.warn("Private Top 20 notes could not be saved:", error);
  }
}

function restoreTop20Notes() {
  top20Notes = emptyTop20Notes(state.game.roundIndex);

  try {
    const saved = JSON.parse(localStorage.getItem(top20StorageKey()));
    if (!saved || saved.roundIndex !== state.game.roundIndex) return false;
    for (const team of ["blue", "red"]) {
      top20Notes[team] = {
        notes: normalizePersonalNotes(
          saved[team]?.notes,
          saved[team]?.text,
          saved[team]?.updatedBy
        )
      };
    }
    return true;
  } catch (error) {
    console.warn("Private Top 20 notes could not be restored:", error);
    return false;
  }
}

function emptyPriceDrafts(roundIndex = 0) {
  return {
    roundIndex,
    blue: { amount: "", updatedBy: null },
    red: { amount: "", updatedBy: null }
  };
}

function savePriceDrafts() {
  try {
    localStorage.setItem(priceStorageKey(), JSON.stringify(priceDrafts));
  } catch (error) {
    console.warn("Private price drafts could not be saved:", error);
  }
}

function restorePriceDrafts() {
  priceDrafts = emptyPriceDrafts(state.game.roundIndex);

  try {
    const saved = JSON.parse(localStorage.getItem(priceStorageKey()));
    if (!saved || saved.roundIndex !== state.game.roundIndex) return false;
    for (const team of ["blue", "red"]) {
      priceDrafts[team] = {
        amount: String(saved[team]?.amount || "").slice(0, 40),
        updatedBy: saved[team]?.updatedBy || null
      };
    }
    return true;
  } catch (error) {
    console.warn("Private price drafts could not be restored:", error);
    return false;
  }
}

function emptyMapNotes(roundIndex = 0) {
  return {
    roundIndex,
    blue: { notes: {} },
    red: { notes: {} }
  };
}

function saveMapNotes() {
  try {
    localStorage.setItem(mapNotesStorageKey(), JSON.stringify(mapNotes));
  } catch (error) {
    console.warn("Private map notes could not be saved:", error);
  }
}

function restoreMapNotes() {
  mapNotes = emptyMapNotes(state.game.roundIndex);
  try {
    const saved = JSON.parse(localStorage.getItem(mapNotesStorageKey()));
    if (!saved || saved.roundIndex !== state.game.roundIndex) return false;
    for (const team of ["blue", "red"]) {
      mapNotes[team] = { notes: normalizePersonalNotes(saved[team]?.notes) };
    }
    return true;
  } catch (error) {
    console.warn("Private map notes could not be restored:", error);
    return false;
  }
}

function emptyMatchingAssignments() {
  return MATCHING_GAME_ROUNDS.map(() =>
    Array.from({ length: 4 }, () => Array(MATCHING_ASSIGNERS.length).fill(""))
  );
}

function saveMatchingAssignments() {
  try {
    localStorage.setItem(matchingStorageKey(), JSON.stringify(matchingAssignments));
  } catch (error) {
    console.warn("Private matching assignments could not be saved:", error);
  }
}

function restoreMatchingAssignments() {
  matchingAssignments = emptyMatchingAssignments();

  try {
    const saved = JSON.parse(localStorage.getItem(matchingStorageKey()));
    if (!Array.isArray(saved)) return false;

    matchingAssignments = matchingAssignments.map((round, roundIndex) =>
      round.map((image, imageIndex) =>
        image.map((_, assignerIndex) =>
          String(saved?.[roundIndex]?.[imageIndex]?.[assignerIndex] || "")
        )
      )
    );
    return true;
  } catch (error) {
    console.warn("Private matching assignments could not be restored:", error);
    return false;
  }
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
  teamChat = createTeamChat(supportsTeamChat(state.game.id) ? state.game.id : null);

  if (state.game.id === top20Game.id) {
    top20Game.normalize(state);
    restoreTop20Notes();
  }
  if (state.game.id === germanyMapGame.id) {
    germanyMapGame.normalize(state);
    restoreMapNotes();
  }
  if (state.game.id === rankingGame.id) rankingGame.normalize(state);
  if (state.game.id === matchingGame.id) {
    matchingGame.normalize(state);
    const assignmentsRestored = restoreMatchingAssignments();
    if (!assignmentsRestored && state.game.status === "assigning") {
      state.game.activeTurnIndex = 0;
      state.game.turnSubmitted = false;
    }
  }
  if (state.game.id === guessThePriceGame.id) {
    guessThePriceGame.normalize(state);
    restorePriceDrafts();
  }
  if (state.game.id === estimationGame.id) {
    estimationGame.normalize(state);
    restoreEstimationDrafts();
  }
  if (state.game.id === wordMatchGame.id) {
    wordMatchGame.normalize(state);
    restoreWordMatchDrafts();
  }

  $("room-code").textContent = roomCode;
  hostMap = createEuropeMap($("host-germany-map"));
  matchingKeyPair = await createMatchingKeyPair();
  matchingPublicKey = await exportMatchingPublicKey(matchingKeyPair.publicKey);
  previousGameId = state.game.id;
  previousGameStatus = state.game.status;
  startRealtime();
  render();
}

function renderGameEffects() {
  const gameId = state.game.id;

  if (previousGameId && previousGameId !== gameId) {
    showGameTransition(gameId);
  } else if ([buzzerGame.id, estimationGame.id].includes(gameId) &&
      previousGameStatus === "not-started" &&
      state.game.status !== "not-started") {
    showGameTransition(gameId);
  }

  previousGameId = gameId;
  previousGameStatus = state.game.status;
}

function render() {
  renderGameEffects();
  $("blue-score").textContent = state.scores.blue;
  $("red-score").textContent = state.scores.red;
  const showWinner = getShowWinner(state);
  $("show-winner-banner").classList.toggle("hidden", !showWinner);
  $("show-winner-banner").textContent = showWinner
    ? `🏆 ${getTeamName(showWinner)} gewinnt die Gameshow mit ${state.scores[showWinner]} Spielpunkten!`
    : "";

  renderPlayers("blue");
  renderPlayers("red");

  const nextGame = getNextGameDefinition(state.game.id);
  $("moderator-test-controls").classList.toggle("hidden", !nextGame);
  $("moderator-next-game-hint").textContent = nextGame
    ? `Überspringt den aktuellen Stand und startet ${nextGame.name}.`
    : "";
  $("force-next-game").disabled = moderatorActionPending;

  const spotifyIsActive = state.game.id === top20Game.id;
  const rankingIsActive = state.game.id === rankingGame.id;
  const mapIsActive = state.game.id === germanyMapGame.id;
  const matchingIsActive = state.game.id === matchingGame.id;
  const priceIsActive = state.game.id === guessThePriceGame.id;
  const estimationIsActive = state.game.id === estimationGame.id;
  const wordMatchIsActive = state.game.id === wordMatchGame.id;
  const chatIsActive = supportsTeamChat(state.game.id);
  $("host-layout").classList.toggle("chat-active", chatIsActive);
  $("host-chat-blue").classList.toggle("hidden", !chatIsActive);
  $("host-chat-red").classList.toggle("hidden", !chatIsActive);
  if (chatIsActive) renderHostTeamChats();
  document.querySelector(".shell").classList.toggle(
    "wide-game",
    spotifyIsActive || rankingIsActive || mapIsActive || matchingIsActive || priceIsActive || estimationIsActive || wordMatchIsActive
  );
  $("buzzer-game-panel").classList.toggle(
    "hidden",
    spotifyIsActive || rankingIsActive || mapIsActive || matchingIsActive || priceIsActive || estimationIsActive || wordMatchIsActive
  );
  $("spotify-game-panel").classList.toggle("hidden", !spotifyIsActive);
  $("ranking-game-panel").classList.toggle("hidden", !rankingIsActive);
  $("map-game-panel").classList.toggle("hidden", !mapIsActive);
  $("matching-game-panel").classList.toggle("hidden", !matchingIsActive);
  $("price-game-panel").classList.toggle("hidden", !priceIsActive);
  $("estimation-game-panel").classList.toggle("hidden", !estimationIsActive);
  $("word-match-game-panel").classList.toggle("hidden", !wordMatchIsActive);

  if (wordMatchIsActive) renderWordMatchGame();
  else if (estimationIsActive) renderEstimationGame();
  else if (priceIsActive) renderPriceGame();
  else if (matchingIsActive) renderMatchingGame();
  else if (mapIsActive) renderMapGame();
  else if (rankingIsActive) renderRankingGame();
  else if (spotifyIsActive) renderSpotifyGame();
  else renderBuzzerGame();
}

function renderPriceDraft(team) {
  const draft = priceDrafts[team];
  const parsedAmount = parseEuroAmount(draft.amount);
  const locked = Boolean(state.game.lockedTeams?.[team]);
  $(`price-${team}-guess`).textContent = parsedAmount === null
    ? draft.amount || "Noch keine Eingabe"
    : formatEuroAmount(parsedAmount);
  $(`price-${team}-lock`).textContent = locked ? "Eingeloggt ✓" : "Offen";
  $(`price-${team}-lock`).className = `status-pill ${locked ? "open" : ""}`;
}

function getNextGameDefinition(gameId) {
  const games = [
    { id: estimationGame.id, name: estimationGame.name },
    { id: guessThePriceGame.id, name: guessThePriceGame.name },
    { id: germanyMapGame.id, name: germanyMapGame.name },
    { id: wordMatchGame.id, name: wordMatchGame.name },
    { id: rankingGame.id, name: rankingGame.name },
    { id: matchingGame.id, name: matchingGame.name },
    { id: buzzerGame.id, name: buzzerGame.name }
  ];
  const currentIndex = games.findIndex((game) => game.id === gameId);
  return currentIndex >= 0 ? games[currentIndex + 1] || null : null;
}

function formatEstimate(value) {
  return Number(value).toLocaleString("de-DE", { maximumFractionDigits: 3 });
}

function renderEstimationGame() {
  const game = state.game;
  const question = getEstimationQuestion(game.roundIndex);
  const isGameNotStarted = game.status === "not-started";
  const isPending = game.status === "question-pending";
  const isGuessing = game.status === "guessing";
  const isReady = game.status === "ready-to-reveal";
  const isRevealed = ["revealed", "finished"].includes(game.status);
  const isFinished = game.status === "finished";
  const hasAverages = Number.isFinite(game.averages?.blue) && Number.isFinite(game.averages?.red);

  $("estimation-round-label").textContent =
    `Frage ${game.roundIndex + 1} von ${ESTIMATION_QUESTIONS.length}`;
  $("estimation-blue-score").textContent = game.roundScores.blue;
  $("estimation-red-score").textContent = game.roundScores.red;
  $("estimation-status").textContent = isPending
    ? "Frage noch nicht gestartet"
    : isGameNotStarted ? "Spiel noch nicht gestartet"
      : isGuessing ? "Spieler schätzen"
      : isReady ? "Bereit zum Aufdecken"
        : isFinished ? "Spiel beendet" : "Ergebnis aufgedeckt";
  $("estimation-status").className = `status-pill ${isGuessing ? "open" : "closed"}`;

  $("estimation-question-card").classList.toggle("hidden", isPending || isGameNotStarted);
  $("estimation-question-number").textContent = `FRAGE ${game.roundIndex + 1}`;
  $("estimation-question").textContent = game.questionPrompt || question.prompt;
  $("estimation-hint").textContent = question.moderatorHint;
  $("estimation-hint").classList.toggle("hidden", !question.moderatorHint || isPending || isGameNotStarted);
  $("estimation-waiting").classList.toggle("hidden", !isPending && !isGameNotStarted);
  $("estimation-waiting").textContent = isGameNotStarted
    ? "Starte Spiel 1, sobald alle Spieler bereit sind."
    : "Starte die erste Frage, sobald alle Spieler bereit sind.";
  $("estimation-submissions").classList.toggle("hidden", isPending || isGameNotStarted);

  $("estimation-submissions").innerHTML = ["blue", "red"].map((team) => {
    const participants = game.participants.filter((item) => item.team === team);
    return `
      <article class="estimation-team ${team}">
        <strong>${getTeamName(team)}</strong>
        ${participants.map((item) => {
          const locked = game.lockedPlayerIds.includes(item.id);
          const rawValue = estimationDrafts.values[item.id] || "";
          const displayValue = rawValue || "Noch keine Eingabe";
          return `<div class="estimation-player-entry">
            <span>${escapeHtml(item.name)}</span>
            <span class="${locked ? "locked" : ""}">${escapeHtml(displayValue)}${locked ? " · ✓" : ""}</span>
          </div>`;
        }).join("")}
        ${Number.isFinite(game.averages?.[team]) ? `
          <div class="estimation-player-entry estimation-average-entry">
            <span>Mittelwert</span>
            <span>Ø ${formatEstimate(game.averages[team])}</span>
          </div>` : ""}
      </article>
    `;
  }).join("");

  $("start-estimation-question").classList.toggle("hidden", !isPending && !isGameNotStarted);
  $("start-estimation-question").textContent = isGameNotStarted
    ? "Spiel 1 starten"
    : game.roundIndex === 0 ? "Erste Frage starten" : "Frage starten";
  $("start-estimation-question").disabled = moderatorActionPending;
  $("reveal-estimation-round").classList.toggle("hidden", !isGuessing && !isReady);
  $("reveal-estimation-round").disabled = moderatorActionPending || !isReady || !hasAverages;
  $("next-estimation-question").classList.toggle("hidden", !isRevealed || isFinished);
  $("next-estimation-question").disabled = moderatorActionPending;
  $("start-price-after-estimation").classList.toggle("hidden", !isFinished);
  $("start-price-after-estimation").disabled = moderatorActionPending;
  $("estimation-result").classList.toggle("hidden", !isRevealed);
  if (!isRevealed) return;
  const result = game.revealed;
  const winnerText = result.roundWinner
    ? `${getTeamName(result.roundWinner)} liegt mit dem Mittelwert näher.`
    : "Beide Team-Mittelwerte sind gleich weit entfernt.";
  const finalText = isFinished
    ? game.winningTeam
      ? `<p>🏆 ${getTeamName(game.winningTeam)} gewinnt Mittelwert!</p>`
      : "<p>Mittelwert endet unentschieden.</p>"
    : "";
  $("estimation-result").innerHTML = `
    <strong class="estimation-result-summary">Richtige Antwort: ${escapeHtml(result.answerDisplay)}</strong>
    <span class="estimation-result-summary">${winnerText}</span>
    ${finalText}
  `;
}

function wordMatchSecondsRemaining() {
  if (!state.game.phaseEndsAt) {
    if (state.game.tiebreak) return WORD_MATCH_TIEBREAK_SECONDS;
    return ["round-pending", "seed-collecting"].includes(state.game.status)
      ? WORD_MATCH_SEED_SECONDS
      : WORD_MATCH_PHASE_SECONDS;
  }
  return Math.max(0, Math.ceil((state.game.phaseEndsAt - Date.now()) / 1000));
}

function formatCountdown(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  return `${String(Math.floor(safeSeconds / 60)).padStart(2, "0")}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

function updateHostWordMatchTimer() {
  if (state?.game?.id !== wordMatchGame.id || !$("word-match-timer")) return;
  $("word-match-timer").textContent = formatCountdown(wordMatchSecondsRemaining());
}

function renderWordMatchGame() {
  const game = state.game;
  const roles = getWordMatchRoles(game);
  const [firstGuessTeam] = getWordMatchGuessOrder(game);
  const isTiebreak = Boolean(game.tiebreak) &&
    ["tiebreak-pending", "tiebreak-playing", "finished"].includes(game.status);
  if (isTiebreak) {
    const turn = getWordMatchTiebreakTurn(game);
    const playing = game.status === "tiebreak-playing";
    const finished = game.status === "finished";
    $("word-match-round-label").textContent = "Finale bei Gleichstand";
    $("word-match-blue-score").textContent = game.tiebreak.scores.blue;
    $("word-match-red-score").textContent = game.tiebreak.scores.red;
    $("word-match-category").textContent = game.tiebreak.category;
    $("word-match-category-card").classList.remove("hidden");
    $("word-match-roles").textContent = finished
      ? "Das Finale ist beendet."
      : `${turn.player?.name || getTeamName(turn.team)} ist dran · Spieler ${turn.playerIndex + 1}`;
    updateHostWordMatchTimer();
    $("word-match-status").textContent = finished
      ? "Spiel beendet" : playing ? "Finale läuft" : "Finale bereit";
    $("word-match-status").className = `status-pill ${playing ? "open" : "closed"}`;
    $("word-match-seed-status").innerHTML = "";
    $("word-match-lists").innerHTML = `<article class="word-match-list word-match-tiebreak-list">
      <strong>Moderator-Liste · Kino</strong>
      ${game.tiebreak.terms.map((term, index) => {
        const claimedBy = game.tiebreak.claimedBy[index];
        return `<div class="word-match-tiebreak-term${claimedBy ? ` claimed ${claimedBy}` : ""}">
          <span>${index + 1}. ${escapeHtml(term)}</span>
          <div>
            <button type="button" class="button tiny blue" data-word-tiebreak-index="${index}" data-word-tiebreak-team="blue"
              ${!playing || claimedBy || turn.team !== "blue" ? " disabled" : ""}>Blau</button>
            <button type="button" class="button tiny danger" data-word-tiebreak-index="${index}" data-word-tiebreak-team="red"
              ${!playing || claimedBy || turn.team !== "red" ? " disabled" : ""}>Rot</button>
          </div>
        </div>`;
      }).join("")}
    </article>`;
    for (const id of [
      "start-word-seed-phase", "finish-word-seed-phase", "start-blue-guess-phase",
      "finish-blue-guess-phase", "start-red-guess-phase", "finish-red-guess-phase",
      "reveal-word-match-round", "next-word-match-round"
    ]) $(id).classList.add("hidden");
    $("start-word-tiebreak").classList.toggle("hidden", game.status !== "tiebreak-pending");
    $("skip-word-tiebreak-turn").classList.toggle("hidden", !playing);
    $("finish-word-tiebreak").classList.toggle("hidden", !playing);
    $("start-ranking-after-word").classList.toggle("hidden", !finished || Boolean(getShowWinner(state)));
    for (const id of ["start-word-tiebreak", "skip-word-tiebreak-turn", "finish-word-tiebreak", "start-ranking-after-word"]) {
      $(id).disabled = moderatorActionPending || wordTimerActionPending;
    }
    $("word-match-result").classList.toggle("hidden", !finished);
    if (finished) {
      $("word-match-result").innerHTML = game.winningTeam
        ? `<strong>Finale: Blau ${game.tiebreak.scores.blue} · Rot ${game.tiebreak.scores.red}</strong><span>🏆 ${getTeamName(game.winningTeam)} gewinnt Begriffsmatch!</span>`
        : `<strong>Finale: Blau ${game.tiebreak.scores.blue} · Rot ${game.tiebreak.scores.red}</strong><span>Das Finale endet unentschieden.</span>`;
    }
    return;
  }
  const category = game.category;
  const isSeedCollecting = game.status === "seed-collecting";
  const isRoundFinished = game.status === "round-finished";
  const isFinished = game.status === "finished";
  $("word-match-round-label").textContent =
    `Runde ${game.roundIndex + 1} von ${WORD_MATCH_CATEGORIES.length}`;
  $("word-match-blue-score").textContent = game.scores.blue;
  $("word-match-red-score").textContent = game.scores.red;
  $("word-match-category").textContent = category;
  $("word-match-category-card").classList.toggle("hidden", game.status === "round-pending");
  $("word-match-roles").textContent =
    `${roles.seeders.blue?.name || "Blau fehlt"} und ${roles.seeders.red?.name || "Rot fehlt"} schreiben · ` +
    `${roles.guessers.blue?.name || "Blau fehlt"} und ${roles.guessers.red?.name || "Rot fehlt"} raten`;
  updateHostWordMatchTimer();

  const statusLabels = {
    "round-pending": "Runde bereit",
    "seed-collecting": "Listen werden geschrieben",
    "blue-guess-pending": "Team Blau bereit",
    "blue-guessing": "Team Blau rät",
    "red-guess-pending": "Team Rot bereit",
    "red-guessing": "Team Rot rät",
    "results-pending": "Ergebnis bereit",
    "round-finished": "Runde beendet",
    finished: "Spiel beendet"
  };
  $("word-match-status").textContent = statusLabels[game.status] || game.status;
  $("word-match-status").className = `status-pill ${game.phaseEndsAt ? "open" : "closed"}`;

  $("word-match-seed-status").innerHTML = ["blue", "red"].map((team) => {
    const seeder = roles.seeders[team];
    const locked = game.lockedSeederIds.includes(seeder?.id);
    return `<span class="${locked ? "ready" : ""}">${escapeHtml(seeder?.name || getTeamName(team))}: ${locked ? "eingeloggt ✓" : isSeedCollecting ? "schreibt…" : "wartet"}</span>`;
  }).join("");

  $("word-match-lists").innerHTML = ["blue", "red"].map((team) => {
    const seeder = roles.seeders[team];
    const terms = wordMatchDrafts.terms[seeder?.id] || emptyWordTerms();
    const clickable = game.status === `${team}-guessing`;
    const editable = game.status === `${firstGuessTeam}-guess-pending`;
    return `<article class="word-match-list ${team}">
      <strong>${getTeamName(team)} · Liste von ${escapeHtml(seeder?.name || "")}</strong>
      ${terms.map((term, index) => {
        if (editable) {
          return `<input class="word-match-term-input" type="text" maxlength="60"
            data-word-edit-player="${escapeHtml(seeder?.id || "")}" data-word-index="${index}"
            value="${escapeHtml(term)}" aria-label="${getTeamName(team)} Begriff ${index + 1}">`;
        }
        const matched = game.currentMatches[team].includes(index);
        const disabled = !clickable || !term ? " disabled" : "";
        return `<button class="word-match-term${matched ? " matched" : ""}${term ? "" : " empty"}"
          type="button" data-word-team="${team}" data-word-index="${index}"${disabled}>
          ${index + 1}. ${escapeHtml(term || "Leer")}${matched ? " ✓" : ""}
        </button>`;
      }).join("")}
    </article>`;
  }).join("");

  $("start-word-seed-phase").classList.toggle("hidden", game.status !== "round-pending");
  $("finish-word-seed-phase").classList.toggle("hidden", !isSeedCollecting);
  $("start-blue-guess-phase").classList.toggle("hidden", game.status !== "blue-guess-pending");
  $("finish-blue-guess-phase").classList.toggle("hidden", game.status !== "blue-guessing");
  $("start-red-guess-phase").classList.toggle("hidden", game.status !== "red-guess-pending");
  $("finish-red-guess-phase").classList.toggle("hidden", game.status !== "red-guessing");
  $("reveal-word-match-round").classList.toggle("hidden", game.status !== "results-pending");
  $("next-word-match-round").classList.toggle("hidden", !isRoundFinished);
  $("start-ranking-after-word").classList.toggle("hidden", !isFinished || Boolean(getShowWinner(state)));
  $("start-word-tiebreak").classList.add("hidden");
  $("skip-word-tiebreak-turn").classList.add("hidden");
  $("finish-word-tiebreak").classList.add("hidden");
  $("start-ranking-after-word").disabled = moderatorActionPending;
  for (const id of [
    "start-word-seed-phase", "finish-word-seed-phase", "start-blue-guess-phase",
    "finish-blue-guess-phase", "start-red-guess-phase", "finish-red-guess-phase",
    "reveal-word-match-round", "next-word-match-round"
  ]) $(id).disabled = moderatorActionPending || wordTimerActionPending;

  const result = game.roundResults[game.roundIndex];
  $("word-match-result").classList.toggle("hidden", !result);
  if (result) {
    const conclusion = isFinished
      ? game.winningTeam
        ? `🏆 ${getTeamName(game.winningTeam)} gewinnt Begriffsmatch!`
        : "Begriffsmatch endet unentschieden."
      : "Bereit für die nächste Runde.";
    $("word-match-result").innerHTML = `
      <strong>Runde ${game.roundIndex + 1}: Blau ${result.blue} · Rot ${result.red}</strong>
      <span>${conclusion}</span>
    `;
  }
}

function renderHostPersonalNotes(containerId, team, notes = {}) {
  const teamPlayers = state.players.filter((item) => item.team === team);
  $(containerId).innerHTML = teamPlayers.length
    ? teamPlayers.map((item) => `
      <div class="private-note-entry">
        <strong>${escapeHtml(item.name)}</strong>
        <p>${escapeHtml(notes[item.id] || "Noch keine Eingabe")}</p>
      </div>
    `).join("")
    : '<span class="muted small">Noch keine Spieler</span>';
}

function renderPriceGame() {
  const game = state.game;
  const product = getPriceProduct(game.roundIndex);
  const isPending = game.status === "product-pending";
  const isRevealed = ["revealed", "finished"].includes(game.status);
  const isFinished = game.status === "finished";
  const showIsFinished = Boolean(getShowWinner(state));
  const bothLocked = game.lockedTeams.blue && game.lockedTeams.red;

  $("price-round-label").textContent =
    `Produkt ${game.roundIndex + 1} von ${PRICE_PRODUCTS.length}`;
  $("price-blue-score").textContent = game.roundScores.blue;
  $("price-red-score").textContent = game.roundScores.red;
  $("price-product-image").src = product.src;
  $("price-product-image").alt = product.name;
  $("price-product-name").textContent = product.name;
  $("price-status").textContent = isFinished
    ? "Spiel beendet"
    : isPending ? "Produkt bereit"
      : isRevealed ? "Preis aufgedeckt" : bothLocked ? "Bereit zum Aufdecken" : "Teams beraten sich";
  $("price-status").className = `status-pill ${isRevealed ? "closed" : "open"}`;

  renderPriceDraft("blue");
  renderPriceDraft("red");

  $("start-first-price-round").classList.toggle("hidden", !isPending);
  $("start-first-price-round").disabled = moderatorActionPending;
  $("reveal-price-round").classList.toggle("hidden", isPending || isRevealed);
  $("reveal-price-round").disabled = moderatorActionPending || isPending || !bothLocked;
  $("next-price-round").classList.toggle("hidden", !isRevealed || isFinished);
  $("next-price-round").disabled = moderatorActionPending;
  $("start-map-after-price").classList.toggle("hidden", !isFinished || showIsFinished);
  $("start-map-after-price").disabled = moderatorActionPending;
  $("price-round-result").classList.toggle("hidden", !isRevealed);

  if (!isRevealed) return;

  const result = game.revealed;
  const roundMessage = result.roundWinner
    ? `${getTeamName(result.roundWinner)} liegt näher.`
    : "Beide Teams liegen exakt gleich weit entfernt.";
  const finalMessage = isFinished
    ? game.winningTeam
      ? `<p>🏆 ${getTeamName(game.winningTeam)} gewinnt Thrifty mit ${game.roundScores[game.winningTeam]} Punkten!</p>`
      : "<p>Thrifty endet unentschieden.</p>"
    : "";
  $("price-round-result").innerHTML = `
    <strong>Preis: ${formatEuroAmount(result.actualPrice)}</strong>
    <span>Blau: ${formatSignedEuroDifference(result.actualPrice, result.guesses.blue)}</span><br>
    <span>Rot: ${formatSignedEuroDifference(result.actualPrice, result.guesses.red)}</span>
    <p>${roundMessage}</p>
    ${finalMessage}
  `;
}

function renderRankingBoard(game, list, interactive = false) {
  const rows = [];
  const proposalIndex = game.proposal ? Number(game.proposal.position) - 1 : -1;
  for (let index = 0; index <= game.placedIds.length; index += 1) {
    if (interactive && game.status === "playing") {
      rows.push(`<button type="button" class="ranking-insert${rankingSelection.position === index + 1 ? " selected" : ""}"
        data-ranking-position="${index + 1}">Position ${index + 1}</button>`);
    }
    if (proposalIndex === index) {
      const proposed = getRankingEntry(list, game.proposal.itemId);
      rows.push(`<div class="ranking-row proposed ${game.proposal.team}" data-ranking-proposal="${escapeHtml(proposed?.id || "")}">
        <span>${index + 1}</span><strong>${escapeHtml(proposed?.label || "")}</strong><small>vorgemerkt</small>
      </div>`);
    }
    if (index < game.placedIds.length) {
      const entry = getRankingEntry(list, game.placedIds[index]);
      const isAnchor = entry?.id === list.anchorId;
      const displayPosition = index + 1 + (proposalIndex >= 0 && proposalIndex <= index ? 1 : 0);
      rows.push(`<div class="ranking-row${isAnchor ? " anchor" : ""}">
        <span>${displayPosition}</span><strong>${escapeHtml(entry?.label || "")}</strong>
        <small>${escapeHtml(entry?.value || "")}${isAnchor ? " · Vorgabe" : ""}</small>
      </div>`);
    }
  }
  return `<div class="ranking-scale-label high">${escapeHtml(list.highLabel)}</div>
    ${rows.join("")}
    <div class="ranking-scale-label low">${escapeHtml(list.lowLabel)}</div>`;
}

function renderRankingGame() {
  const game = state.game;
  const rankingMove = captureRankingMove(game, $("ranking-pool"), $("ranking-board"));
  const list = getRankingList(game.roundIndex);
  const isFinished = game.status === "finished";
  const isRoundFinished = game.status === "round-finished";
  const isNotStarted = game.status === "not-started";
  const displayTeam = game.roundWinner || game.winningTeam || game.currentTeam;
  const interactionLocked = game.status !== "playing";

  $("ranking-round-label").textContent = `Liste ${game.roundIndex + 1} von ${RANKING_LISTS.length}`;
  $("ranking-round-wins").textContent =
    `Listensiege · Blau ${game.roundWins.blue} : ${game.roundWins.red} Rot`;
  $("ranking-title").textContent = list.title;
  $("ranking-turn").textContent = isFinished
    ? game.winningTeam ? `${getTeamName(game.winningTeam)} gewinnt Einordnen!` : "Einordnen endet unentschieden"
    : isRoundFinished
      ? game.roundWinner ? `${getTeamName(game.roundWinner)} gewinnt die Liste!` : "Liste endet unentschieden"
      : isNotStarted ? "Erste Liste noch nicht gestartet" : `${getTeamName(game.currentTeam)} ist dran`;
  $("ranking-turn").className = `turn-card ${displayTeam || "blue"}`;
  $("ranking-strikes").innerHTML =
    `<span>Blau: <strong>${renderStrikes(game.strikes.blue)}</strong></span>` +
    `<span>Rot: <strong>${renderStrikes(game.strikes.red)}</strong></span>`;
  $("ranking-status").textContent = isFinished
    ? "Spiel beendet" : isRoundFinished ? "Liste beendet"
      : game.status === "ready-to-reveal" ? "Bereit zum Aufdecken"
        : game.status === "revealed" ? "Aufgedeckt" : isNotStarted ? "Noch nicht gestartet" : "Einordnung wählen";
  $("ranking-status").className = `status-pill ${interactionLocked ? "closed" : "open"}`;

  $("ranking-board").innerHTML = renderRankingBoard(game, list, true);
  $("ranking-pool").innerHTML = game.remainingIds.filter((id) => id !== game.proposal?.itemId).map((id) => {
    const entry = getRankingEntry(list, id);
    return `<button type="button" class="ranking-candidate${rankingSelection.itemId === id ? " selected" : ""}"
      data-ranking-item="${escapeHtml(id)}"${game.status !== "playing" ? " disabled" : ""}>${escapeHtml(entry?.label || "")}</button>`;
  }).join("");
  playRankingMove(rankingMove, $("ranking-pool"), $("ranking-board"));

  const result = game.lastResult;
  $("ranking-result").classList.toggle("hidden", !result && !isFinished);
  if (result) {
    const entry = getRankingEntry(list, result.itemId);
    const resultText = result.cleanupReveal
      ? `${entry.label} wurde aufgedeckt.`
      : result.correct
      ? `${entry.label} wurde richtig eingeordnet.`
      : `${entry.label} war falsch eingeordnet und bleibt verfügbar.`;
    const conclusion = isFinished
      ? game.winningTeam ? `🏆 ${getTeamName(game.winningTeam)} gewinnt Einordnen!` : "Einordnen endet unentschieden."
      : isRoundFinished && game.roundWinner ? `${getTeamName(game.roundWinner)} gewinnt diese Liste.` : "";
    $("ranking-result").innerHTML = `<strong>${result.cleanupReveal ? "Aufgedeckt" : result.correct ? "✓ Richtig" : "✕ Falsch"}</strong>
      <span>${escapeHtml(resultText)}${result.correct ? ` Wert: ${escapeHtml(entry.value)}` : ""}</span>
      ${conclusion ? `<p>${escapeHtml(conclusion)}</p>` : ""}`;
  } else if (isFinished) {
    $("ranking-result").innerHTML = "<strong>Spiel beendet</strong><span>Einordnen endet unentschieden.</span>";
  }

  $("start-first-ranking-round").classList.toggle("hidden", !isNotStarted);
  $("confirm-ranking-placement").classList.toggle("hidden", game.status !== "playing");
  $("confirm-ranking-placement").disabled = moderatorActionPending ||
    !rankingSelection.itemId || !rankingSelection.position;
  $("reveal-ranking-placement").classList.toggle("hidden", game.status !== "ready-to-reveal");
  $("reveal-next-ranking-entry").classList.toggle(
    "hidden",
    !["round-finished", "finished"].includes(game.status) || !game.remainingIds.length
  );
  $("next-ranking-round").classList.toggle("hidden", !isRoundFinished);
  $("start-matching-after-ranking").classList.toggle("hidden", !isFinished || Boolean(getShowWinner(state)));
  for (const id of ["start-first-ranking-round", "reveal-ranking-placement", "reveal-next-ranking-entry", "next-ranking-round", "start-matching-after-ranking"]) {
    $(id).disabled = moderatorActionPending;
  }
}

function renderBuzzerGame() {
  const status = state.game.status;
  const isNotStarted = status === "not-started";
  const isOpen = status === "open";
  const isLocked = status === "locked";
  const isFinished = status === "finished";
  const winner = state.game.winner;
  const gameScores = state.game.scores || { blue: 0, red: 0 };
  const questionIndex = Number(state.game.questionIndex) || 0;
  const question = getBuzzerQuestion(questionIndex);

  $("buzzer-blue-score").textContent = gameScores.blue;
  $("buzzer-red-score").textContent = gameScores.red;
  $("buzzer-question-number").textContent = `FRAGE ${questionIndex + 1} VON ${BUZZER_QUESTIONS.length}`;
  $("buzzer-question").textContent = question.question;

  $("buzzer-status").textContent = isOpen
    ? "Buzzer offen"
    : isLocked
      ? "Buzzer gesperrt"
      : isFinished
        ? "Spiel beendet"
        : isNotStarted
          ? "Noch nicht gestartet"
          : "Buzzer geschlossen";
  $("buzzer-status").className = `status-pill ${isOpen ? "open" : "closed"}`;

  $("open-buzzer").disabled = moderatorActionPending || status !== "waiting";
  $("reset-buzzer").disabled = moderatorActionPending || isFinished;
  $("skip-buzzer-question").disabled = moderatorActionPending || isNotStarted || isFinished;
  $("correct-answer").disabled = moderatorActionPending;
  $("wrong-answer").disabled = moderatorActionPending;
  $("buzzer-start-controls").classList.toggle("hidden", !isNotStarted);
  $("start-buzzer-game").disabled = moderatorActionPending;
  $("buzzer-question-card").classList.toggle("hidden", isNotStarted);
  $("buzz-result").classList.toggle("hidden", isNotStarted);
  $("buzzer-controls").classList.toggle("hidden", isNotStarted);
  $("answer-controls").classList.toggle("hidden", !winner || isFinished);
  $("buzzer-finished-controls").classList.toggle("hidden", !isFinished);

  if (isFinished) {
    const winningTeam = state.game.winningTeam || (gameScores.blue >= BUZZER_WINNING_SCORE ? "blue" : "red");
    const teamName = getTeamName(winningTeam);
    $("buzzer-winner-message").textContent = `🏆 ${teamName} gewinnt das Buzzer Quiz mit ${gameScores[winningTeam]} Punkten!`;
    $("buzz-result").classList.add("winner");
    $("buzz-result").innerHTML = `<strong>${teamName} gewinnt Spiel 7</strong>`;
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
  const showIsFinished = Boolean(getShowWinner(state));
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
  $("spotify-board").innerHTML = renderSpotifySlots(revealed, list, interactionLocked);
  $("spotify-finished").classList.toggle("hidden", !interactionLocked);
  $("spotify-winner-message").textContent = isFinished
    ? `🏆 ${getTeamName(game.winningTeam)} gewinnt Top 20 mit ${game.roundWins[game.winningTeam]} Rundensiegen!`
    : isRoundFinished
      ? `${getTeamName(game.roundWinner)} gewinnt Liste ${roundNumber}.`
      : "";
  $("next-top20-round").classList.toggle("hidden", isFinished);
  $("start-buzzer-game-after-top20").classList.toggle("hidden", !isFinished || showIsFinished);
  $("next-top20-round").disabled = moderatorActionPending;
  $("start-buzzer-game-after-top20").disabled = moderatorActionPending;

  $("spotify-miss").disabled = interactionLocked || moderatorActionPending;
}

function renderMapGame() {
  const game = state.game;
  const question = GERMANY_MAP_QUESTIONS[game.roundIndex];
  const isPending = game.status === "round-pending";
  const isRevealed = game.status === "revealed" || game.status === "finished";
  const isFinished = game.status === "finished";
  const showIsFinished = Boolean(getShowWinner(state));
  const bothPinsReady = Boolean(game.pins?.blue && game.pins?.red);
  const bothTeamsLocked = Boolean(game.lockedTeams?.blue && game.lockedTeams?.red);

  $("map-round-label").textContent = `Frage ${game.roundIndex + 1} von ${GERMANY_MAP_QUESTIONS.length}`;
  $("map-question-number").textContent = `FRAGE ${game.roundIndex + 1}`;
  $("map-question").textContent = isPending ? "" : question.prompt;
  $("map-question-number").closest(".map-question-card").classList.toggle("hidden", isPending);
  $("map-blue-score").textContent = game.roundScores.blue;
  $("map-red-score").textContent = game.roundScores.red;
  $("map-status").textContent = isFinished
    ? "Spiel beendet"
    : isPending ? "Runde noch nicht gestartet"
    : isRevealed
      ? "Ziel aufgedeckt"
      : "Pins setzen";
  $("map-status").className = `status-pill ${isRevealed ? "closed" : "open"}`;

  hostMap.render({
    pins: game.pins,
    target: question.target,
    revealed: isRevealed,
    locked: true
  });

  $("target-legend").classList.toggle("hidden", !isRevealed);
  $("map-pin-status").innerHTML = isPending ? "Wartet auf den Start der ersten Runde." : `
    <span class="${game.lockedTeams?.blue ? "ready" : ""}">Blau: ${game.lockedTeams?.blue ? "eingeloggt ✓" : game.pins?.blue ? "Pin gesetzt" : "wartet…"}</span>
    <span class="${game.lockedTeams?.red ? "ready" : ""}">Rot: ${game.lockedTeams?.red ? "eingeloggt ✓" : game.pins?.red ? "Pin gesetzt" : "wartet…"}</span>
  `;

  $("start-first-map-round").classList.toggle("hidden", !isPending);
  $("reveal-map-round").classList.toggle("hidden", isRevealed || isPending);
  $("reveal-map-round").disabled = moderatorActionPending || !bothPinsReady || !bothTeamsLocked;
  $("next-map-round").classList.toggle("hidden", !isRevealed || isFinished);
  $("next-map-round").disabled = moderatorActionPending;
  $("start-word-match-game").classList.toggle("hidden", !isFinished || showIsFinished);
  $("start-word-match-game").disabled = moderatorActionPending || state.players.length !== 4;
  $("next-map-round").textContent = game.roundScores[game.roundWinner] >= GERMANY_MAP_ROUNDS_TO_WIN
    ? "Spiel abschließen"
    : "Nächste Frage";
  $("map-result").classList.toggle("hidden", !isRevealed);

  if (isRevealed) {
    const blueDistance = Math.round(game.distances.blue);
    const redDistance = Math.round(game.distances.red);
    const winner = getTeamName(game.roundWinner || game.winningTeam);
    $("map-result").innerHTML = `
      <strong>${escapeHtml(question.answer)} · ${winner} ist näher!</strong>
      <span>Team Blau: ${blueDistance} km · Team Rot: ${redDistance} km</span>
      ${isFinished ? `<p>🏆 ${getTeamName(game.winningTeam)} gewinnt das Kartenspiel!</p>` : ""}
    `;
  }
}

function getMatchingAssignerOrder() {
  return MATCHING_ASSIGNERS.map((assigner) =>
    state.players.filter((player) => player.team === assigner.team)[assigner.playerIndex]
  );
}

function normalizedMatchingValue(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("de");
}

function matchingResultClass(imageAssignments, assignerIndex, hasResult) {
  if (!hasResult) return "";
  const otherIndex = assignerIndex === 0 ? 2 : assignerIndex === 2 ? 0 : assignerIndex === 1 ? 3 : 1;
  const ownValue = normalizedMatchingValue(imageAssignments[assignerIndex]);
  const otherValue = normalizedMatchingValue(imageAssignments[otherIndex]);
  return ownValue && ownValue === otherValue ? " matched" : " missed";
}

function renderMatchingPlayerOptions(selectedValue = "", assignedValues = [], imageIndex = -1) {
  const usedElsewhere = new Set(assignedValues.filter((_, index) => index !== imageIndex));
  return [
    `<option value="">Spieler wählen</option>`,
    ...state.players.map((player) =>
      `<option value="${escapeHtml(player.name)}"${player.name === selectedValue ? " selected" : ""}` +
      `${usedElsewhere.has(player.name) ? " disabled" : ""}>` +
      `${escapeHtml(player.name)}</option>`
    )
  ].join("");
}

function renderMatchingAssignment(roundAssignments, imageIndex, assignerIndex, game, hasResult) {
  const imageAssignments = roundAssignments[imageIndex];
  const assigner = MATCHING_ASSIGNERS[assignerIndex];
  const positions = ["top-left", "top-right", "bottom-left", "bottom-right"];
  const turnIndex = getMatchingTurn(game.roundIndex, 0).assignerIndexes.includes(assignerIndex)
    ? 0
    : getMatchingTurn(game.roundIndex, 1).assignerIndex === assignerIndex ? 1 : 2;
  const alreadySubmitted = turnIndex === 0
    ? game.submittedTeams?.[assigner.team]
    : game.turnSubmitted;
  const isActive = game.status === "assigning" && game.activeTurnIndex === turnIndex &&
    !alreadySubmitted;
  const isFuture = game.status === "assigning" && game.activeTurnIndex < turnIndex;
  const disabled = isActive ? "" : " disabled";
  const value = imageAssignments[assignerIndex] || "";

  return `
    <label class="matching-assignment ${positions[assignerIndex]} ${assigner.team}${isActive ? " active" : ""}${isFuture ? " future" : ""}${matchingResultClass(imageAssignments, assignerIndex, hasResult)}">
      <select data-matching-input="${assignerIndex}" data-image-index="${imageIndex}"
        aria-label="${escapeHtml(assigner.label)}"${disabled}>
        ${renderMatchingPlayerOptions(
          value,
          roundAssignments.map((assignments) => assignments[assignerIndex]),
          imageIndex
        )}
      </select>
    </label>
  `;
}

function renderMatchingBoard(round, game, roundAssignments) {
  const hasResult = game.status === "round-finished" || game.status === "finished";

  return round.images.map((image, imageIndex) => `
    <article class="matching-card">
      <div class="matching-image-frame">
        <img src="${image.src}" alt="${escapeHtml(image.label)}">
        ${MATCHING_ASSIGNERS.map((_, assignerIndex) =>
          renderMatchingAssignment(roundAssignments, imageIndex, assignerIndex, game, hasResult)
        ).join("")}
      </div>
    </article>
  `).join("");
}

function renderMatchingGame() {
  const game = state.game;
  const round = MATCHING_GAME_ROUNDS[game.roundIndex];
  const roundAssignments = matchingAssignments[game.roundIndex] || emptyMatchingAssignments()[0];
  const turn = getMatchingTurn(game.roundIndex, game.activeTurnIndex);
  const activePlayer = turn.assignerIndex === null ? null : game.assignerOrder[turn.assignerIndex];
  const isAssigning = game.status === "assigning";
  const isPending = game.status === "round-pending";
  const isRevealing = ["ready-to-reveal", "revealing"].includes(game.status);
  const isFinished = game.status === "finished";
  const result = game.roundResults[game.roundIndex];

  $("matching-round-label").textContent =
    `Runde ${game.roundIndex + 1} von ${MATCHING_GAME_ROUNDS.length} · ${round.title}`;
  $("matching-blue-score").textContent = game.scores.blue;
  $("matching-red-score").textContent = game.scores.red;
  $("matching-status").textContent = isFinished
    ? "Spiel beendet"
    : isPending ? "Runde noch nicht gestartet"
      : isAssigning ? "Zuordnen" : isRevealing ? "Aufdecken" : "Runde beendet";
  $("matching-status").className = `status-pill ${isAssigning ? "open" : "closed"}`;
  $("matching-board").classList.toggle("hidden", isPending);
  $("matching-board").innerHTML = isPending ? "" : renderMatchingBoard(round, game, roundAssignments);

  if (isPending) {
    $("matching-turn").className = "matching-turn finished";
    $("matching-turn").textContent = "Starte die erste Runde, sobald beide Teams bereit sind.";
  } else if (isAssigning) {
    if (game.activeTurnIndex === 0) {
      const blueIndex = turn.assignerIndexes.find((index) => MATCHING_ASSIGNERS[index].team === "blue");
      const redIndex = turn.assignerIndexes.find((index) => MATCHING_ASSIGNERS[index].team === "red");
      const bluePlayer = game.assignerOrder[blueIndex]?.name || "Spieler fehlt";
      const redPlayer = game.assignerOrder[redIndex]?.name || "Spieler fehlt";
      $("matching-turn").className = "matching-turn split";
      $("matching-turn").textContent =
        `Spieler ${turn.playerIndex + 1} ordnen zu · Blau: ${bluePlayer}${game.submittedTeams?.blue ? " ✓" : ""} · ` +
        `Rot: ${redPlayer}${game.submittedTeams?.red ? " ✓" : ""}`;
    } else {
      const ready = game.turnSubmitted ? " ✓" : "";
      $("matching-turn").className = `matching-turn ${turn.team}`;
      $("matching-turn").textContent =
        `${getTeamName(turn.team)} matcht · ${activePlayer?.name || "Spieler fehlt"}${ready}`;
    }
  } else if (isRevealing) {
    $("matching-turn").className = "matching-turn finished";
    $("matching-turn").textContent = "Die Antworten beider Teams können aufgedeckt werden.";
  } else {
    $("matching-turn").className = "matching-turn finished";
    $("matching-turn").textContent = isFinished
      ? game.roundIndex < MATCHING_GAME_ROUNDS.length - 1
        ? "Das Spiel ist mathematisch entschieden."
        : "Alle vier Runden sind ausgewertet."
      : `Runde ${game.roundIndex + 1} ist ausgewertet.`;
  }

  $("start-first-matching-round").classList.toggle("hidden", !isPending);
  $("start-first-matching-round").disabled = moderatorActionPending;
  $("save-matching-assignment").classList.toggle("hidden", !isAssigning);
  $("save-matching-assignment").disabled = moderatorActionPending ||
    (game.activeTurnIndex === 0
      ? game.submittedTeams?.blue && game.submittedTeams?.red
      : game.turnSubmitted);
  $("complete-matching-turn").classList.toggle(
    "hidden",
    !isAssigning || (game.activeTurnIndex === 0
      ? !game.submittedTeams?.blue || !game.submittedTeams?.red
      : !game.turnSubmitted)
  );
  $("complete-matching-turn").disabled = moderatorActionPending;
  const nextTurn = getMatchingTurn(game.roundIndex, game.activeTurnIndex + 1);
  $("complete-matching-turn").textContent = game.activeTurnIndex === 0
    ? `Spieler ${nextTurn.playerIndex + 1} · Team Blau`
    : game.activeTurnIndex === 1
      ? `Spieler ${nextTurn.playerIndex + 1} · Team Rot`
      : "Antworten aufdecken";
  $("reveal-matching-all").classList.toggle("hidden", !isRevealing);
  $("reveal-matching-all").disabled = moderatorActionPending;
  $("next-matching-round").classList.toggle("hidden", game.status !== "round-finished");
  $("next-matching-round").disabled = moderatorActionPending;
  $("start-buzzer-after-matching").classList.toggle("hidden", !isFinished || Boolean(getShowWinner(state)));
  $("start-buzzer-after-matching").disabled = moderatorActionPending;
  $("matching-round-result").classList.toggle("hidden", !result);

  if (result) {
    const conclusion = isFinished
      ? game.winningTeam
        ? `🏆 ${getTeamName(game.winningTeam)} gewinnt Da seh ich dich!`
        : "Da seh ich dich endet unentschieden."
      : "Bereit für die nächste Runde.";
    $("matching-round-result").innerHTML = `
      <strong>Team Blau: ${result.blue} Punkte · Team Rot: ${result.red} Punkte</strong>
      <span>${conclusion}</span>
    `;
  }
}

function renderSpotifySlots(revealed, list, interactionLocked) {
  return Array.from({ length: TOP_20_SLOT_COUNT }, (_, index) => {
    const slot = revealed[index];
    const teamClass = slot?.team || "empty";
    const answer = slot ? escapeHtml(slot.answer) : "Noch offen";
    const value = slot
      ? `<span class="value">${escapeHtml(slot.value)}</span>`
      : "";
    const rank = index + 1;
    const disabled = slot || interactionLocked || moderatorActionPending ? " disabled" : "";
    const label = slot ? `Rang ${rank}: ${slot.answer}` : `Rang ${rank} aufdecken`;

    return `
      <button class="spotify-slot top20-reveal ${teamClass}" type="button" data-rank="${rank}" aria-label="${escapeHtml(label)}"${disabled}>
        <span class="rank">${rank}</span>
        <span class="artist">${answer}${value}</span>
      </button>
    `;
  }).join("");
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

function formatChatTime(sentAt) {
  return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" })
    .format(new Date(sentAt));
}

function renderTypingIndicator(names) {
  if (!names.length) return "";
  return `<div class="team-chat-typing"><span>${escapeHtml(names.join(" & "))} tippt</span>` +
    '<i></i><i></i><i></i></div>';
}

function renderHostTeamChats() {
  for (const team of ["blue", "red"]) {
    const container = $(`host-chat-${team}`);
    const view = getTeamChatView(teamChat, team);
    const teamPlayers = state.players.filter((item) => item.team === team);
    const messages = view.messages.length
      ? view.messages.map((message) => {
        const playerIndex = teamPlayers.findIndex((item) => item.id === message.senderId);
        const side = playerIndex === 1 ? "right" : "left";
        return `
        <div class="team-chat-message ${side}">
          <div class="team-chat-meta"><strong>${escapeHtml(message.senderName)}</strong><time>${formatChatTime(message.sentAt)}</time></div>
          <p>${escapeHtml(message.text)}</p>
        </div>`;
      }).join("")
      : '<p class="team-chat-empty">Noch keine Nachrichten</p>';
    container.innerHTML = `<article class="team-chat moderator ${team}">
      <header><strong>Team ${team === "blue" ? "Blau" : "Rot"} · Chat</strong></header>
      <div class="team-chat-messages">${messages}</div>
      ${renderTypingIndicator(view.typing.map((entry) => entry.name))}
    </article>`;
    const list = container.querySelector(".team-chat-messages");
    list.scrollTop = list.scrollHeight;
  }
}

async function broadcastState() {
  const publicState = structuredClone(state);
  if (supportsTeamChat(state.game.id)) {
    publicState.teamChatSubmissionKey = matchingPublicKey;
  }
  if (state.game.id === guessThePriceGame.id) {
    publicState.priceSubmissionKey = matchingPublicKey;
  }
  if (state.game.id === estimationGame.id) {
    publicState.estimationSubmissionKey = matchingPublicKey;
    if (state.game.status === "ready-to-reveal") publicState.game.averages = null;
  }
  if (state.game.id === matchingGame.id) {
    publicState.matchingSubmissionKey = matchingPublicKey;
  }
  if (state.game.id === wordMatchGame.id) {
    publicState.wordMatchSubmissionKey = matchingPublicKey;
    if (publicState.game.tiebreak) publicState.game.tiebreak.terms = [];
    if (["blue-guess-pending", "blue-guessing", "red-guess-pending", "red-guessing", "results-pending"]
      .includes(state.game.status)) {
      publicState.game.currentMatches = { blue: [], red: [] };
    }
  }
  await realtime.send("room_state", publicState);
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
    const previousActionGameId = state.game.id;
    if (!action()) return false;
    if (state.game.id !== previousActionGameId) {
      teamChat = createTeamChat(supportsTeamChat(state.game.id) ? state.game.id : null);
    }
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

async function sendTop20PrivateState(playerId) {
  if (state.game.id !== top20Game.id) return false;
  const roomPlayer = state.players.find((item) => item.id === playerId);
  const publicKey = pricePlayerKeys.get(playerId);
  if (!roomPlayer || !publicKey) return false;

  try {
    const encrypted = await encryptPrivatePayload(publicKey, {
      roundIndex: state.game.roundIndex,
      notes: top20Notes[roomPlayer.team].notes
    });
    await realtime.send("top20_private_state", { playerId, encrypted });
    return true;
  } catch (error) {
    console.warn("Private Top 20 note could not be encrypted:", error);
    return false;
  }
}

async function syncTop20Team(team) {
  const teamPlayers = state.players.filter((player) => player.team === team);
  await Promise.all(teamPlayers.map((player) => sendTop20PrivateState(player.id)));
}

async function syncAllTop20Teams() {
  await Promise.all([syncTop20Team("blue"), syncTop20Team("red")]);
}

async function handleTop20Submission(payload) {
  if (state.game.id !== top20Game.id || state.game.status !== "playing" ||
      !payload?.playerId || !payload.encrypted || !matchingKeyPair?.privateKey) return;

  const player = state.players.find((item) => item.id === payload.playerId);
  if (!player) return;

  try {
    const submission = await decryptPrivatePayload(matchingKeyPair.privateKey, payload.encrypted);
    if (submission?.playerId !== player.id || submission.roundIndex !== state.game.roundIndex) return;

    top20Notes[player.team].notes[player.id] = String(submission.text || "").slice(0, 280);
    saveTop20Notes();
    render();
    await syncTop20Team(player.team);
  } catch (error) {
    console.warn("Encrypted Top 20 note could not be processed:", error);
  }
}

async function sendPricePrivateState(playerId) {
  if (state.game.id !== guessThePriceGame.id) return false;
  const roomPlayer = state.players.find((item) => item.id === playerId);
  const publicKey = pricePlayerKeys.get(playerId);
  if (!roomPlayer || !publicKey) return false;

  try {
    const encrypted = await encryptPrivatePayload(publicKey, {
      roundIndex: state.game.roundIndex,
      draft: priceDrafts[roomPlayer.team],
      locked: Boolean(state.game.lockedTeams?.[roomPlayer.team])
    });
    await realtime.send("price_private_state", { playerId, encrypted });
    return true;
  } catch (error) {
    console.warn("Private price state could not be encrypted:", error);
    return false;
  }
}

async function syncPriceTeam(team) {
  const teamPlayers = state.players.filter((player) => player.team === team);
  await Promise.all(teamPlayers.map((player) => sendPricePrivateState(player.id)));
}

async function syncAllPriceTeams() {
  await Promise.all([syncPriceTeam("blue"), syncPriceTeam("red")]);
}

function getMatchingSeederIndex(playerId) {
  const index = state.game.assignerOrder?.findIndex((item) => item.id === playerId) ?? -1;
  const seederIndexes = getMatchingTurn(state.game.roundIndex, 0).assignerIndexes;
  return seederIndexes.includes(index) ? index : -1;
}

async function sendMatchingPrivateState(playerId) {
  if (state.game.id !== matchingGame.id) return false;
  const assignerIndex = getMatchingSeederIndex(playerId);
  const publicKey = pricePlayerKeys.get(playerId);
  if (assignerIndex < 0 || !publicKey) return false;
  const team = MATCHING_ASSIGNERS[assignerIndex].team;
  const roundAssignments = matchingAssignments[state.game.roundIndex];
  const seederIndexes = getMatchingTurn(state.game.roundIndex, 0).assignerIndexes;
  const opponentIndex = seederIndexes.find((index) => index !== assignerIndex);
  const bothTeamsSubmitted = Boolean(
    state.game.submittedTeams?.blue && state.game.submittedTeams?.red
  );

  try {
    const encrypted = await encryptPrivatePayload(publicKey, {
      roundIndex: state.game.roundIndex,
      values: roundAssignments.map((imageAssignments) => imageAssignments[assignerIndex]),
      locked: Boolean(state.game.submittedTeams?.[team]),
      opponentAssignerIndex: bothTeamsSubmitted ? opponentIndex : null,
      opponentValues: bothTeamsSubmitted
        ? roundAssignments.map((imageAssignments) => imageAssignments[opponentIndex])
        : null
    });
    await realtime.send("matching_private_state", { playerId, encrypted });
    return true;
  } catch (error) {
    console.warn("Private matching state could not be encrypted:", error);
    return false;
  }
}

async function syncMatchingSeeders() {
  const seederIndexes = getMatchingTurn(state.game.roundIndex, 0).assignerIndexes;
  await Promise.all(seederIndexes.map((index) =>
    sendMatchingPrivateState(state.game.assignerOrder[index]?.id)
  ));
}

async function handleMatchingSubmission(payload) {
  if (state.game.id !== matchingGame.id || state.game.status !== "assigning" ||
      state.game.activeTurnIndex !== 0 || !payload?.playerId || !payload.encrypted ||
      !matchingKeyPair?.privateKey) return;
  const assignerIndex = getMatchingSeederIndex(payload.playerId);
  if (assignerIndex < 0) return;
  const player = state.game.assignerOrder[assignerIndex];
  const team = MATCHING_ASSIGNERS[assignerIndex].team;
  if (state.game.submittedTeams?.[team]) return;

  try {
    const submission = await decryptPrivatePayload(matchingKeyPair.privateKey, payload.encrypted);
    const valid = submission?.playerId === player.id &&
      submission.roundIndex === state.game.roundIndex &&
      ["draft", "lock"].includes(submission.type) &&
      Array.isArray(submission.values) && submission.values.length === 4;
    if (!valid) return;

    const values = submission.values.map((value) => String(value || "").trim());
    const registeredNames = new Set(state.players.map((item) => item.name));
    const hasInvalidValue = values.some((value) => value && !registeredNames.has(value));
    if (hasInvalidValue) return;

    const roundAssignments = matchingAssignments[state.game.roundIndex];
    values.forEach((value, imageIndex) => {
      roundAssignments[imageIndex][assignerIndex] = value;
    });
    saveMatchingAssignments();

    if (submission.type === "lock") {
      const complete = values.every(Boolean);
      const unique = areMatchingValuesUnique(values);
      const accepted = complete && unique && matchingGame.submitTeam(state, team);
      await realtime.send("matching_lock_result", {
        playerId: player.id,
        accepted,
        reason: !complete
          ? "Bitte ordne allen vier Bildern eine Person zu."
          : !unique ? "Jeder Spielername darf nur einmal verwendet werden." : ""
      });
      if (accepted) {
        await persistRenderAndBroadcast();
        await syncMatchingSeeders();
      }
      else render();
    } else {
      render();
    }
    await sendMatchingPrivateState(player.id);
  } catch (error) {
    console.warn("Encrypted matching assignment could not be processed:", error);
  }
}

async function handlePriceKeyRegistration(payload) {
  const roomPlayer = state.players.find((item) => item.id === payload?.playerId);
  if (!roomPlayer || !payload?.publicKey || payload.publicKey.kty !== "RSA") return;
  pricePlayerKeys.set(roomPlayer.id, payload.publicKey);
  if (state.game.id === guessThePriceGame.id) await sendPricePrivateState(roomPlayer.id);
  if (state.game.id === estimationGame.id) await sendEstimationPrivateState(roomPlayer.id);
  if (state.game.id === wordMatchGame.id) await sendWordMatchPrivateState(roomPlayer.id);
  if (state.game.id === matchingGame.id) await sendMatchingPrivateState(roomPlayer.id);
}

function teamChatIsWritable(team) {
  if (state.game.id === top20Game.id) return state.game.status === "playing";
  if (state.game.id === rankingGame.id) {
    return ["playing", "ready-to-reveal"].includes(state.game.status);
  }
  if (state.game.id === germanyMapGame.id) {
    return state.game.status === "placing" && !state.game.lockedTeams?.[team];
  }
  if (state.game.id === guessThePriceGame.id) {
    return state.game.status === "guessing" && !state.game.lockedTeams?.[team];
  }
  return false;
}

async function sendTeamChatPrivateUpdate(playerId, team, update) {
  if (!supportsTeamChat(state.game.id) || teamChat.gameId !== state.game.id) return false;
  const roomPlayer = state.players.find((item) => item.id === playerId);
  const publicKey = pricePlayerKeys.get(playerId);
  if (!roomPlayer || roomPlayer.team !== team || !publicKey) return false;
  try {
    const encrypted = await encryptPrivatePayload(publicKey, {
      gameId: state.game.id,
      team,
      ...update
    });
    await realtime.send("team_chat_private_update", { playerId, encrypted });
    return true;
  } catch (error) {
    console.warn("Private team chat update could not be encrypted:", error);
    return false;
  }
}

async function syncTeamChatUpdate(team, update) {
  const teamPlayers = state.players.filter((item) => item.team === team);
  await Promise.all(teamPlayers.map((item) => sendTeamChatPrivateUpdate(item.id, team, update)));
}

async function handleTeamChatSubmission(payload) {
  if (!supportsTeamChat(state.game.id) || teamChat.gameId !== state.game.id ||
      !payload?.playerId || !payload.encrypted || !matchingKeyPair?.privateKey) return;
  const player = state.players.find((item) => item.id === payload.playerId);
  if (!player || !teamChatIsWritable(player.team)) return;
  try {
    const submission = await decryptPrivatePayload(matchingKeyPair.privateKey, payload.encrypted);
    if (submission?.playerId !== player.id || submission.gameId !== state.game.id) return;
    let update;
    if (submission.type === "message") {
      if (!addTeamChatMessage(teamChat, player.team, player, submission.text, crypto.randomUUID())) return;
      update = { type: "message", message: teamChat[player.team].messages.at(-1) };
    } else if (submission.type === "typing") {
      const isTyping = Boolean(submission.isTyping);
      setTeamChatTyping(teamChat, player.team, player, isTyping);
      update = {
        type: "typing",
        player: { playerId: player.id, name: player.name },
        isTyping
      };
    } else return;
    render();
    await syncTeamChatUpdate(player.team, update);
  } catch (error) {
    console.warn("Encrypted team chat submission could not be processed:", error);
  }
}

async function sendWordMatchPrivateState(playerId) {
  if (state.game.id !== wordMatchGame.id) return false;
  const participant = state.game.participants?.find((item) => item.id === playerId);
  const publicKey = pricePlayerKeys.get(playerId);
  if (!participant || !publicKey) return false;
  try {
    const roles = getWordMatchRoles(state.game);
    const isSeeder = Object.values(roles.seeders).some((item) => item?.id === playerId);
    const listsAvailable = isSeeder && !["round-pending", "seed-collecting"].includes(state.game.status);
    const encrypted = await encryptPrivatePayload(publicKey, {
      roundIndex: state.game.roundIndex,
      terms: wordMatchDrafts.terms[playerId] || emptyWordTerms(),
      locked: state.game.lockedSeederIds.includes(playerId),
      lists: listsAvailable ? getWordMatchLists() : null
    });
    await realtime.send("word_match_private_state", { playerId, encrypted });
    return true;
  } catch (error) {
    console.warn("Private word list could not be encrypted:", error);
    return false;
  }
}

async function syncWordMatchSeeders() {
  const roles = getWordMatchRoles(state.game);
  await Promise.all(Object.values(roles.seeders).map((item) =>
    item ? sendWordMatchPrivateState(item.id) : false
  ));
}

async function handleWordMatchSubmission(payload) {
  if (state.game.id !== wordMatchGame.id || state.game.status !== "seed-collecting" ||
      !payload?.playerId || !payload.encrypted || !matchingKeyPair?.privateKey) return;
  const roles = getWordMatchRoles(state.game);
  const seeder = Object.values(roles.seeders).find((item) => item?.id === payload.playerId);
  if (!seeder || state.game.lockedSeederIds.includes(seeder.id)) return;
  try {
    const submission = await decryptPrivatePayload(matchingKeyPair.privateKey, payload.encrypted);
    const valid = submission?.playerId === seeder.id &&
      submission.roundIndex === state.game.roundIndex &&
      ["draft", "lock"].includes(submission.type) && Array.isArray(submission.terms);
    if (!valid) return;
    wordMatchDrafts.terms[seeder.id] = emptyWordTerms().map((_, index) =>
      String(submission.terms[index] || "").trim().slice(0, 60)
    );
    saveWordMatchDrafts();
    render();

    if (submission.type === "lock") {
      const accepted = wordMatchGame.lockSeeder(state, seeder.id);
      await realtime.send("word_match_lock_result", {
        playerId: seeder.id,
        accepted,
        reason: accepted ? "" : "Die Liste konnte nicht eingeloggt werden."
      });
      if (accepted) await persistRenderAndBroadcast();
      if (accepted && state.game.status === `${getWordMatchGuessOrder(state.game)[0]}-guess-pending`) {
        await syncWordMatchSeeders();
        return;
      }
    }
    await sendWordMatchPrivateState(seeder.id);
  } catch (error) {
    console.warn("Encrypted word list could not be processed:", error);
  }
}

async function sendEstimationPrivateState(playerId) {
  if (state.game.id !== estimationGame.id) return false;
  const participant = state.game.participants?.find((item) => item.id === playerId);
  const publicKey = pricePlayerKeys.get(playerId);
  if (!participant || !publicKey) return false;
  try {
    const partner = state.game.participants.find((item) =>
      item.team === participant.team && item.id !== participant.id
    );
    const teamResultAvailable = state.game.status === "ready-to-reveal";
    const allGuesses = teamResultAvailable
      ? Object.fromEntries(state.game.participants.map((item) => [
          item.id,
          estimationDrafts.values[item.id] || ""
        ]))
      : null;
    const encrypted = await encryptPrivatePayload(publicKey, {
      roundIndex: state.game.roundIndex,
      value: estimationDrafts.values[playerId] || "",
      locked: state.game.lockedPlayerIds.includes(playerId),
      partnerName: teamResultAvailable ? partner?.name || "Teampartner" : "",
      partnerValue: teamResultAvailable ? estimationDrafts.values[partner?.id] || "" : "",
      teamAverage: teamResultAvailable ? state.game.averages?.[participant.team] ?? null : null,
      allGuesses,
      averages: teamResultAvailable ? state.game.averages : null
    });
    await realtime.send("estimation_private_state", { playerId, encrypted });
    return true;
  } catch (error) {
    console.warn("Private estimation state could not be encrypted:", error);
    return false;
  }
}

async function syncAllEstimationPlayers() {
  await Promise.all((state.game.participants || []).map((item) =>
    sendEstimationPrivateState(item.id)
  ));
}

async function handleEstimationSubmission(payload) {
  if (state.game.id !== estimationGame.id || state.game.status !== "guessing" ||
      !payload?.playerId || !payload.encrypted || !matchingKeyPair?.privateKey) return;
  const participant = state.game.participants.find((item) => item.id === payload.playerId);
  if (!participant || state.game.lockedPlayerIds.includes(participant.id)) return;

  try {
    const submission = await decryptPrivatePayload(matchingKeyPair.privateKey, payload.encrypted);
    const valid = submission?.playerId === participant.id &&
      submission.roundIndex === state.game.roundIndex &&
      ["draft", "lock"].includes(submission.type);
    if (!valid) return;
    const value = String(submission.value || "").slice(0, 40);
    estimationDrafts.values[participant.id] = value;
    saveEstimationDrafts();
    render();

    if (submission.type === "lock") {
      if (parseEstimate(value) === null) {
        await realtime.send("estimation_lock_result", {
          playerId: participant.id,
          accepted: false,
          reason: "Bitte gib eine gültige Zahl ein."
        });
        await sendEstimationPrivateState(participant.id);
        return;
      }
      const accepted = estimationGame.lockPlayer(state, participant.id);
      if (accepted && state.game.status === "ready-to-reveal") {
        const estimates = {};
        for (const item of state.game.participants) {
          const estimate = parseEstimate(estimationDrafts.values[item.id]);
          if (estimate === null) {
            state.game.status = "guessing";
            state.game.lockedPlayerIds = state.game.lockedPlayerIds.filter((id) => id !== participant.id);
            await realtime.send("estimation_lock_result", {
              playerId: participant.id,
              accepted: false,
              reason: "Die Mittelwerte konnten nicht berechnet werden."
            });
            await sendEstimationPrivateState(participant.id);
            return;
          }
          estimates[item.id] = estimate;
        }
        estimationGame.prepareRound(state, estimates);
      }
      await realtime.send("estimation_lock_result", {
        playerId: participant.id,
        accepted,
        reason: accepted ? "" : "Die Schätzung konnte nicht eingeloggt werden."
      });
      if (accepted) {
        await persistRenderAndBroadcast();
        if (state.game.status === "ready-to-reveal") {
          await syncAllEstimationPlayers();
          return;
        }
      }
    }
    await sendEstimationPrivateState(participant.id);
  } catch (error) {
    console.warn("Encrypted estimation submission could not be processed:", error);
  }
}

async function sendMapPrivateState(playerId) {
  if (state.game.id !== germanyMapGame.id) return false;
  const roomPlayer = state.players.find((item) => item.id === playerId);
  const publicKey = pricePlayerKeys.get(playerId);
  if (!roomPlayer || !publicKey) return false;

  try {
    const encrypted = await encryptPrivatePayload(publicKey, {
      roundIndex: state.game.roundIndex,
      notes: mapNotes[roomPlayer.team].notes
    });
    await realtime.send("map_private_state", { playerId, encrypted });
    return true;
  } catch (error) {
    console.warn("Private map notes could not be encrypted:", error);
    return false;
  }
}

async function syncMapTeam(team) {
  const teamPlayers = state.players.filter((item) => item.team === team);
  await Promise.all(teamPlayers.map((item) => sendMapPrivateState(item.id)));
}

async function syncAllMapTeams() {
  await Promise.all([syncMapTeam("blue"), syncMapTeam("red")]);
}

async function handleMapSubmission(payload) {
  if (state.game.id !== germanyMapGame.id || state.game.status !== "placing" ||
      !payload?.playerId || !payload.encrypted || !matchingKeyPair?.privateKey) return;
  const player = state.players.find((item) => item.id === payload.playerId);
  if (!player) return;

  try {
    const submission = await decryptPrivatePayload(matchingKeyPair.privateKey, payload.encrypted);
    if (submission?.playerId !== player.id || submission.roundIndex !== state.game.roundIndex) return;
    mapNotes[player.team].notes[player.id] = String(submission.text || "").slice(0, 280);
    saveMapNotes();
    render();
    await syncMapTeam(player.team);
  } catch (error) {
    console.warn("Encrypted map note could not be processed:", error);
  }
}

async function handlePriceSubmission(payload) {
  if (state.game.id !== guessThePriceGame.id || state.game.status !== "guessing" ||
      !payload?.playerId || !payload.encrypted || !matchingKeyPair?.privateKey) return;

  const player = state.players.find((item) => item.id === payload.playerId);
  if (!player || state.game.lockedTeams[player.team]) return;

  try {
    const submission = await decryptPrivatePayload(
      matchingKeyPair.privateKey,
      payload.encrypted
    );
    const valid = submission?.playerId === player.id &&
      submission.roundIndex === state.game.roundIndex &&
      ["amount", "lock"].includes(submission.type);
    if (!valid) return;

    const amount = String(submission.amount || "").slice(0, 40);
    const teamDraft = priceDrafts[player.team];
    if (submission.type === "amount" || submission.type === "lock") {
      teamDraft.amount = amount;
      teamDraft.updatedBy = player.id;
    }
    savePriceDrafts();
    render();

    if (submission.type === "lock") {
      const parsedAmount = parseEuroAmount(amount);
      if (parsedAmount === null) {
        await realtime.send("price_lock_result", {
          playerId: player.id,
          accepted: false,
          reason: "Bitte gebt zuerst einen gültigen Euro-Betrag ein."
        });
        await syncPriceTeam(player.team);
        return;
      }

      const accepted = guessThePriceGame.lockTeam(state, player.team);
      await realtime.send("price_lock_result", {
        playerId: player.id,
        accepted,
        reason: accepted ? "" : "Der Team-Preis konnte nicht eingeloggt werden."
      });
      if (accepted) await persistRenderAndBroadcast();
    }

    await syncPriceTeam(player.team);
  } catch (error) {
    console.warn("Encrypted price submission could not be processed:", error);
  }
}

async function handleEvent(event, payload) {
  if (event === "buzz_winner") {
    void playBuzzerSound();
    return;
  }

  if (event === "player_join") {
    await handlePlayerJoin(payload.player);
    return;
  }

  if (event === "request_state") {
    await broadcastState();
    return;
  }

  if (event === "price_key_registration") {
    await handlePriceKeyRegistration(payload);
    return;
  }

  if (event === "price_private_submission") {
    await handlePriceSubmission(payload);
    return;
  }

  if (event === "team_chat_private_submission") {
    await handleTeamChatSubmission(payload);
    return;
  }

  if (event === "estimation_private_submission") {
    await handleEstimationSubmission(payload);
    return;
  }

  if (event === "matching_private_submission") {
    await handleMatchingSubmission(payload);
    return;
  }

  if (event === "word_match_private_submission") {
    await handleWordMatchSubmission(payload);
    return;
  }

  if (event === "map_pin") {
    const player = state.players.find((item) => item.id === payload.playerId);
    if (!player || !germanyMapGame.placePin(state, player.team, payload.position)) return;
    await persistRenderAndBroadcast();
    return;
  }

  if (event === "map_lock") {
    const player = state.players.find((item) => item.id === payload.playerId);
    if (!player || !germanyMapGame.lockTeam(state, player.team)) return;
    await persistRenderAndBroadcast();
    return;
  }

  if (event === "buzz") {
    const player = state.players.find((item) => item.id === payload.playerId);
    if (!player || !buzzerGame.registerBuzz(state, player)) return;
    await realtime.send("buzz_winner", {
      playerId: player.id,
      receivedAt: state.game.winner.receivedAt
    });
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

$("force-next-game").addEventListener("click", async () => {
  $("force-next-game-error").textContent = "";
  const currentGameId = state.game.id;
  const assignerOrder = currentGameId === rankingGame.id
    ? getMatchingAssignerOrder()
    : [];

  if (currentGameId === estimationGame.id && state.players.length !== 4) {
    $("force-next-game-error").textContent =
      "Für Thrifty müssen alle vier Spieler im Raum sein.";
    return;
  }
  if (currentGameId === germanyMapGame.id && state.players.length !== 4) {
    $("force-next-game-error").textContent =
      "Für Begriffsmatch müssen alle vier Spieler im Raum sein.";
    return;
  }
  if (currentGameId === rankingGame.id && assignerOrder.some((item) => !item)) {
    $("force-next-game-error").textContent =
      "Für Da seh ich dich müssen zwei Spieler pro Team im Raum sein.";
    return;
  }

  const accepted = await runModeratorAction(() => {
    if (currentGameId === estimationGame.id) {
      if (!guessThePriceGame.start(state)) return false;
      priceDrafts = emptyPriceDrafts(0);
      savePriceDrafts();
      return true;
    }
    if (currentGameId === guessThePriceGame.id) {
      germanyMapGame.start(state);
      mapNotes = emptyMapNotes(0);
      saveMapNotes();
      return true;
    }
    if (currentGameId === germanyMapGame.id) {
      if (!wordMatchGame.start(state, state.players)) return false;
      wordMatchDrafts = emptyWordMatchDrafts(0);
      saveWordMatchDrafts();
      return true;
    }
    if (currentGameId === wordMatchGame.id) {
      rankingGame.start(state);
      rankingSelection = { itemId: null, position: null };
      return true;
    }
    if (currentGameId === rankingGame.id) {
      if (!matchingGame.start(state, assignerOrder)) return false;
      matchingAssignments = emptyMatchingAssignments();
      saveMatchingAssignments();
      return true;
    }
    if ([matchingGame.id, top20Game.id].includes(currentGameId)) {
      buzzerGame.start(state);
      return true;
    }
    return false;
  });

  if (!accepted) {
    $("force-next-game-error").textContent = "Das nächste Spiel konnte nicht gestartet werden.";
    return;
  }

  if (state.game.id === guessThePriceGame.id) await syncAllPriceTeams();
  if (state.game.id === top20Game.id) await syncAllTop20Teams();
  if (state.game.id === germanyMapGame.id) await syncAllMapTeams();
  if (state.game.id === estimationGame.id) await syncAllEstimationPlayers();
  if (state.game.id === wordMatchGame.id) await syncWordMatchSeeders();
});

$("open-buzzer").addEventListener("click", async () => {
  await runModeratorAction(() => buzzerGame.open(state));
});

$("reset-buzzer").addEventListener("click", async () => {
  await runModeratorAction(() => buzzerGame.reset(state));
});

$("skip-buzzer-question").addEventListener("click", async () => {
  await runModeratorAction(() => buzzerGame.advanceQuestion(state));
});

$("correct-answer").addEventListener("click", async () => {
  await runModeratorAction(() => {
    if (!buzzerGame.awardPoint(state)) return false;
    if (state.game.status !== "finished") buzzerGame.advanceQuestion(state);
    return true;
  });
});

$("start-buzzer-game").addEventListener("click", async () => {
  await runModeratorAction(() => buzzerGame.start(state));
});

$("wrong-answer").addEventListener("click", async () => {
  await runModeratorAction(() => {
    return buzzerGame.awardOpponentPoint(state);
  });
});

$("spotify-board").addEventListener("click", async (event) => {
  const slot = event.target.closest("[data-rank]");
  if (!slot || slot.disabled) return;

  $("spotify-error").textContent = "";

  const accepted = await runModeratorAction(() => top20Game.reveal(
    state,
    Number(slot.dataset.rank)
  ));

  if (!accepted) {
    $("spotify-error").textContent = "Diese Lösung kann gerade nicht aufgedeckt werden.";
  }
});

$("spotify-miss").addEventListener("click", async () => {
  $("spotify-error").textContent = "";
  await runModeratorAction(() => top20Game.recordMiss(state));
});

$("next-top20-round").addEventListener("click", async () => {
  $("spotify-error").textContent = "";
  const nextRoundIndex = state.game.roundIndex + 1;
  const accepted = await runModeratorAction(() => {
    if (!top20Game.startNextRound(state)) return false;
    top20Notes = emptyTop20Notes(nextRoundIndex);
    saveTop20Notes();
    return true;
  });
  if (accepted) await syncAllTop20Teams();
});

$("ranking-pool").addEventListener("click", (event) => {
  const item = event.target.closest("[data-ranking-item]");
  if (!item || item.disabled || state.game.id !== rankingGame.id || state.game.status !== "playing") return;
  rankingSelection.itemId = item.dataset.rankingItem;
  renderRankingGame();
});

$("ranking-board").addEventListener("click", (event) => {
  const position = event.target.closest("[data-ranking-position]");
  if (!position || state.game.id !== rankingGame.id || state.game.status !== "playing") return;
  rankingSelection.position = Number(position.dataset.rankingPosition);
  renderRankingGame();
});

$("confirm-ranking-placement").addEventListener("click", async () => {
  $("ranking-error").textContent = "";
  const accepted = await runModeratorAction(() => rankingGame.proposePlacement(
    state,
    rankingSelection.itemId,
    rankingSelection.position
  ));
  if (accepted) rankingSelection = { itemId: null, position: null };
  else $("ranking-error").textContent = "Diese Einordnung konnte nicht übernommen werden.";
});

$("reveal-ranking-placement").addEventListener("click", async () => {
  $("ranking-error").textContent = "";
  await runModeratorAction(() => rankingGame.revealPlacement(state));
});

$("reveal-next-ranking-entry").addEventListener("click", async () => {
  $("ranking-error").textContent = "";
  await runModeratorAction(() => rankingGame.revealNextRemaining(state));
});

$("start-first-ranking-round").addEventListener("click", async () => {
  await runModeratorAction(() => rankingGame.startFirstRound(state));
});

$("next-ranking-round").addEventListener("click", async () => {
  rankingSelection = { itemId: null, position: null };
  await runModeratorAction(() => rankingGame.startNextRound(state));
});

$("start-matching-after-ranking").addEventListener("click", async () => {
  $("ranking-error").textContent = "";
  const assignerOrder = getMatchingAssignerOrder();
  if (assignerOrder.some((player) => !player)) {
    $("ranking-error").textContent =
      "Für Da seh ich dich müssen zwei Spieler pro Team im Raum sein.";
    return;
  }
  await runModeratorAction(() => {
    if (getShowWinner(state) || state.game.id !== rankingGame.id || state.game.status !== "finished") return false;
    if (!matchingGame.start(state, assignerOrder)) return false;
    matchingAssignments = emptyMatchingAssignments();
    saveMatchingAssignments();
    return true;
  });
});

$("start-buzzer-game-after-top20").addEventListener("click", async () => {
  $("spotify-error").textContent = "";
  await runModeratorAction(() => {
    if (getShowWinner(state) || state.game.id !== top20Game.id || state.game.status !== "finished") return false;
    return buzzerGame.start(state);
  });
});

$("start-map-after-price").addEventListener("click", async () => {
  const accepted = await runModeratorAction(() => {
    if (getShowWinner(state) || state.game.id !== guessThePriceGame.id || state.game.status !== "finished") return false;
    if (!germanyMapGame.start(state)) return false;
    mapNotes = emptyMapNotes(0);
    saveMapNotes();
    return true;
  });
  if (accepted) await syncAllMapTeams();
});

$("reveal-map-round").addEventListener("click", async () => {
  await runModeratorAction(() => germanyMapGame.revealRound(state));
});

$("next-map-round").addEventListener("click", async () => {
  const nextRoundIndex = state.game.roundIndex + 1;
  const accepted = await runModeratorAction(() => {
    if (!germanyMapGame.startNextRound(state)) return false;
    mapNotes = emptyMapNotes(nextRoundIndex);
    saveMapNotes();
    return true;
  });
  if (accepted) await syncAllMapTeams();
});

$("start-first-map-round").addEventListener("click", async () => {
  await runModeratorAction(() => germanyMapGame.startFirstRound(state));
});

$("start-price-after-estimation").addEventListener("click", async () => {
  $("estimation-error").textContent = "";
  if (state.players.length !== 4) {
    $("estimation-error").textContent = "Für Thrifty müssen alle vier Spieler im Raum sein.";
    return;
  }

  const accepted = await runModeratorAction(() => {
    if (getShowWinner(state) || state.game.id !== estimationGame.id || state.game.status !== "finished") return false;
    if (!guessThePriceGame.start(state)) return false;
    priceDrafts = emptyPriceDrafts(0);
    savePriceDrafts();
    return true;
  });
  if (accepted) await syncAllPriceTeams();
});

$("start-first-matching-round").addEventListener("click", async () => {
  $("matching-error").textContent = "";
  const accepted = await runModeratorAction(() => matchingGame.startFirstRound(state));
  if (accepted) await syncMatchingSeeders();
});

$("matching-board").addEventListener("change", async (event) => {
  const select = event.target.closest("[data-matching-input][data-image-index]");
  if (!select || select.disabled || state.game.id !== matchingGame.id ||
      state.game.status !== "assigning") return;

  const assignerIndex = Number(select.dataset.matchingInput);
  const imageIndex = Number(select.dataset.imageIndex);
  const roundAssignments = matchingAssignments[state.game.roundIndex];
  $("matching-error").textContent = "";
  roundAssignments[imageIndex][assignerIndex] = select.value;
  saveMatchingAssignments();
  renderMatchingGame();
  if (getMatchingTurn(state.game.roundIndex, 0).assignerIndexes.includes(assignerIndex)) {
    const player = state.game.assignerOrder?.[assignerIndex];
    if (player) await sendMatchingPrivateState(player.id);
  }
});

$("save-matching-assignment").addEventListener("click", async () => {
  $("matching-error").textContent = "";
  const turnIndex = state.game.activeTurnIndex;
  const turn = getMatchingTurn(state.game.roundIndex, turnIndex);
  const registeredNames = new Set(state.players.map((player) => player.name));
  const assignerIndexes = turn.assignerIndexes.filter((assignerIndex) => {
    const team = MATCHING_ASSIGNERS[assignerIndex].team;
    return turnIndex !== 0 || !state.game.submittedTeams?.[team];
  });
  const entries = assignerIndexes.map((assignerIndex) => {
    const inputs = [...document.querySelectorAll(`[data-matching-input="${assignerIndex}"]`)];
    return { assignerIndex, values: inputs.map((input) => input.value.trim()) };
  });
  const completeEntries = entries.filter(({ values }) =>
    values.length === 4 && values.every((value) => value && registeredNames.has(value)) &&
    areMatchingValuesUnique(values)
  );

  if (!completeEntries.length) {
    const hasDuplicates = entries.some(({ values }) =>
      values.filter(Boolean).length !== new Set(values.filter(Boolean)).size
    );
    $("matching-error").textContent = hasDuplicates
      ? "Jeder Spielername darf pro Zuordnung nur einmal verwendet werden."
      : "Bitte für mindestens ein offenes Team alle vier Personen auswählen.";
    return;
  }

  await runModeratorAction(() => {
    if (state.game.id !== matchingGame.id || state.game.status !== "assigning" ||
        state.game.activeTurnIndex !== turnIndex) return false;

    const roundAssignments = matchingAssignments[state.game.roundIndex];
    let submitted = false;
    for (const { assignerIndex, values } of completeEntries) {
      values.forEach((value, imageIndex) => {
        roundAssignments[imageIndex][assignerIndex] = value;
      });
      const team = MATCHING_ASSIGNERS[assignerIndex].team;
      submitted = matchingGame.submitTeam(state, team) || submitted;
    }
    if (!submitted) return false;
    saveMatchingAssignments();
    return true;
  });
  await syncMatchingSeeders();
});

$("complete-matching-turn").addEventListener("click", async () => {
  $("matching-error").textContent = "";
  const shouldReveal = state.game.activeTurnIndex === MATCHING_TURNS.length - 1;
  await runModeratorAction(() => {
    if (!matchingGame.completeTurn(state)) return false;
    if (!shouldReveal) return true;

    const roundAssignments = matchingAssignments[state.game.roundIndex];
    const assignments = {
      blue: roundAssignments.map((values) => [values[0], values[2]]),
      red: roundAssignments.map((values) => [values[1], values[3]])
    };
    return matchingGame.revealAll(state, assignments);
  });
});

$("reveal-matching-all").addEventListener("click", async () => {
  $("matching-error").textContent = "";
  const roundAssignments = matchingAssignments[state.game.roundIndex];
  const assignments = {
    blue: roundAssignments.map((values) => [values[0], values[2]]),
    red: roundAssignments.map((values) => [values[1], values[3]])
  };
  await runModeratorAction(() => matchingGame.revealAll(state, assignments));
});

$("next-matching-round").addEventListener("click", async () => {
  $("matching-error").textContent = "";
  const accepted = await runModeratorAction(() => matchingGame.startNextRound(state));
  if (accepted) await syncMatchingSeeders();
});

$("start-estimation-question").addEventListener("click", async () => {
  $("estimation-error").textContent = "";
  if (state.game.status === "not-started") {
    if (state.players.length !== 4) {
      $("estimation-error").textContent = "Für Mittelwert müssen alle vier Spieler im Raum sein.";
      return;
    }
    const gameStarted = await runModeratorAction(() => {
      if (!estimationGame.start(state, state.players)) return false;
      estimationDrafts = emptyEstimationDrafts(0);
      saveEstimationDrafts();
      return true;
    });
    if (gameStarted) await syncAllEstimationPlayers();
    return;
  }
  const question = getEstimationQuestion(state.game.roundIndex);
  const accepted = await runModeratorAction(() =>
    estimationGame.startQuestion(state, question.prompt)
  );
  if (accepted) await syncAllEstimationPlayers();
});

$("reveal-estimation-round").addEventListener("click", async () => {
  $("estimation-error").textContent = "";
  const estimates = {};
  for (const participant of state.game.participants || []) {
    const value = parseEstimate(estimationDrafts.values[participant.id]);
    if (value === null) {
      $("estimation-error").textContent = "Alle vier Spieler benötigen eine gültige Schätzung.";
      return;
    }
    estimates[participant.id] = value;
  }
  const question = getEstimationQuestion(state.game.roundIndex);
  await runModeratorAction(() => estimationGame.revealRound(
    state,
    estimates,
    question.answer,
    question.answerDisplay
  ));
});

$("next-estimation-question").addEventListener("click", async () => {
  $("estimation-error").textContent = "";
  const nextRoundIndex = state.game.roundIndex + 1;
  const question = getEstimationQuestion(nextRoundIndex);
  const accepted = await runModeratorAction(() => {
    if (!estimationGame.startNextQuestion(state, question.prompt)) return false;
    estimationDrafts = emptyEstimationDrafts(nextRoundIndex);
    saveEstimationDrafts();
    return true;
  });
  if (accepted) await syncAllEstimationPlayers();
});

$("start-word-match-game").addEventListener("click", async () => {
  $("map-next-game-error").textContent = "";
  if (state.players.length !== 4) {
    $("map-next-game-error").textContent = "Für Begriffsmatch müssen alle vier Spieler im Raum sein.";
    return;
  }
  const accepted = await runModeratorAction(() => {
    if (getShowWinner(state) || state.game.id !== germanyMapGame.id || state.game.status !== "finished") return false;
    if (!wordMatchGame.start(state, state.players)) return false;
    wordMatchDrafts = emptyWordMatchDrafts(0);
    saveWordMatchDrafts();
    return true;
  });
  if (accepted) await syncWordMatchSeeders();
});

$("start-word-seed-phase").addEventListener("click", async () => {
  $("word-match-error").textContent = "";
  const accepted = await runModeratorAction(() => {
    if (!wordMatchGame.startSeedPhase(state, WORD_MATCH_CATEGORIES[state.game.roundIndex])) return false;
    wordMatchDrafts = emptyWordMatchDrafts(state.game.roundIndex);
    const roles = getWordMatchRoles(state.game);
    for (const seeder of Object.values(roles.seeders)) {
      wordMatchDrafts.terms[seeder.id] = emptyWordTerms();
    }
    saveWordMatchDrafts();
    return true;
  });
  if (accepted) await syncWordMatchSeeders();
});

$("finish-word-seed-phase").addEventListener("click", async () => {
  const accepted = await runModeratorAction(() => wordMatchGame.finishSeedPhase(state));
  if (accepted) await syncWordMatchSeeders();
});

$("start-blue-guess-phase").addEventListener("click", async () => {
  clearTimeout(wordMatchEditTimer);
  const accepted = await runModeratorAction(() => wordMatchGame.startGuessPhase(state, "blue"));
  if (accepted) await syncWordMatchSeeders();
});

$("finish-blue-guess-phase").addEventListener("click", async () => {
  await runModeratorAction(() => wordMatchGame.finishGuessPhase(state, "blue"));
});

$("start-red-guess-phase").addEventListener("click", async () => {
  clearTimeout(wordMatchEditTimer);
  const accepted = await runModeratorAction(() => wordMatchGame.startGuessPhase(state, "red"));
  if (accepted) await syncWordMatchSeeders();
});

$("finish-red-guess-phase").addEventListener("click", async () => {
  await runModeratorAction(() => wordMatchGame.finishGuessPhase(state, "red"));
});

$("reveal-word-match-round").addEventListener("click", async () => {
  await runModeratorAction(() => wordMatchGame.revealRound(state, getWordMatchLists()));
});

$("word-match-lists").addEventListener("input", (event) => {
  const input = event.target.closest("[data-word-edit-player][data-word-index]");
  const firstGuessTeam = getWordMatchGuessOrder(state.game)[0];
  if (!input || state.game.status !== `${firstGuessTeam}-guess-pending`) return;
  const playerId = input.dataset.wordEditPlayer;
  const index = Number(input.dataset.wordIndex);
  if (!wordMatchDrafts.terms[playerId] || !Number.isInteger(index) ||
      index < 0 || index >= WORD_MATCH_TERM_COUNT) return;
  wordMatchDrafts.terms[playerId][index] = input.value.slice(0, 60);
  saveWordMatchDrafts();
  clearTimeout(wordMatchEditTimer);
  wordMatchEditTimer = setTimeout(() => void syncWordMatchSeeders(), 250);
});

$("word-match-lists").addEventListener("click", async (event) => {
  const tiebreakButton = event.target.closest("[data-word-tiebreak-index][data-word-tiebreak-team]");
  if (tiebreakButton) {
    await runModeratorAction(() => wordMatchGame.claimTiebreakTerm(
      state,
      Number(tiebreakButton.dataset.wordTiebreakIndex),
      tiebreakButton.dataset.wordTiebreakTeam
    ));
    return;
  }
  const button = event.target.closest("[data-word-team][data-word-index]");
  if (!button || button.disabled) return;
  await runModeratorAction(() => wordMatchGame.toggleMatch(
    state,
    button.dataset.wordTeam,
    Number(button.dataset.wordIndex)
  ));
});

$("start-word-tiebreak").addEventListener("click", async () => {
  await runModeratorAction(() => wordMatchGame.startTiebreaker(state));
});

$("skip-word-tiebreak-turn").addEventListener("click", async () => {
  await runModeratorAction(() => wordMatchGame.skipTiebreakTurn(state));
});

$("finish-word-tiebreak").addEventListener("click", async () => {
  await runModeratorAction(() => wordMatchGame.finishTiebreaker(state));
});

$("next-word-match-round").addEventListener("click", async () => {
  const nextRoundIndex = state.game.roundIndex + 1;
  const accepted = await runModeratorAction(() => {
    if (!wordMatchGame.startNextRound(state)) return false;
    wordMatchDrafts = emptyWordMatchDrafts(nextRoundIndex);
    saveWordMatchDrafts();
    return true;
  });
  if (accepted) await syncWordMatchSeeders();
});

async function tickWordMatchTimer() {
  if (state?.game?.id !== wordMatchGame.id) return;
  updateHostWordMatchTimer();
  const status = state.game.status;
  if (!state.game.phaseEndsAt || wordTimerActionPending || moderatorActionPending) return;
  const grace = status === "seed-collecting" ? 600 : 0;
  if (Date.now() < state.game.phaseEndsAt + grace) return;

  wordTimerActionPending = true;
  try {
    let accepted = false;
    if (status === "seed-collecting") {
      accepted = await runModeratorAction(() => wordMatchGame.finishSeedPhase(state));
      if (accepted) await syncWordMatchSeeders();
    } else if (status === "blue-guessing") {
      accepted = await runModeratorAction(() => wordMatchGame.finishGuessPhase(state, "blue"));
    } else if (status === "red-guessing") {
      accepted = await runModeratorAction(() => wordMatchGame.finishGuessPhase(state, "red"));
    } else if (status === "tiebreak-playing") {
      accepted = await runModeratorAction(() => wordMatchGame.finishTiebreaker(state));
    }
  } finally {
    wordTimerActionPending = false;
    render();
  }
}

setInterval(() => void tickWordMatchTimer(), 250);

setInterval(() => {
  if (!supportsTeamChat(state?.game?.id) || teamChat.gameId !== state.game.id) return;
  const expiredEntries = clearExpiredTeamChatTyping(teamChat);
  if (!expiredEntries.length) return;
  render();
  for (const entry of expiredEntries) {
    void syncTeamChatUpdate(entry.team, {
      type: "typing",
      player: { playerId: entry.playerId, name: entry.name },
      isTyping: false
    });
  }
}, 750);

$("start-ranking-after-word").addEventListener("click", async () => {
  $("word-match-error").textContent = "";
  await runModeratorAction(() => {
    if (getShowWinner(state) || state.game.id !== wordMatchGame.id || state.game.status !== "finished") return false;
    rankingSelection = { itemId: null, position: null };
    return rankingGame.start(state);
  });
});

$("start-buzzer-after-matching").addEventListener("click", async () => {
  await runModeratorAction(() => {
    if (getShowWinner(state) || state.game.id !== matchingGame.id || state.game.status !== "finished") return false;
    return buzzerGame.start(state);
  });
});

$("start-first-price-round").addEventListener("click", async () => {
  $("price-error").textContent = "";
  const accepted = await runModeratorAction(() => guessThePriceGame.startFirstRound(state));
  if (accepted) await syncAllPriceTeams();
});

$("reveal-price-round").addEventListener("click", async () => {
  $("price-error").textContent = "";
  const guesses = {
    blue: parseEuroAmount(priceDrafts.blue.amount),
    red: parseEuroAmount(priceDrafts.red.amount)
  };

  if (guesses.blue === null || guesses.red === null) {
    $("price-error").textContent = "Beide Teams benötigen einen gültigen Preis.";
    return;
  }

  await runModeratorAction(() => guessThePriceGame.revealRound(state, guesses));
});

$("next-price-round").addEventListener("click", async () => {
  $("price-error").textContent = "";
  const nextRoundIndex = state.game.roundIndex + 1;
  const accepted = await runModeratorAction(() => {
    if (!guessThePriceGame.startNextRound(state)) return false;
    priceDrafts = emptyPriceDrafts(nextRoundIndex);
    savePriceDrafts();
    return true;
  });
  if (accepted) await syncAllPriceTeams();
});

window.addEventListener("beforeunload", () => {
  realtime?.close();
});

initializeHost().catch((error) => {
  console.error(error);
  alert("Der Raum konnte nicht gestartet werden. Siehe Browser-Konsole.");
});
