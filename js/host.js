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
import { playBuzzerSound } from "./audio.js";
import { registerGame } from "./games/game-engine.js";
import { BUZZER_WINNING_SCORE, buzzerGame } from "./games/buzzer.js";
import { top20Game } from "./games/spotify-top-artists.js";
import { TOP_20_LISTS, TOP_20_SLOT_COUNT, getTop20List } from "./games/top-20-lists.js";
import { GERMANY_MAP_QUESTIONS, GERMANY_MAP_ROUNDS_TO_WIN, germanyMapGame } from "./games/germany-map.js";
import { createGermanyMap } from "./germany-map-view.js";
import {
  MATCHING_ASSIGNERS,
  MATCHING_GAME_ROUNDS,
  MATCHING_TURNS,
  areMatchingValuesUnique,
  getMatchingTurn,
  getPrivateMatchingAssignments,
  matchingGame
} from "./games/matching-game.js";
import {
  formatEuroAmount,
  guessThePriceGame,
  parseEuroAmount
} from "./games/guess-the-price.js";
import { PRICE_PRODUCTS, getPriceProduct } from "./games/guess-the-price-products.js";
import {
  createMatchingKeyPair,
  decryptMatchingSubmission,
  exportMatchingPublicKey
} from "./matching-crypto.js";
import { decryptPrivatePayload, encryptPrivatePayload } from "./private-channel-crypto.js";
import { showGameTransition } from "./game-effects.js";

registerGame(buzzerGame);
registerGame(top20Game);
registerGame(germanyMapGame);
registerGame(matchingGame);
registerGame(guessThePriceGame);

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
let priceDrafts = emptyPriceDrafts();
const pricePlayerKeys = new Map();
let previousGameId = null;

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

function emptyTop20Notes(roundIndex = 0) {
  return {
    roundIndex,
    blue: { text: "", updatedBy: null },
    red: { text: "", updatedBy: null }
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
        text: String(saved[team]?.text || "").slice(0, 280),
        updatedBy: saved[team]?.updatedBy || null
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
    blue: { amount: "", comment: "", updatedBy: null },
    red: { amount: "", comment: "", updatedBy: null }
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
        comment: String(saved[team]?.comment || "").slice(0, 280),
        updatedBy: saved[team]?.updatedBy || null
      };
    }
    return true;
  } catch (error) {
    console.warn("Private price drafts could not be restored:", error);
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

  if (state.game.id === top20Game.id) {
    top20Game.normalize(state);
    restoreTop20Notes();
  }
  if (state.game.id === germanyMapGame.id) germanyMapGame.normalize(state);
  if (state.game.id === matchingGame.id) {
    matchingGame.normalize(state);
    const assignmentsRestored = restoreMatchingAssignments();
    if (!assignmentsRestored && state.game.status === "assigning") {
      state.game.activeTurnIndex = 0;
      state.game.submittedTeams = { blue: false, red: false };
    }
  }
  if (state.game.id === guessThePriceGame.id) {
    guessThePriceGame.normalize(state);
    restorePriceDrafts();
  }

  $("room-code").textContent = roomCode;
  hostMap = createGermanyMap($("host-germany-map"));
  matchingKeyPair = await createMatchingKeyPair();
  matchingPublicKey = await exportMatchingPublicKey(matchingKeyPair.publicKey);
  previousGameId = state.game.id;
  startRealtime();
  render();
}

function renderGameEffects() {
  const gameId = state.game.id;

  if (previousGameId && previousGameId !== gameId) {
    showGameTransition(gameId);
  }

  previousGameId = gameId;
}

function render() {
  renderGameEffects();
  $("blue-score").textContent = state.scores.blue;
  $("red-score").textContent = state.scores.red;

  renderPlayers("blue");
  renderPlayers("red");

  const spotifyIsActive = state.game.id === top20Game.id;
  const mapIsActive = state.game.id === germanyMapGame.id;
  const matchingIsActive = state.game.id === matchingGame.id;
  const priceIsActive = state.game.id === guessThePriceGame.id;
  document.querySelector(".shell").classList.toggle(
    "wide-game",
    spotifyIsActive || mapIsActive || matchingIsActive || priceIsActive
  );
  $("buzzer-game-panel").classList.toggle(
    "hidden",
    spotifyIsActive || mapIsActive || matchingIsActive || priceIsActive
  );
  $("spotify-game-panel").classList.toggle("hidden", !spotifyIsActive);
  $("map-game-panel").classList.toggle("hidden", !mapIsActive);
  $("matching-game-panel").classList.toggle("hidden", !matchingIsActive);
  $("price-game-panel").classList.toggle("hidden", !priceIsActive);

  if (priceIsActive) renderPriceGame();
  else if (matchingIsActive) renderMatchingGame();
  else if (mapIsActive) renderMapGame();
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
  $(`price-${team}-comment`).textContent = draft.comment || "Noch kein Kommentar";
  $(`price-${team}-lock`).textContent = locked ? "Eingeloggt ✓" : "Offen";
  $(`price-${team}-lock`).className = `status-pill ${locked ? "open" : ""}`;
}

function renderPriceGame() {
  const game = state.game;
  const product = getPriceProduct(game.roundIndex);
  const isRevealed = ["revealed", "finished"].includes(game.status);
  const isFinished = game.status === "finished";
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
    : isRevealed ? "Preis aufgedeckt" : bothLocked ? "Bereit zum Aufdecken" : "Teams beraten sich";
  $("price-status").className = `status-pill ${isRevealed ? "closed" : "open"}`;

  renderPriceDraft("blue");
  renderPriceDraft("red");

  $("reveal-price-round").classList.toggle("hidden", isRevealed);
  $("reveal-price-round").disabled = moderatorActionPending || !bothLocked;
  $("next-price-round").classList.toggle("hidden", !isRevealed || isFinished);
  $("next-price-round").disabled = moderatorActionPending;
  $("price-round-result").classList.toggle("hidden", !isRevealed);

  if (!isRevealed) return;

  const result = game.revealed;
  const roundMessage = result.roundWinner
    ? `${getTeamName(result.roundWinner)} liegt näher.`
    : "Beide Teams liegen exakt gleich weit entfernt.";
  const finalMessage = isFinished
    ? game.winningTeam
      ? `<p>🏆 ${getTeamName(game.winningTeam)} gewinnt das Preisratespiel mit ${game.roundScores[game.winningTeam]} Punkten!</p>`
      : "<p>Das Preisratespiel endet unentschieden.</p>"
    : "";
  const overallWinner = state.scores.blue === state.scores.red
    ? null
    : state.scores.blue > state.scores.red ? "blue" : "red";
  const overallMessage = isFinished
    ? `<p><strong>${overallWinner
      ? `🎉 ${getTeamName(overallWinner)} gewinnt die gesamte Gameshow!`
      : "Die Gameshow endet insgesamt unentschieden."}</strong><br>` +
      `Gesamtstand: Blau ${state.scores.blue} · ${state.scores.red} Rot</p>`
    : "";
  $("price-round-result").innerHTML = `
    <strong>Amazon-Preis: ${formatEuroAmount(result.actualPrice)}</strong>
    <span>Blau: ${formatEuroAmount(result.guesses.blue)} (${formatEuroAmount(result.differences.blue)} entfernt)</span><br>
    <span>Rot: ${formatEuroAmount(result.guesses.red)} (${formatEuroAmount(result.differences.red)} entfernt)</span>
    <p>${roundMessage}</p>
    ${finalMessage}
    ${overallMessage}
  `;
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
  $("spotify-board").innerHTML = renderSpotifySlots(revealed, list, interactionLocked);
  $("top20-blue-note").textContent = top20Notes.blue.text || "Noch keine Eingabe";
  $("top20-red-note").textContent = top20Notes.red.text || "Noch keine Eingabe";
  $("spotify-finished").classList.toggle("hidden", !interactionLocked);
  $("spotify-winner-message").textContent = isFinished
    ? `🏆 ${getTeamName(game.winningTeam)} gewinnt Top 20 mit ${game.roundWins[game.winningTeam]} Rundensiegen!`
    : isRoundFinished
      ? `${getTeamName(game.roundWinner)} gewinnt Liste ${roundNumber}.`
      : "";
  $("next-top20-round").classList.toggle("hidden", isFinished);
  $("start-map-game").classList.toggle("hidden", !isFinished);
  $("next-top20-round").disabled = moderatorActionPending;
  $("start-map-game").disabled = moderatorActionPending;

  $("spotify-miss").disabled = interactionLocked || moderatorActionPending;
}

function renderMapGame() {
  const game = state.game;
  const question = GERMANY_MAP_QUESTIONS[game.roundIndex];
  const isRevealed = game.status === "revealed" || game.status === "finished";
  const isFinished = game.status === "finished";
  const bothPinsReady = Boolean(game.pins?.blue && game.pins?.red);

  $("map-round-label").textContent = `Frage ${game.roundIndex + 1} von ${GERMANY_MAP_QUESTIONS.length}`;
  $("map-question-number").textContent = `FRAGE ${game.roundIndex + 1}`;
  $("map-question").textContent = question.prompt;
  $("map-blue-score").textContent = game.roundScores.blue;
  $("map-red-score").textContent = game.roundScores.red;
  $("map-status").textContent = isFinished
    ? "Spiel beendet"
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
  $("map-pin-status").innerHTML = `
    <span class="${game.pins?.blue ? "ready" : ""}">Blau: ${game.pins?.blue ? "Pin gesetzt ✓" : "wartet…"}</span>
    <span class="${game.pins?.red ? "ready" : ""}">Rot: ${game.pins?.red ? "Pin gesetzt ✓" : "wartet…"}</span>
  `;

  $("reveal-map-round").classList.toggle("hidden", isRevealed);
  $("reveal-map-round").disabled = moderatorActionPending || !bothPinsReady;
  $("next-map-round").classList.toggle("hidden", !isRevealed || isFinished);
  $("next-map-round").disabled = moderatorActionPending;
  $("start-matching-game").classList.toggle("hidden", !isFinished);
  $("start-matching-game").disabled = moderatorActionPending ||
    state.players.filter((player) => player.team === "blue").length !== 2 ||
    state.players.filter((player) => player.team === "red").length !== 2;
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

function renderMatchingPlayerOptions(selectedValue = "", usedValues = []) {
  return [
    `<option value="">Spieler wählen</option>`,
    ...state.players.map((player) =>
      `<option value="${escapeHtml(player.name)}"${player.name === selectedValue ? " selected" : ""}` +
      `${usedValues.includes(player.name) && player.name !== selectedValue ? " disabled" : ""}>` +
      `${escapeHtml(player.name)}</option>`
    )
  ].join("");
}

function renderMatchingAssignment(roundAssignments, imageIndex, assignerIndex, game, hasResult) {
  const imageAssignments = roundAssignments[imageIndex];
  const assigner = MATCHING_ASSIGNERS[assignerIndex];
  const positions = ["top-left", "top-right", "bottom-left", "bottom-right"];
  const turnIndex = [0, 1].findIndex((index) =>
    getMatchingTurn(game.roundIndex, index).assignerIndexes[assigner.team] === assignerIndex
  );
  const isActive = game.status === "assigning" && game.activeTurnIndex === turnIndex &&
    !game.submittedTeams[assigner.team];
  const isFuture = game.status === "assigning" && game.activeTurnIndex < turnIndex;
  const disabled = isActive ? "" : " disabled";
  const value = imageAssignments[assignerIndex] || "";
  const usedValues = roundAssignments.map((assignments) => assignments[assignerIndex]).filter(Boolean);

  return `
    <label class="matching-assignment ${positions[assignerIndex]} ${assigner.team}${isActive ? " active" : ""}${isFuture ? " future" : ""}${matchingResultClass(imageAssignments, assignerIndex, hasResult)}">
      <select data-matching-input="${assignerIndex}" data-image-index="${imageIndex}"
        aria-label="${escapeHtml(assigner.label)}"${disabled}>
        ${renderMatchingPlayerOptions(value, usedValues)}
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
  const bluePlayer = game.assignerOrder[turn.assignerIndexes.blue];
  const redPlayer = game.assignerOrder[turn.assignerIndexes.red];
  const isAssigning = game.status === "assigning";
  const isRevealing = ["ready-to-reveal", "revealing"].includes(game.status);
  const isFinished = game.status === "finished";
  const result = game.roundResults[game.roundIndex];

  $("matching-round-label").textContent =
    `Runde ${game.roundIndex + 1} von ${MATCHING_GAME_ROUNDS.length} · ${round.title}`;
  $("matching-blue-score").textContent = game.scores.blue;
  $("matching-red-score").textContent = game.scores.red;
  $("matching-status").textContent = isFinished
    ? "Spiel beendet"
    : isAssigning ? "Zuordnen" : isRevealing ? "Aufdecken" : "Runde beendet";
  $("matching-status").className = `status-pill ${isAssigning ? "open" : "closed"}`;
  $("matching-board").innerHTML = renderMatchingBoard(round, game, roundAssignments);

  if (isAssigning) {
    const blueReady = game.submittedTeams.blue ? " ✓" : "";
    const redReady = game.submittedTeams.red ? " ✓" : "";
    $("matching-turn").className = "matching-turn split";
    $("matching-turn").textContent =
      `${turn.label}: ${bluePlayer?.name || "Blau fehlt"} (Blau${blueReady}) und ` +
      `${redPlayer?.name || "Rot fehlt"} (Rot${redReady}) ordnen gleichzeitig zu.`;
  } else if (isRevealing) {
    $("matching-turn").className = "matching-turn finished";
    $("matching-turn").textContent = "Alle Antworten können jetzt gemeinsam aufgedeckt werden.";
  } else {
    $("matching-turn").className = "matching-turn finished";
    $("matching-turn").textContent = isFinished
      ? "Alle vier Runden sind ausgewertet."
      : `Runde ${game.roundIndex + 1} ist ausgewertet.`;
  }

  $("save-matching-assignment").classList.toggle("hidden", !isAssigning);
  $("save-matching-assignment").disabled = moderatorActionPending;
  $("complete-matching-turn").classList.toggle(
    "hidden",
    !isAssigning || !game.submittedTeams.blue || !game.submittedTeams.red
  );
  $("complete-matching-turn").disabled = moderatorActionPending;
  $("complete-matching-turn").textContent = game.activeTurnIndex === MATCHING_TURNS.length - 1
    ? "Antworten aufdecken"
    : "Nächste Spieler";
  $("reveal-matching-all").classList.toggle("hidden", !isRevealing);
  $("reveal-matching-all").disabled = moderatorActionPending;
  $("next-matching-round").classList.toggle("hidden", game.status !== "round-finished");
  $("next-matching-round").disabled = moderatorActionPending;
  $("start-price-game").classList.toggle("hidden", !isFinished);
  $("start-price-game").disabled = moderatorActionPending ||
    state.players.filter((player) => player.team === "blue").length !== 2 ||
    state.players.filter((player) => player.team === "red").length !== 2;
  $("matching-round-result").classList.toggle("hidden", !result);

  if (result) {
    const conclusion = isFinished
      ? game.winningTeam
        ? `🏆 ${getTeamName(game.winningTeam)} gewinnt das Zuordnungsspiel!`
        : "Das Zuordnungsspiel endet unentschieden."
      : "Bereit für die nächste Runde.";
    $("matching-round-result").innerHTML = `
      <strong>Runde ${game.roundIndex + 1}: Blau ${result.blue} · ${result.red} Rot</strong>
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
      ? `<span class="value">${escapeHtml(list.valueLabel)}: ${escapeHtml(slot.value)}</span>`
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

async function broadcastState() {
  const publicState = structuredClone(state);
  if (state.game.id === matchingGame.id) {
    publicState.matchingSubmissionKey = matchingPublicKey;
  }
  if (state.game.id === guessThePriceGame.id) {
    publicState.priceSubmissionKey = matchingPublicKey;
  }
  if (state.game.id === top20Game.id) {
    publicState.top20SubmissionKey = matchingPublicKey;
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

async function handleMatchingSubmission(payload) {
  if (state.game.id !== matchingGame.id || state.game.status !== "assigning" ||
      !payload?.playerId || !payload.encrypted || !matchingKeyPair?.privateKey) return;

  try {
    const submission = await decryptMatchingSubmission(
      matchingKeyPair.privateKey,
      payload.encrypted
    );
    const player = state.players.find((item) => item.id === payload.playerId);
    const team = player?.team;
    const turn = getMatchingTurn(state.game.roundIndex, state.game.activeTurnIndex);
    const assignerIndex = turn?.assignerIndexes?.[team];
    const expectedPlayer = state.game.assignerOrder?.[assignerIndex];
    const values = submission?.values?.map((value) => String(value || "").trim());
    const registeredNames = new Set(state.players.map((item) => item.name));
    const selectedValues = Array.isArray(values) ? values.filter(Boolean) : [];
    const type = submission?.type || "submit";
    const valid = player && expectedPlayer?.id === player.id &&
      submission.playerId === player.id &&
      submission.roundIndex === state.game.roundIndex &&
      submission.turnIndex === state.game.activeTurnIndex &&
      ["draft", "submit"].includes(type) &&
      Array.isArray(values) && values.length === 4 &&
      values.every((value) => !value || registeredNames.has(value)) &&
      areMatchingValuesUnique(selectedValues);

    if (!valid || (type === "submit" &&
        (values.some((value) => !value) || !matchingGame.submitTeam(state, team)))) {
      if (type === "draft") return;
      await realtime.send("matching_submission_result", {
        playerId: payload.playerId,
        accepted: false
      });
      return;
    }

    values.forEach((value, imageIndex) => {
      matchingAssignments[state.game.roundIndex][imageIndex][assignerIndex] = value;
    });
    saveMatchingAssignments();

    if (type === "draft") {
      render();
      await syncMatchingTeam(team);
      return;
    }

    await realtime.send("matching_submission_result", {
      playerId: player.id,
      accepted: true
    });
    await persistRenderAndBroadcast();
    await syncMatchingTeam(team);
  } catch (error) {
    console.warn("Encrypted matching submission could not be processed:", error);
    await realtime.send("matching_submission_result", {
      playerId: payload.playerId,
      accepted: false
    });
  }
}

async function sendMatchingPrivateState(playerId) {
  if (state.game.id !== matchingGame.id) return false;
  const roomPlayer = state.players.find((item) => item.id === playerId);
  const publicKey = pricePlayerKeys.get(playerId);
  if (!roomPlayer || !publicKey) return false;

  try {
    const roundAssignments = matchingAssignments[state.game.roundIndex] || [];
    const assignerIndex = state.game.assignerOrder?.findIndex(
      (assigner) => assigner.id === roomPlayer.id
    );
    const encrypted = await encryptPrivatePayload(publicKey, {
      roundIndex: state.game.roundIndex,
      assignerIndex,
      assignments: getPrivateMatchingAssignments(roundAssignments, assignerIndex)
    });
    await realtime.send("matching_private_state", { playerId, encrypted });
    return true;
  } catch (error) {
    console.warn("Private matching state could not be encrypted:", error);
    return false;
  }
}

async function syncMatchingTeam(team) {
  const teamPlayers = state.players.filter((player) => player.team === team);
  await Promise.all(teamPlayers.map((player) => sendMatchingPrivateState(player.id)));
}

async function syncAllMatchingTeams() {
  await Promise.all([syncMatchingTeam("blue"), syncMatchingTeam("red")]);
}

async function sendTop20PrivateState(playerId) {
  if (state.game.id !== top20Game.id) return false;
  const roomPlayer = state.players.find((item) => item.id === playerId);
  const publicKey = pricePlayerKeys.get(playerId);
  if (!roomPlayer || !publicKey) return false;

  try {
    const encrypted = await encryptPrivatePayload(publicKey, {
      roundIndex: state.game.roundIndex,
      note: top20Notes[roomPlayer.team]
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

    top20Notes[player.team] = {
      text: String(submission.text || "").slice(0, 280),
      updatedBy: player.id
    };
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

async function handlePriceKeyRegistration(payload) {
  const roomPlayer = state.players.find((item) => item.id === payload?.playerId);
  if (!roomPlayer || !payload?.publicKey || payload.publicKey.kty !== "RSA") return;
  pricePlayerKeys.set(roomPlayer.id, payload.publicKey);
  if (state.game.id === matchingGame.id) await sendMatchingPrivateState(roomPlayer.id);
  if (state.game.id === top20Game.id) await sendTop20PrivateState(roomPlayer.id);
  if (state.game.id === guessThePriceGame.id) await sendPricePrivateState(roomPlayer.id);
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
      ["draft", "lock"].includes(submission.type);
    if (!valid) return;

    const amount = String(submission.amount || "").slice(0, 40);
    const comment = String(submission.comment || "").slice(0, 280);
    priceDrafts[player.team] = { amount, comment, updatedBy: player.id };
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

  if (event === "matching_assignment") {
    await handleMatchingSubmission(payload);
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

  if (event === "top20_private_submission") {
    await handleTop20Submission(payload);
    return;
  }

  if (event === "map_pin") {
    const player = state.players.find((item) => item.id === payload.playerId);
    if (!player || !germanyMapGame.placePin(state, player.team, payload.position)) return;
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
  await runModeratorAction(() => {
    if (!buzzerGame.awardOpponentPoint(state)) return false;
    if (state.game.status !== "finished") buzzerGame.reset(state);
    return true;
  });
});

$("start-spotify-game").addEventListener("click", async () => {
  const accepted = await runModeratorAction(() => {
    if (state.game.id !== "buzzer" || state.game.status !== "finished") return false;
    top20Game.start(state);
    top20Notes = emptyTop20Notes(0);
    saveTop20Notes();
    return true;
  });
  if (accepted) await syncAllTop20Teams();
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

$("start-map-game").addEventListener("click", async () => {
  await runModeratorAction(() => {
    if (state.game.id !== top20Game.id || state.game.status !== "finished") return false;
    return germanyMapGame.start(state);
  });
});

$("reveal-map-round").addEventListener("click", async () => {
  await runModeratorAction(() => germanyMapGame.revealRound(state));
});

$("next-map-round").addEventListener("click", async () => {
  await runModeratorAction(() => germanyMapGame.startNextRound(state));
});

$("start-matching-game").addEventListener("click", async () => {
  $("map-next-game-error").textContent = "";
  const assignerOrder = getMatchingAssignerOrder();

  if (assignerOrder.some((player) => !player)) {
    $("map-next-game-error").textContent =
      "Für das Zuordnungsspiel müssen zwei Spieler pro Team im Raum sein.";
    return;
  }

  const accepted = await runModeratorAction(() => {
    if (state.game.id !== germanyMapGame.id || state.game.status !== "finished") return false;
    if (!matchingGame.start(state, assignerOrder)) return false;
    matchingAssignments = emptyMatchingAssignments();
    saveMatchingAssignments();
    return true;
  });
  if (accepted) await syncAllMatchingTeams();
});

$("matching-board").addEventListener("change", async (event) => {
  const select = event.target.closest("[data-matching-input][data-image-index]");
  if (!select || select.disabled || state.game.id !== matchingGame.id ||
      state.game.status !== "assigning") return;

  const assignerIndex = Number(select.dataset.matchingInput);
  const imageIndex = Number(select.dataset.imageIndex);
  const team = MATCHING_ASSIGNERS[assignerIndex]?.team;
  const roundAssignments = matchingAssignments[state.game.roundIndex];
  const nextValues = roundAssignments.map((assignments, index) =>
    index === imageIndex ? select.value : assignments[assignerIndex]
  ).filter(Boolean);

  if (!areMatchingValuesUnique(nextValues)) {
    $("matching-error").textContent = "Jede Person darf pro Durchgang nur einmal gewählt werden.";
    renderMatchingGame();
    return;
  }

  $("matching-error").textContent = "";
  roundAssignments[imageIndex][assignerIndex] = select.value;
  saveMatchingAssignments();
  renderMatchingGame();
  await syncMatchingTeam(team);
});

$("save-matching-assignment").addEventListener("click", async () => {
  $("matching-error").textContent = "";
  const turnIndex = state.game.activeTurnIndex;
  const turn = getMatchingTurn(state.game.roundIndex, turnIndex);
  const submissions = ["blue", "red"].map((team) => {
    const assignerIndex = turn.assignerIndexes[team];
    const inputs = [...document.querySelectorAll(`[data-matching-input="${assignerIndex}"]`)];
    return { team, assignerIndex, values: inputs.map((input) => input.value.trim()) };
  });
  const partialSubmission = submissions.some(({ values }) =>
    values.some(Boolean) && (values.length !== 4 || values.some((value) => !value))
  );
  const completeSubmissions = submissions.filter(({ values }) =>
    values.length === 4 && values.every(Boolean)
  );
  const registeredNames = new Set(state.players.map((player) => player.name));
  const hasUnknownName = completeSubmissions.some(({ values }) =>
    values.some((value) => !registeredNames.has(value))
  );
  const hasDuplicateName = completeSubmissions.some(({ values }) =>
    !areMatchingValuesUnique(values)
  );

  if (partialSubmission || !completeSubmissions.length || hasUnknownName || hasDuplicateName) {
    $("matching-error").textContent =
      hasUnknownName
        ? "Bitte ausschließlich registrierte Spieler auswählen."
        : hasDuplicateName
          ? "Jede Person darf pro Durchgang nur einmal gewählt werden."
        : "Bitte pro Team entweder alle vier Namen oder noch keinen Namen auswählen.";
    return;
  }

  const accepted = await runModeratorAction(() => {
    if (state.game.id !== matchingGame.id || state.game.status !== "assigning" ||
        state.game.activeTurnIndex !== turnIndex) return false;

    const roundAssignments = matchingAssignments[state.game.roundIndex];
    completeSubmissions.forEach(({ team, assignerIndex, values }) => {
      values.forEach((value, imageIndex) => {
        roundAssignments[imageIndex][assignerIndex] = value;
      });
      if (!state.game.submittedTeams[team]) matchingGame.submitTeam(state, team);
    });
    saveMatchingAssignments();
    return true;
  });
  if (accepted) {
    await Promise.all(completeSubmissions.map(({ team }) => syncMatchingTeam(team)));
  }
});

$("complete-matching-turn").addEventListener("click", async () => {
  $("matching-error").textContent = "";
  const accepted = await runModeratorAction(() => matchingGame.completeTurn(state));
  if (accepted) await syncAllMatchingTeams();
});

$("reveal-matching-all").addEventListener("click", async () => {
  $("matching-error").textContent = "";
  const roundAssignments = matchingAssignments[state.game.roundIndex];
  const assignments = {
    blue: roundAssignments.map((imageAssignments) => [imageAssignments[0], imageAssignments[2]]),
    red: roundAssignments.map((imageAssignments) => [imageAssignments[1], imageAssignments[3]])
  };
  await runModeratorAction(() => matchingGame.revealAll(state, assignments));
});

$("next-matching-round").addEventListener("click", async () => {
  $("matching-error").textContent = "";
  const accepted = await runModeratorAction(() => matchingGame.startNextRound(state));
  if (accepted) await syncAllMatchingTeams();
});

$("start-price-game").addEventListener("click", async () => {
  $("matching-next-game-error").textContent = "";

  if (state.players.length !== 4) {
    $("matching-next-game-error").textContent =
      "Für das Preisratespiel müssen alle vier Spieler im Raum sein.";
    return;
  }

  const accepted = await runModeratorAction(() => {
    if (state.game.id !== matchingGame.id || state.game.status !== "finished") return false;
    guessThePriceGame.start(state);
    priceDrafts = emptyPriceDrafts(0);
    savePriceDrafts();
    return true;
  });
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
