import {
  getRoomByCode,
  getPlayers
} from "./database.js";

import { createRoomStateFromRecords, getShowWinner, normalizeRoomCode } from "./room.js";
import { createRoomChannel } from "./realtime.js";
import { playBuzzerSound } from "./audio.js";
import { GERMANY_MAP_QUESTIONS } from "./games/germany-map.js";
import { RANKING_LISTS, getRankingEntry, getRankingList } from "./games/ranking-lists.js";
import { captureRankingMove, playRankingMove } from "./ranking-motion.js";
import { createEuropeMap } from "./europe-map-view.js";
import {
  MATCHING_ASSIGNERS,
  MATCHING_GAME_ROUNDS,
  areMatchingValuesUnique,
  getMatchingTurn
} from "./games/matching-game.js";
import { PRICE_PRODUCTS, getPriceProduct } from "./games/guess-the-price-products.js";
import { formatEuroAmount, parseEuroAmount } from "./euro.js";
import { ESTIMATION_ROUND_COUNT, parseEstimate } from "./games/estimation-game.js";
import {
  WORD_MATCH_CATEGORIES,
  WORD_MATCH_PHASE_SECONDS,
  WORD_MATCH_SEED_SECONDS,
  WORD_MATCH_TERM_COUNT,
  getWordMatchGuessOrder,
  getWordMatchRoles
} from "./games/word-match-game.js";
import {
  createEncryptionKeyPair,
  decryptPrivatePayload,
  encryptPrivatePayload,
  exportEncryptionPublicKey
} from "./private-channel-crypto.js";
import { showGameTransition } from "./game-effects.js";
import { TEAM_CHAT_TEXT_LIMIT, supportsTeamChat } from "./team-chat.js";

const TOP_20_GAME_ID = "spotify-top-artists";
const RANKING_GAME_ID = "ranking-game";
const TOP_20_SLOT_COUNT = 20;
const GERMANY_MAP_GAME_ID = "germany-map";
const MATCHING_GAME_ID = "matching-game";
const PRICE_GAME_ID = "guess-the-price";
const ESTIMATION_GAME_ID = "estimation-game";
const WORD_MATCH_GAME_ID = "word-match-game";

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
let priceKeyPair = null;
let pricePublicKey = null;
let priceDraft = { roundIndex: -1, amount: "", locked: false };
let priceAmountTimer = null;
let priceSubmissionPending = false;
let matchingDraft = {
  roundIndex: -1,
  values: Array(4).fill(""),
  locked: false,
  opponentAssignerIndex: null,
  opponentValues: null
};
let matchingDraftTimer = null;
let matchingSubmissionPending = false;
let teamChatState = { gameId: null, team: null, messages: [], typing: [] };
let teamChatDraft = "";
let teamChatTypingTimer = null;
let lastTypingSentAt = 0;
let estimationDraft = {
  roundIndex: -1,
  value: "",
  locked: false,
  partnerName: "",
  partnerValue: "",
  teamAverage: null,
  allGuesses: null,
  averages: null
};
let estimationDraftTimer = null;
let estimationSubmissionPending = false;
let wordMatchDraft = {
  roundIndex: -1,
  terms: Array(WORD_MATCH_TERM_COUNT).fill(""),
  locked: false,
  lists: null
};
let wordMatchDraftTimer = null;
let wordMatchSubmissionPending = false;
let previousGameId = null;
let previousGameStatus = null;

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
  teamChatState = {
    gameId: supportsTeamChat(roomState.game?.id) ? roomState.game.id : null,
    team: null,
    messages: [],
    typing: []
  };
  previousGameId = roomState.game.id;
  previousGameStatus = roomState.game.status;

  const restoredPlayer = roomState.players.find((item) => item.id === playerId);

  if (restoredPlayer) {
    player = restoredPlayer;
    showPlayerGame();
  }

  playerMap = createEuropeMap($("player-germany-map"), {
    enableZoom: true,
    compactMarkers: true,
    async onPlacePin(position) {
      if (!player || roomState?.game?.id !== GERMANY_MAP_GAME_ID ||
          roomState.game.status !== "placing" || roomState.game.lockedTeams?.[player.team]) return;

      await realtime.send("map_pin", { playerId, position });
    }
  });

  priceKeyPair = await createEncryptionKeyPair();
  pricePublicKey = await exportEncryptionPublicKey(priceKeyPair.publicKey);

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

async function registerPriceKey() {
  if (!realtime || !player || !pricePublicKey) return;
  await realtime.send("price_key_registration", { playerId, publicKey: pricePublicKey });
}

async function sendMatchingSubmission(type = "draft") {
  if (!player || roomState?.game?.id !== MATCHING_GAME_ID ||
      roomState.game.status !== "assigning" || roomState.game.activeTurnIndex !== 0 ||
      matchingDraft.locked || !roomState.matchingSubmissionKey) return false;
  const assignerIndex = roomState.game.assignerOrder?.findIndex((item) => item.id === playerId) ?? -1;
  if (!getMatchingTurn(roomState.game.roundIndex, 0).assignerIndexes.includes(assignerIndex)) return false;

  try {
    const encrypted = await encryptPrivatePayload(roomState.matchingSubmissionKey, {
      type,
      playerId,
      roundIndex: roomState.game.roundIndex,
      values: matchingDraft.values
    });
    await realtime.send("matching_private_submission", { playerId, encrypted });
    return true;
  } catch (error) {
    console.error("Private matching assignment could not be encrypted:", error);
    $("player-matching-error").textContent = "Die Zuordnungen konnten nicht synchronisiert werden.";
    return false;
  }
}

$("player-matching-board").addEventListener("change", (event) => {
  const select = event.target.closest("[data-player-matching-index]");
  if (!select || matchingDraft.locked) return;
  matchingDraft.values[Number(select.dataset.playerMatchingIndex)] = select.value;
  $("player-matching-error").textContent = "";
  renderMatchingGame();
  clearTimeout(matchingDraftTimer);
  matchingDraftTimer = setTimeout(() => void sendMatchingSubmission("draft"), 200);
});

$("lock-player-matching").addEventListener("click", async () => {
  if (matchingSubmissionPending || matchingDraft.locked) return;
  if (matchingDraft.values.length !== 4 || matchingDraft.values.some((value) => !value)) {
    $("player-matching-error").textContent = "Bitte ordne allen vier Bildern eine Person zu.";
    return;
  }
  if (!areMatchingValuesUnique(matchingDraft.values)) {
    $("player-matching-error").textContent = "Jeder Spielername darf nur einmal verwendet werden.";
    return;
  }
  clearTimeout(matchingDraftTimer);
  matchingSubmissionPending = true;
  $("player-matching-error").textContent = "Zuordnungen werden eingeloggt…";
  renderMatchingGame();
  const sent = await sendMatchingSubmission("lock");
  if (!sent) {
    matchingSubmissionPending = false;
    renderMatchingGame();
  }
});

function teamChatIsWritable() {
  if (!player || !roomState || teamChatState.gameId !== roomState.game.id) return false;
  if (roomState.game.id === TOP_20_GAME_ID) return roomState.game.status === "playing";
  if (roomState.game.id === RANKING_GAME_ID) {
    return ["playing", "ready-to-reveal"].includes(roomState.game.status);
  }
  if (roomState.game.id === GERMANY_MAP_GAME_ID) {
    return roomState.game.status === "placing" && !roomState.game.lockedTeams?.[player.team];
  }
  if (roomState.game.id === PRICE_GAME_ID) {
    return roomState.game.status === "guessing" && !roomState.game.lockedTeams?.[player.team];
  }
  return false;
}

async function sendTeamChatSubmission(type, extra = {}) {
  if (!teamChatIsWritable() || !roomState.teamChatSubmissionKey) return false;
  try {
    const encrypted = await encryptPrivatePayload(roomState.teamChatSubmissionKey, {
      type,
      playerId,
      gameId: roomState.game.id,
      ...extra
    });
    await realtime.send("team_chat_private_submission", { playerId, encrypted });
    return true;
  } catch (error) {
    console.error("Private team chat could not be encrypted:", error);
    return false;
  }
}

function stopTeamChatTyping() {
  clearTimeout(teamChatTypingTimer);
  teamChatTypingTimer = null;
  void sendTeamChatSubmission("typing", { isTyping: false });
}

document.addEventListener("input", (event) => {
  if (!event.target.matches("[data-team-chat-input]")) return;
  teamChatDraft = event.target.value.slice(0, TEAM_CHAT_TEXT_LIMIT);
  const sendButton = event.target.closest("form")?.querySelector("button[type='submit']");
  if (sendButton) sendButton.disabled = !teamChatIsWritable() || !teamChatDraft.trim();
  const now = Date.now();
  if (now - lastTypingSentAt > 600) {
    lastTypingSentAt = now;
    void sendTeamChatSubmission("typing", { isTyping: true });
  }
  clearTimeout(teamChatTypingTimer);
  teamChatTypingTimer = setTimeout(stopTeamChatTyping, 1200);
});

document.addEventListener("keydown", (event) => {
  if (!event.target.matches("[data-team-chat-input]") || event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  event.target.closest("form")?.requestSubmit();
});

document.addEventListener("focusout", (event) => {
  if (event.target.matches("[data-team-chat-input]")) stopTeamChatTyping();
});

document.addEventListener("submit", async (event) => {
  if (!event.target.matches("[data-team-chat-form]")) return;
  event.preventDefault();
  const text = teamChatDraft.trim();
  if (!text || !teamChatIsWritable()) return;
  stopTeamChatTyping();
  if (await sendTeamChatSubmission("message", { text })) {
    teamChatDraft = "";
    const input = event.target.querySelector("[data-team-chat-input]");
    if (input) input.value = "";
    const button = event.target.querySelector("button[type='submit']");
    if (button) button.disabled = true;
  }
});

$("lock-map-pin").addEventListener("click", async () => {
  if (!player || roomState?.game?.id !== GERMANY_MAP_GAME_ID ||
      roomState.game.status !== "placing" || !roomState.game.pins?.[player.team] ||
      roomState.game.lockedTeams?.[player.team]) return;

  await realtime.send("map_lock", { playerId });
});

async function sendPriceSubmission(type = "amount") {
  if (!player || roomState?.game?.id !== PRICE_GAME_ID ||
      roomState.game.status !== "guessing" || roomState.game.lockedTeams?.[player.team] ||
      !roomState.priceSubmissionKey) return false;

  try {
    const encrypted = await encryptPrivatePayload(roomState.priceSubmissionKey, {
      type,
      playerId,
      roundIndex: roomState.game.roundIndex,
      amount: priceDraft.amount
    });
    await realtime.send("price_private_submission", { playerId, encrypted });
    return true;
  } catch (error) {
    console.error("Private price draft could not be encrypted:", error);
    $("player-price-error").textContent = "Der Teamentwurf konnte nicht synchronisiert werden.";
    return false;
  }
}

$("player-price-amount").addEventListener("input", (event) => {
  priceDraft.amount = event.currentTarget.value.slice(0, 40);
  $("player-price-error").textContent = "";
  clearTimeout(priceAmountTimer);
  priceAmountTimer = setTimeout(() => void sendPriceSubmission("amount"), 300);
});

$("player-price-amount").addEventListener("blur", () => {
  clearTimeout(priceAmountTimer);
  void sendPriceSubmission("amount");
});

$("lock-price-guess").addEventListener("click", async () => {
  if (priceSubmissionPending || parseEuroAmount(priceDraft.amount) === null) {
    $("player-price-error").textContent = "Bitte gebt zuerst einen gültigen Euro-Betrag ein.";
    return;
  }

  clearTimeout(priceAmountTimer);
  priceSubmissionPending = true;
  $("player-price-error").textContent = "Preis wird eingeloggt…";
  renderPriceGame();
  const sent = await sendPriceSubmission("lock");
  if (!sent) {
    priceSubmissionPending = false;
    renderPriceGame();
  }
});

async function sendEstimationSubmission(type = "draft") {
  if (!player || roomState?.game?.id !== ESTIMATION_GAME_ID ||
      roomState.game.status !== "guessing" || estimationDraft.locked ||
      !roomState.estimationSubmissionKey) return false;
  try {
    const encrypted = await encryptPrivatePayload(roomState.estimationSubmissionKey, {
      type,
      playerId,
      roundIndex: roomState.game.roundIndex,
      value: estimationDraft.value
    });
    await realtime.send("estimation_private_submission", { playerId, encrypted });
    return true;
  } catch (error) {
    console.error("Private estimation could not be encrypted:", error);
    $("player-estimation-error").textContent = "Die Schätzung konnte nicht synchronisiert werden.";
    return false;
  }
}

$("player-estimation-value").addEventListener("input", (event) => {
  estimationDraft.value = event.currentTarget.value.slice(0, 40);
  $("player-estimation-error").textContent = "";
  clearTimeout(estimationDraftTimer);
  estimationDraftTimer = setTimeout(() => void sendEstimationSubmission("draft"), 300);
});

$("player-estimation-value").addEventListener("blur", () => {
  clearTimeout(estimationDraftTimer);
  void sendEstimationSubmission("draft");
});

$("lock-estimation-value").addEventListener("click", async () => {
  if (estimationSubmissionPending || parseEstimate(estimationDraft.value) === null) {
    $("player-estimation-error").textContent =
      "Bitte gib eine gültige Zahl ein, zum Beispiel 12,5 oder -4.";
    return;
  }
  clearTimeout(estimationDraftTimer);
  estimationSubmissionPending = true;
  $("player-estimation-error").textContent = "Schätzung wird eingeloggt…";
  renderEstimationGame();
  const sent = await sendEstimationSubmission("lock");
  if (!sent) {
    estimationSubmissionPending = false;
    renderEstimationGame();
  }
});

async function sendWordMatchSubmission(type = "draft") {
  if (!player || roomState?.game?.id !== WORD_MATCH_GAME_ID ||
      roomState.game.status !== "seed-collecting" || wordMatchDraft.locked ||
      !roomState.wordMatchSubmissionKey) return false;
  try {
    const encrypted = await encryptPrivatePayload(roomState.wordMatchSubmissionKey, {
      type,
      playerId,
      roundIndex: roomState.game.roundIndex,
      terms: wordMatchDraft.terms
    });
    await realtime.send("word_match_private_submission", { playerId, encrypted });
    return true;
  } catch (error) {
    console.error("Private word list could not be encrypted:", error);
    $("player-word-match-error").textContent = "Die Liste konnte nicht synchronisiert werden.";
    return false;
  }
}

$("player-word-fields").addEventListener("input", (event) => {
  const input = event.target.closest("[data-word-field-index]");
  if (!input) return;
  wordMatchDraft.terms[Number(input.dataset.wordFieldIndex)] = input.value.slice(0, 60);
  $("player-word-match-error").textContent = "";
  clearTimeout(wordMatchDraftTimer);
  wordMatchDraftTimer = setTimeout(() => void sendWordMatchSubmission("draft"), 250);
});

$("player-word-fields").addEventListener("focusout", (event) => {
  if (!event.target.matches("[data-word-field-index]")) return;
  clearTimeout(wordMatchDraftTimer);
  void sendWordMatchSubmission("draft");
});

$("lock-word-list").addEventListener("click", async () => {
  if (wordMatchSubmissionPending || wordMatchDraft.locked) return;
  clearTimeout(wordMatchDraftTimer);
  wordMatchSubmissionPending = true;
  $("player-word-match-error").textContent = "Liste wird eingeloggt…";
  renderWordMatchGame();
  const sent = await sendWordMatchSubmission("lock");
  if (!sent) {
    wordMatchSubmissionPending = false;
    renderWordMatchGame();
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
    await registerPriceKey();
    render();
    return;
  }

  if (event === "price_private_state" && payload.playerId === playerId &&
      payload.encrypted && priceKeyPair?.privateKey) {
    try {
      const privateState = await decryptPrivatePayload(priceKeyPair.privateKey, payload.encrypted);
      if (privateState.roundIndex !== roomState?.game?.roundIndex) return;
      const amountIsFocused = document.activeElement === $("player-price-amount");
      priceDraft = {
        roundIndex: privateState.roundIndex,
        amount: amountIsFocused
          ? priceDraft.amount
          : String(privateState.draft?.amount || ""),
        locked: Boolean(privateState.locked)
      };
      priceSubmissionPending = false;
      render();
    } catch (error) {
      console.warn("Private team draft could not be decrypted:", error);
    }
    return;
  }

  if (event === "team_chat_private_update" && payload.playerId === playerId &&
      payload.encrypted && priceKeyPair?.privateKey) {
    try {
      const update = await decryptPrivatePayload(priceKeyPair.privateKey, payload.encrypted);
      if (update.gameId !== roomState?.game?.id || update.team !== player?.team ||
          teamChatState.gameId !== update.gameId) return;
      if (update.type === "message" && update.message?.id &&
          !teamChatState.messages.some((message) => message.id === update.message.id)) {
        teamChatState.messages.push(update.message);
        teamChatState.typing = teamChatState.typing.filter(
          (entry) => entry.playerId !== update.message.senderId
        );
      } else if (update.type === "typing" && update.player?.playerId) {
        teamChatState.typing = teamChatState.typing.filter(
          (entry) => entry.playerId !== update.player.playerId
        );
        if (update.isTyping) teamChatState.typing.push(update.player);
      }
      render();
    } catch (error) {
      console.warn("Private team chat update could not be decrypted:", error);
    }
    return;
  }

  if (event === "matching_private_state" && payload.playerId === playerId &&
      payload.encrypted && priceKeyPair?.privateKey) {
    try {
      const privateState = await decryptPrivatePayload(priceKeyPair.privateKey, payload.encrypted);
      if (privateState.roundIndex !== roomState?.game?.roundIndex) return;
      matchingDraft = {
        roundIndex: privateState.roundIndex,
        values: Array.from({ length: 4 }, (_, index) =>
          String(privateState.values?.[index] || "")
        ),
        locked: Boolean(privateState.locked),
        opponentAssignerIndex: Number.isInteger(privateState.opponentAssignerIndex)
          ? privateState.opponentAssignerIndex
          : null,
        opponentValues: Array.isArray(privateState.opponentValues)
          ? Array.from({ length: 4 }, (_, index) =>
            String(privateState.opponentValues[index] || "")
          )
          : null
      };
      matchingSubmissionPending = false;
      render();
    } catch (error) {
      console.warn("Private matching state could not be decrypted:", error);
    }
    return;
  }

  if (event === "estimation_private_state" && payload.playerId === playerId &&
      payload.encrypted && priceKeyPair?.privateKey) {
    try {
      const privateState = await decryptPrivatePayload(priceKeyPair.privateKey, payload.encrypted);
      if (privateState.roundIndex !== roomState?.game?.roundIndex) return;
      const valueIsFocused = document.activeElement === $("player-estimation-value");
      estimationDraft = {
        roundIndex: privateState.roundIndex,
        value: valueIsFocused ? estimationDraft.value : String(privateState.value || ""),
        locked: Boolean(privateState.locked),
        partnerName: String(privateState.partnerName || ""),
        partnerValue: String(privateState.partnerValue || ""),
        teamAverage: Number.isFinite(privateState.teamAverage)
          ? Number(privateState.teamAverage)
          : null,
        allGuesses: privateState.allGuesses && typeof privateState.allGuesses === "object"
          ? privateState.allGuesses
          : null,
        averages: privateState.averages &&
          Number.isFinite(privateState.averages.blue) && Number.isFinite(privateState.averages.red)
          ? { blue: Number(privateState.averages.blue), red: Number(privateState.averages.red) }
          : null
      };
      estimationSubmissionPending = false;
      render();
    } catch (error) {
      console.warn("Private estimation state could not be decrypted:", error);
    }
    return;
  }

  if (event === "word_match_private_state" && payload.playerId === playerId &&
      payload.encrypted && priceKeyPair?.privateKey) {
    try {
      const privateState = await decryptPrivatePayload(priceKeyPair.privateKey, payload.encrypted);
      if (privateState.roundIndex !== roomState?.game?.roundIndex) return;
      const fieldIsFocused = document.activeElement?.matches?.("[data-word-field-index]");
      wordMatchDraft = {
        roundIndex: privateState.roundIndex,
        terms: fieldIsFocused
          ? wordMatchDraft.terms
          : Array.from({ length: WORD_MATCH_TERM_COUNT }, (_, index) =>
            String(privateState.terms?.[index] || "")
          ),
        locked: Boolean(privateState.locked),
        lists: privateState.lists && ["blue", "red"].every((team) =>
          Array.isArray(privateState.lists[team])
        ) ? {
            blue: privateState.lists.blue.slice(0, WORD_MATCH_TERM_COUNT).map(String),
            red: privateState.lists.red.slice(0, WORD_MATCH_TERM_COUNT).map(String)
          } : null
      };
      wordMatchSubmissionPending = false;
      render();
    } catch (error) {
      console.warn("Private word list could not be decrypted:", error);
    }
    return;
  }

  if (event === "price_lock_result" && payload.playerId === playerId) {
    priceSubmissionPending = false;
    $("player-price-error").textContent = payload.accepted
      ? "Euer Team-Preis ist eingeloggt."
      : payload.reason || "Der Preis konnte nicht eingeloggt werden.";
    render();
    return;
  }

  if (event === "estimation_lock_result" && payload.playerId === playerId) {
    estimationSubmissionPending = false;
    $("player-estimation-error").textContent = payload.accepted
      ? "Deine Schätzung ist eingeloggt."
      : payload.reason || "Die Schätzung konnte nicht eingeloggt werden.";
    render();
    return;
  }

  if (event === "matching_lock_result" && payload.playerId === playerId) {
    matchingSubmissionPending = false;
    $("player-matching-error").textContent = payload.accepted
      ? "Deine Zuordnungen sind eingeloggt."
      : payload.reason || "Die Zuordnungen konnten nicht eingeloggt werden.";
    render();
    return;
  }

  if (event === "word_match_lock_result" && payload.playerId === playerId) {
    wordMatchSubmissionPending = false;
    $("player-word-match-error").textContent = payload.accepted
      ? "Deine Liste ist eingeloggt."
      : payload.reason || "Die Liste konnte nicht eingeloggt werden.";
    render();
    return;
  }

  if (event === "room_state") {
    roomState = payload;

    if (player && roomState.players?.some((item) => item.id === playerId)) {
      showPlayerGame();
    }

    sendingBuzz = false;
    if (player) await registerPriceKey();
    if (teamChatState.gameId !== roomState.game?.id) {
      teamChatState = {
        gameId: supportsTeamChat(roomState.game?.id) ? roomState.game.id : null,
        team: player?.team || null,
        messages: [],
        typing: []
      };
      teamChatDraft = "";
      clearTimeout(teamChatTypingTimer);
    }
    if (roomState.game?.id === PRICE_GAME_ID) {
      if (priceDraft.roundIndex !== roomState.game.roundIndex) {
        priceDraft = {
          roundIndex: roomState.game.roundIndex,
          amount: "",
          locked: Boolean(roomState.game.lockedTeams?.[player?.team])
        };
      }
    }
    if (roomState.game?.id === MATCHING_GAME_ID &&
        matchingDraft.roundIndex !== roomState.game.roundIndex) {
      matchingDraft = {
        roundIndex: roomState.game.roundIndex,
        values: Array(4).fill(""),
        locked: false,
        opponentAssignerIndex: null,
        opponentValues: null
      };
      matchingSubmissionPending = false;
      $("player-matching-error").textContent = "";
    }
    if (roomState.game?.id === ESTIMATION_GAME_ID &&
        estimationDraft.roundIndex !== roomState.game.roundIndex) {
      estimationDraft = {
        roundIndex: roomState.game.roundIndex,
        value: "",
        locked: false,
        partnerName: "",
        partnerValue: "",
        teamAverage: null,
        allGuesses: null,
        averages: null
      };
      estimationSubmissionPending = false;
      $("player-estimation-error").textContent = "";
    }
    if (roomState.game?.id === WORD_MATCH_GAME_ID &&
        wordMatchDraft.roundIndex !== roomState.game.roundIndex) {
      wordMatchDraft = {
        roundIndex: roomState.game.roundIndex,
        terms: Array(WORD_MATCH_TERM_COUNT).fill(""),
        locked: false,
        lists: null
      };
      wordMatchSubmissionPending = false;
    }
    render();
  }
}

function render() {
  if (!joined || !roomState) return;

  const currentGameId = roomState.game?.id;
  if (previousGameId && previousGameId !== currentGameId) {
    showGameTransition(currentGameId);
  } else if (["buzzer", ESTIMATION_GAME_ID].includes(currentGameId) &&
      previousGameStatus === "not-started" &&
      roomState.game.status !== "not-started") {
    showGameTransition(currentGameId);
  }
  previousGameId = currentGameId;
  previousGameStatus = roomState.game.status;

  const showWinner = getShowWinner(roomState);
  $("player-show-winner-banner").classList.toggle("hidden", !showWinner);
  $("player-show-winner-banner").textContent = showWinner
    ? `🏆 ${getTeamName(showWinner)} gewinnt die Gameshow mit ${roomState.scores[showWinner]} Spielpunkten!`
    : "";

  const spotifyIsActive = roomState.game?.id === TOP_20_GAME_ID;
  const rankingIsActive = roomState.game?.id === RANKING_GAME_ID;
  const mapIsActive = roomState.game?.id === GERMANY_MAP_GAME_ID;
  const matchingIsActive = roomState.game?.id === MATCHING_GAME_ID;
  const priceIsActive = roomState.game?.id === PRICE_GAME_ID;
  const estimationIsActive = roomState.game?.id === ESTIMATION_GAME_ID;
  const wordMatchIsActive = roomState.game?.id === WORD_MATCH_GAME_ID;
  document.querySelector(".player-shell").classList.toggle(
    "wide-game",
    spotifyIsActive || rankingIsActive || mapIsActive || matchingIsActive || priceIsActive || estimationIsActive || wordMatchIsActive
  );
  $("player-buzzer-game").classList.toggle(
    "hidden",
    spotifyIsActive || rankingIsActive || mapIsActive || matchingIsActive || priceIsActive || estimationIsActive || wordMatchIsActive
  );
  $("player-spotify-game").classList.toggle("hidden", !spotifyIsActive);
  $("player-ranking-game").classList.toggle("hidden", !rankingIsActive);
  $("player-map-game").classList.toggle("hidden", !mapIsActive);
  $("player-matching-game").classList.toggle("hidden", !matchingIsActive);
  $("player-price-game").classList.toggle("hidden", !priceIsActive);
  $("player-estimation-game").classList.toggle("hidden", !estimationIsActive);
  $("player-word-match-game").classList.toggle("hidden", !wordMatchIsActive);

  if (wordMatchIsActive) {
    renderWordMatchGame();
    return;
  }

  if (estimationIsActive) {
    renderEstimationGame();
    return;
  }

  if (priceIsActive) {
    renderPriceGame();
    return;
  }

  if (matchingIsActive) {
    renderMatchingGame();
    return;
  }

  if (mapIsActive) {
    renderMapGame();
    return;
  }

  if (rankingIsActive) {
    renderRankingGame();
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

  buzzer.classList.toggle("hidden", status === "not-started");
  buzzer.disabled = status !== "open";

  if (status === "not-started") {
    $("player-message").textContent = "Warte darauf, dass der Moderator Spiel 1 startet…";
    return;
  }

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

function formatChatTime(sentAt) {
  return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" })
    .format(new Date(sentAt));
}

function renderPlayerTeamChat(containerId, writable) {
  const container = $(containerId);
  if (!container.querySelector(".team-chat")) {
    container.innerHTML = `<article class="team-chat player ${player.team}">
      <header><strong>Team-Chat</strong><span>nur euer Team</span></header>
      <div class="team-chat-messages" aria-live="polite"></div>
      <div class="team-chat-typing hidden"><span></span><i></i><i></i><i></i></div>
      <form class="team-chat-form" data-team-chat-form>
        <textarea data-team-chat-input rows="2" maxlength="${TEAM_CHAT_TEXT_LIMIT}"
          placeholder="Nachricht an deinen Teampartner…" aria-label="Team-Nachricht"></textarea>
        <button class="button primary" type="submit" aria-label="Nachricht senden">Senden</button>
      </form>
    </article>`;
  }

  const list = container.querySelector(".team-chat-messages");
  const previousCount = Number(list.dataset.messageCount || -1);
  list.innerHTML = teamChatState.messages.length
    ? teamChatState.messages.map((message) => `
      <div class="team-chat-message ${message.senderId === playerId ? "own" : "other"}">
        <div class="team-chat-meta"><strong>${escapeHtml(message.senderName)}</strong><time>${formatChatTime(message.sentAt)}</time></div>
        <p>${escapeHtml(message.text)}</p>
      </div>`).join("")
    : '<p class="team-chat-empty">Noch keine Nachrichten</p>';
  list.dataset.messageCount = String(teamChatState.messages.length);
  if (previousCount !== teamChatState.messages.length) list.scrollTop = list.scrollHeight;

  const typingNames = teamChatState.typing
    .filter((entry) => entry.playerId !== playerId)
    .map((entry) => entry.name);
  const typing = container.querySelector(".team-chat-typing");
  typing.classList.toggle("hidden", !typingNames.length);
  typing.querySelector("span").textContent = typingNames.length
    ? `${typingNames.join(" & ")} tippt`
    : "";

  const input = container.querySelector("[data-team-chat-input]");
  const button = container.querySelector("button[type='submit']");
  if (document.activeElement !== input && input.value !== teamChatDraft) input.value = teamChatDraft;
  input.disabled = !writable;
  button.disabled = !writable || !teamChatDraft.trim();
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
  $("player-spotify-board").innerHTML = renderSpotifySlots(game.revealed);
  renderPlayerTeamChat("player-top20-chat", teamChatIsWritable());
  $("player-spotify-result").classList.toggle("hidden", !isFinished && !isRoundFinished);
  $("player-spotify-result").textContent = isFinished
    ? `🏆 ${getTeamName(game.winningTeam)} gewinnt Top 20!`
    : isRoundFinished
      ? `Liste ${roundNumber} ist beendet. Wartet auf die nächste Liste.`
      : "";
}

function renderPlayerRankingBoard(game, list) {
  const rows = [];
  const proposalIndex = game.proposal ? Number(game.proposal.position) - 1 : -1;
  for (let index = 0; index <= game.placedIds.length; index += 1) {
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
  const game = roomState.game;
  const isNotStarted = game.status === "not-started";
  $("player-ranking-waiting").classList.toggle("hidden", !isNotStarted);
  $("player-ranking-content").classList.toggle("hidden", isNotStarted);
  if (isNotStarted) return;
  const rankingMove = captureRankingMove(game, $("player-ranking-pool"), $("player-ranking-board"));
  const list = getRankingList(game.roundIndex);
  const isFinished = game.status === "finished";
  const isRoundFinished = game.status === "round-finished";
  const displayTeam = game.roundWinner || game.winningTeam || game.currentTeam;
  $("player-ranking-round").textContent = `Liste ${game.roundIndex + 1} von ${RANKING_LISTS.length}`;
  $("player-ranking-round-wins").textContent =
    `Listensiege · Blau ${game.roundWins.blue} : ${game.roundWins.red} Rot`;
  $("player-ranking-title").textContent = list.title;
  $("player-ranking-turn").textContent = isFinished
    ? game.winningTeam ? `${getTeamName(game.winningTeam)} gewinnt Einordnen!` : "Einordnen endet unentschieden"
    : isRoundFinished
      ? game.roundWinner ? `${getTeamName(game.roundWinner)} gewinnt die Liste!` : "Liste endet unentschieden"
      : `${getTeamName(game.currentTeam)} ist dran`;
  $("player-ranking-turn").className = `turn-card ${displayTeam || "blue"}`;
  $("player-ranking-strikes").innerHTML =
    `<span>Blau: <strong>${renderStrikes(game.strikes.blue)}</strong></span>` +
    `<span>Rot: <strong>${renderStrikes(game.strikes.red)}</strong></span>`;
  $("player-ranking-board").innerHTML = renderPlayerRankingBoard(game, list);
  $("player-ranking-pool").innerHTML = game.remainingIds.filter((id) => id !== game.proposal?.itemId).map((id) => {
    const entry = getRankingEntry(list, id);
    return `<span class="ranking-candidate" data-ranking-item="${escapeHtml(id)}">${escapeHtml(entry?.label || "")}</span>`;
  }).join("");
  playRankingMove(rankingMove, $("player-ranking-pool"), $("player-ranking-board"));
  renderPlayerTeamChat("player-ranking-chat", teamChatIsWritable());

  const result = game.lastResult;
  if (result) {
    const entry = getRankingEntry(list, result.itemId);
    const resultText = result.correct
      ? `✓ ${entry.label} wurde richtig eingeordnet.`
      : `✕ ${entry.label} war falsch eingeordnet und bleibt verfügbar.`;
    const conclusion = isFinished
      ? game.winningTeam ? ` 🏆 ${getTeamName(game.winningTeam)} gewinnt Einordnen!` : " Einordnen endet unentschieden."
      : isRoundFinished && game.roundWinner ? ` ${getTeamName(game.roundWinner)} gewinnt diese Liste.` : "";
    $("player-ranking-result").textContent = `${resultText}${result.correct ? ` Wert: ${entry.value}.` : ""}${conclusion}`;
  } else {
    $("player-ranking-result").textContent = game.status === "ready-to-reveal"
      ? "Die Einordnung ist vorgemerkt. Der Moderator deckt gleich auf."
      : "";
  }
}

function renderPersonalNoteFields(containerId, notes = {}, ownEditable = true) {
  const container = $(containerId);
  const teamPlayers = roomState.players
    .filter((item) => item.team === player.team)
    .sort((a, b) => Number(b.id === playerId) - Number(a.id === playerId));

  for (const item of teamPlayers) {
    let wrapper = container.querySelector(`[data-note-wrapper-id="${CSS.escape(item.id)}"]`);
    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.className = "player-private-note";
      wrapper.dataset.noteWrapperId = item.id;
      const label = document.createElement("label");
      const textarea = document.createElement("textarea");
      textarea.id = `${containerId}-${item.id}`;
      textarea.dataset.notePlayerId = item.id;
      textarea.maxLength = 280;
      textarea.rows = 3;
      label.htmlFor = textarea.id;
      wrapper.append(label, textarea);
    }

    const label = wrapper.querySelector("label");
    const textarea = wrapper.querySelector("textarea");
    const isOwn = item.id === playerId;
    label.textContent = `${item.name}${isOwn ? " · Du" : " · Teampartner"}`;
    textarea.placeholder = isOwn ? "Deine Überlegungen…" : "Noch keine Eingabe";
    textarea.readOnly = !isOwn;
    textarea.disabled = isOwn && !ownEditable;
    if (document.activeElement !== textarea && textarea.value !== String(notes[item.id] || "")) {
      textarea.value = String(notes[item.id] || "");
    }
    container.append(wrapper);
  }

  for (const wrapper of [...container.querySelectorAll("[data-note-wrapper-id]")]) {
    if (!teamPlayers.some((item) => item.id === wrapper.dataset.noteWrapperId)) wrapper.remove();
  }
}

function renderSpotifySlots(revealed = []) {
  return Array.from({ length: TOP_20_SLOT_COUNT }, (_, index) => {
    const slot = revealed[index];
    const teamClass = slot?.team || "empty";
    const answer = slot ? escapeHtml(slot.answer) : "Noch offen";
    const value = slot
      ? `<span class="value">${escapeHtml(slot.value)}</span>`
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
  const isPending = game.status === "round-pending";
  const isRevealed = game.status === "revealed" || game.status === "finished";
  const isFinished = game.status === "finished";
  const ownPin = game.pins?.[player.team];
  const ownTeamLocked = Boolean(game.lockedTeams?.[player.team]);
  const bothTeamsLocked = Boolean(game.lockedTeams?.blue && game.lockedTeams?.red);

  $("player-map-question-number").textContent =
    `FRAGE ${game.roundIndex + 1} VON ${GERMANY_MAP_QUESTIONS.length}`;
  $("player-map-question").textContent = isPending ? "" : question.prompt;
  $("player-map-question-number").closest(".map-question-card").classList.toggle("hidden", isPending);
  $("player-map-blue-score").textContent = game.roundScores.blue;
  $("player-map-red-score").textContent = game.roundScores.red;
  $("player-map-instruction").textContent = isPending
    ? "Wartet darauf, dass der Moderator die erste Runde startet."
    : isRevealed
    ? "Der Moderator hat das Ziel aufgedeckt."
    : bothTeamsLocked
      ? "Beide Antworten sind eingeloggt. Der Moderator deckt gleich die Distanz zum Ziel auf."
    : ownTeamLocked
      ? "Eure Antwort ist eingeloggt. Wartet auf das andere Team."
    : ownPin
      ? "Euer Team-Pin ist gesetzt. Ihr könnt ihn noch verschieben oder einloggen."
      : "Tippt auf die Europakarte, um euren gemeinsamen Team-Pin zu setzen.";

  $("lock-map-pin").classList.toggle("hidden", isPending);
  $("lock-map-pin").disabled = isPending || isRevealed || ownTeamLocked || !ownPin;
  $("lock-map-pin").textContent = ownTeamLocked
    ? "Antwort eingeloggt ✓"
    : "Antwort einloggen";
  $("player-map-chat").classList.toggle("hidden", isPending);
  if (!isPending) renderPlayerTeamChat("player-map-chat", teamChatIsWritable());

  playerMap?.render({
    pins: isPending ? { blue: null, red: null } : isRevealed || bothTeamsLocked
      ? game.pins
      : { blue: player.team === "blue" ? ownPin : null, red: player.team === "red" ? ownPin : null },
    target: question.target,
    revealed: isRevealed,
    locked: isRevealed || ownTeamLocked
  });

  if (isPending) {
    $("player-map-result").textContent = "Die erste Frage bleibt bis zum Rundenstart verborgen.";
  } else if (isRevealed) {
    const blueDistance = Math.round(game.distances.blue);
    const redDistance = Math.round(game.distances.red);
    const roundResult = `${question.location} · Blau: ${blueDistance} km · Rot: ${redDistance} km · ` +
      `${getTeamName(game.roundWinner)} ist näher`;
    $("player-map-result").textContent = isFinished
      ? `${roundResult} · 🏆 ${getTeamName(game.winningTeam)} gewinnt das Kartenspiel!`
      : roundResult;
  } else {
    $("player-map-result").textContent = bothTeamsLocked
      ? "Beide Team-Pins sind sichtbar. Das Ziel bleibt noch verborgen."
      : ownTeamLocked
      ? "Antwort eingeloggt ✓"
      : ownPin
      ? "Pin gesetzt ✓"
      : "Euer Team hat noch keinen Pin gesetzt.";
  }
}

function renderPlayerMatchingBox(value, assignerIndex) {
  const assigner = MATCHING_ASSIGNERS[assignerIndex];
  const positions = ["top-left", "top-right", "bottom-left", "bottom-right"];

  return `
    <div class="matching-assignment ${positions[assignerIndex]} ${assigner.team} revealed"
         aria-label="${escapeHtml(assigner.label)}">
      <span>${escapeHtml(value)}</span>
    </div>
  `;
}

function renderPlayerMatchingOptions(selectedValue = "", imageIndex = -1) {
  const usedElsewhere = new Set(
    matchingDraft.values.filter((_, index) => index !== imageIndex)
  );
  return [
    '<option value="">Spieler wählen</option>',
    ...(roomState.players || []).map((item) =>
      `<option value="${escapeHtml(item.name)}"${item.name === selectedValue ? " selected" : ""}` +
      `${usedElsewhere.has(item.name) ? " disabled" : ""}>` +
      `${escapeHtml(item.name)}</option>`
    )
  ].join("");
}

function renderPlayerMatchingOwnBox(imageIndex, assignerIndex, editable) {
  const assigner = MATCHING_ASSIGNERS[assignerIndex];
  const positions = ["top-left", "top-right", "bottom-left", "bottom-right"];
  const disabled = editable ? "" : " disabled";
  return `
    <label class="matching-assignment ${positions[assignerIndex]} ${assigner.team} active"
           aria-label="${escapeHtml(assigner.label)}">
      <select data-player-matching-index="${imageIndex}"${disabled}>
        ${renderPlayerMatchingOptions(matchingDraft.values[imageIndex] || "", imageIndex)}
      </select>
    </label>
  `;
}

function renderPlayerMatchingOverlays(game, imageIndex, ownAssignerIndex, editable) {
  const overlays = [];

  if (game.revealedTeams?.blue) {
    const values = game.revealedAssignments.blue[imageIndex];
    overlays.push(renderPlayerMatchingBox(values[0], 0));
    overlays.push(renderPlayerMatchingBox(values[1], 2));
  }
  if (game.revealedTeams?.red) {
    const values = game.revealedAssignments.red[imageIndex];
    overlays.push(renderPlayerMatchingBox(values[0], 1));
    overlays.push(renderPlayerMatchingBox(values[1], 3));
  }
  if (!game.revealedTeams?.blue && !game.revealedTeams?.red && ownAssignerIndex >= 0) {
    overlays.push(renderPlayerMatchingOwnBox(imageIndex, ownAssignerIndex, editable));
    const opponentValue = matchingDraft.opponentValues?.[imageIndex];
    if (opponentValue && Number.isInteger(matchingDraft.opponentAssignerIndex)) {
      overlays.push(renderPlayerMatchingBox(opponentValue, matchingDraft.opponentAssignerIndex));
    }
  }
  return overlays.join("");
}

function renderMatchingGame() {
  const game = roomState.game;
  const round = MATCHING_GAME_ROUNDS[game.roundIndex];
  const turn = getMatchingTurn(game.roundIndex, game.activeTurnIndex);
  const activePlayer = turn.assignerIndex === null ? null : game.assignerOrder?.[turn.assignerIndex];
  const ownAssignerIndex = game.assignerOrder?.findIndex((item) => item.id === playerId) ?? -1;
  const isSeeder = getMatchingTurn(game.roundIndex, 0).assignerIndexes.includes(ownAssignerIndex);
  const isPending = game.status === "round-pending";
  const canSelfAssign = game.status === "assigning" && game.activeTurnIndex === 0 &&
    isSeeder && !game.submittedTeams?.[player.team] && !matchingDraft.locked;
  const isFinished = game.status === "finished";
  const isRoundFinished = game.status === "round-finished";
  const isRevealing = ["ready-to-reveal", "revealing"].includes(game.status);
  const result = game.roundResults?.[game.roundIndex];

  $("player-matching-round").textContent =
    `Runde ${game.roundIndex + 1} von ${MATCHING_GAME_ROUNDS.length} · ${round.title}`;
  $("player-matching-blue-score").textContent = game.scores.blue;
  $("player-matching-red-score").textContent = game.scores.red;
  $("player-matching-board").classList.toggle("hidden", isPending);
  $("player-matching-board").innerHTML = isPending ? "" : round.images.map((image, imageIndex) => `
    <article class="matching-card">
      <div class="matching-image-frame">
        <img src="${image.src}" alt="${escapeHtml(image.label)}">
        ${renderPlayerMatchingOverlays(
          game,
          imageIndex,
          isSeeder ? ownAssignerIndex : -1,
          canSelfAssign && !matchingSubmissionPending
        )}
      </div>
    </article>
  `).join("");
  if (isPending) {
    $("player-matching-turn").className = "matching-turn finished";
    $("player-matching-turn").textContent = "Warte darauf, dass der Moderator die erste Runde startet.";
  } else if (isFinished || isRoundFinished || isRevealing) {
    $("player-matching-turn").className = "matching-turn finished";
    $("player-matching-turn").textContent = isFinished
      ? game.roundIndex < MATCHING_GAME_ROUNDS.length - 1
        ? "Das Spiel ist mathematisch entschieden."
        : "Alle Runden sind ausgewertet."
      : isRoundFinished
        ? `Runde ${game.roundIndex + 1} ist beendet.`
        : "Der Moderator deckt gleich alle Antworten auf.";
  } else {
    if (game.activeTurnIndex === 0) {
      $("player-matching-turn").className = "matching-turn split";
      $("player-matching-turn").textContent = isSeeder
        ? `${matchingDraft.opponentValues
          ? "Beide Zuordnungen sind eingeloggt."
          : matchingDraft.locked || game.submittedTeams?.[player.team]
          ? "Deine Zuordnungen sind eingeloggt. Warte auf das andere Team."
          : "Ordne den vier Bildern jeweils eine Person zu."}`
        : `Die beiden Spieler ${turn.playerIndex + 1} ordnen die Bilder zu.`;
    } else {
      $("player-matching-turn").className = `matching-turn ${turn.team}`;
      $("player-matching-turn").textContent =
        `${getTeamName(turn.team)} matcht · ${activePlayer?.name || "Spieler fehlt"} nennt die Zuordnungen.`;
    }
  }

  $("lock-player-matching").classList.toggle("hidden", !canSelfAssign || isPending);
  $("lock-player-matching").disabled = matchingSubmissionPending ||
    matchingDraft.values.some((value) => !value) ||
    !areMatchingValuesUnique(matchingDraft.values);
  $("lock-player-matching").textContent = matchingSubmissionPending
    ? "Zuordnungen werden eingeloggt…"
    : "Zuordnungen einloggen";

  if (isFinished) {
    $("player-matching-result").textContent = game.winningTeam
      ? `🏆 ${getTeamName(game.winningTeam)} gewinnt Da seh ich dich!`
      : "Da seh ich dich endet unentschieden.";
  } else if (isRoundFinished) {
    $("player-matching-result").textContent =
      `Team Blau: ${result.blue} Punkte · Team Rot: ${result.red} Punkte. Wartet auf die nächste Runde.`;
  } else if (isRevealing) {
    $("player-matching-result").textContent = "Der Moderator deckt gleich alle Antworten auf.";
  } else if (isPending) {
    $("player-matching-result").textContent = "Die Bilder bleiben bis zum Rundenstart verborgen.";
  } else {
    $("player-matching-result").textContent = game.activeTurnIndex === 0
      ? "Beide Teams spielen mit denselben vier Bildern."
      : `${getTeamName(turn.team)} nennt die Zuordnungen. Der Moderator trägt sie ein.`;
  }
}

function renderPriceGame() {
  const game = roomState.game;
  const product = getPriceProduct(game.roundIndex);
  const isRevealed = ["revealed", "finished"].includes(game.status);
  const isFinished = game.status === "finished";
  const ownTeam = player?.team || "blue";
  const locked = Boolean(game.lockedTeams?.[ownTeam] || priceDraft.locked);
  const editable = game.status === "guessing" && !locked && !priceSubmissionPending;

  $("player-price-round").textContent =
    `Produkt ${game.roundIndex + 1} von ${PRICE_PRODUCTS.length}`;
  $("player-price-blue-score").textContent = game.roundScores.blue;
  $("player-price-red-score").textContent = game.roundScores.red;
  $("player-price-product-image").src = product.src;
  $("player-price-product-image").alt = product.name;
  $("player-price-product-name").textContent = product.name;

  const amountInput = $("player-price-amount");
  if (amountInput.value !== priceDraft.amount) amountInput.value = priceDraft.amount;
  amountInput.disabled = !editable;
  renderPlayerTeamChat("player-price-chat", teamChatIsWritable());
  $("lock-price-guess").disabled = !editable || parseEuroAmount(priceDraft.amount) === null;
  $("lock-price-guess").textContent = priceSubmissionPending
    ? "Wird eingeloggt…"
    : locked ? "Team-Preis eingeloggt ✓" : "Preis einloggen";
  $("lock-price-guess").closest(".price-team-form").classList.toggle("locked", locked);

  if (isRevealed) {
    const result = game.revealed;
    const roundMessage = result.roundWinner
      ? `${getTeamName(result.roundWinner)} liegt näher.`
      : "Beide Teams liegen exakt gleich weit entfernt.";
    $("player-price-result").innerHTML = `
      <strong>Preis: ${formatEuroAmount(result.actualPrice)}</strong><br>
      Blau: ${formatEuroAmount(result.guesses.blue)}<br>
      Rot: ${formatEuroAmount(result.guesses.red)}<br>
      ${roundMessage}
      ${isFinished
        ? game.winningTeam
          ? `<br>🏆 ${getTeamName(game.winningTeam)} gewinnt Thrifty!`
          : "<br>Thrifty endet unentschieden."
        : ""}
    `;
    return;
  }

  if (locked) {
    $("player-price-result").textContent = game.lockedTeams.blue && game.lockedTeams.red
      ? "Beide Teams sind eingeloggt. Der Moderator kann den Preis aufdecken."
      : "Euer Preis ist eingeloggt. Wartet auf das andere Team.";
  } else {
    $("player-price-result").textContent = roomState.priceSubmissionKey
      ? "Beratet euch und loggt euren gemeinsamen Preis ein."
      : "Die sichere Team-Verbindung wird aufgebaut…";
  }
}

function formatEstimate(value) {
  return Number(value).toLocaleString("de-DE", { maximumFractionDigits: 3 });
}

function renderEstimationTeamBox(game, team, guesses, average, participants = null) {
  const teamParticipants = participants || (game.participants || []).filter((item) => item.team === team);
  return `<article class="estimation-team ${team}">
    <strong>${getTeamName(team)}</strong>
    ${teamParticipants.map((item) => `
      <div class="estimation-player-entry">
        <span>${escapeHtml(item.name)}</span>
        <span>${formatEstimate(guesses[item.id])}</span>
      </div>
    `).join("")}
    <div class="estimation-player-entry estimation-average-entry">
      <span>Mittelwert</span>
      <span>Ø ${formatEstimate(average)}</span>
    </div>
  </article>`;
}

function renderEstimationGame() {
  const game = roomState.game;
  const isGameNotStarted = game.status === "not-started";
  const isPending = game.status === "question-pending";
  const isGuessing = game.status === "guessing";
  const isReady = game.status === "ready-to-reveal";
  const isRevealed = ["revealed", "finished"].includes(game.status);
  const locked = game.lockedPlayerIds?.includes(playerId) || false;
  const editable = isGuessing && !locked && !estimationSubmissionPending;
  const resultElement = $("player-estimation-result");
  resultElement.classList.remove("hidden");

  $("player-estimation-eyebrow").classList.toggle("hidden", isGameNotStarted);
  $("player-estimation-title").classList.toggle("hidden", isGameNotStarted);
  $("player-estimation-round").classList.toggle("hidden", isGameNotStarted);
  $("player-estimation-score").classList.toggle("hidden", isGameNotStarted);
  $("player-estimation-round").textContent =
    `Frage ${game.roundIndex + 1} von ${ESTIMATION_ROUND_COUNT}`;
  $("player-estimation-blue-score").textContent = game.roundScores.blue;
  $("player-estimation-red-score").textContent = game.roundScores.red;
  $("player-estimation-question-card").classList.toggle("hidden", isPending || isGameNotStarted);
  $("player-estimation-question-number").textContent = `FRAGE ${game.roundIndex + 1}`;
  $("player-estimation-question").textContent = game.questionPrompt || "";
  document.querySelector(".estimation-player-form").classList.toggle(
    "hidden", isPending || isGameNotStarted || isReady || isRevealed
  );
  $("player-estimation-locks").classList.toggle("hidden", isPending || isGameNotStarted || isReady || isRevealed);

  const valueInput = $("player-estimation-value");
  if (document.activeElement !== valueInput && valueInput.value !== estimationDraft.value) {
    valueInput.value = estimationDraft.value;
  }
  valueInput.disabled = !editable;
  $("lock-estimation-value").disabled = !editable || parseEstimate(estimationDraft.value) === null;
  $("lock-estimation-value").textContent = estimationSubmissionPending
    ? "Wird eingeloggt…"
    : locked ? "Schätzung eingeloggt ✓" : "Schätzung einloggen";

  $("player-estimation-locks").innerHTML = (game.participants || []).map((item) => {
    const hasLocked = game.lockedPlayerIds?.includes(item.id);
    return `<span class="${hasLocked ? "ready" : ""}">${escapeHtml(item.name)}: ${hasLocked ? "eingeloggt ✓" : "schätzt…"}</span>`;
  }).join("");

  if (isGameNotStarted || isPending) {
    resultElement.textContent =
      isGameNotStarted
        ? "Wartet darauf, dass der Moderator Spiel 1 startet"
        : "Wartet darauf, dass der Moderator die erste Frage startet.";
    return;
  }
  if (isRevealed) {
    const result = game.revealed;
    const winnerText = result.roundWinner
      ? `${getTeamName(result.roundWinner)} liegt näher.`
      : "Beide Teams sind gleich weit entfernt.";
    resultElement.innerHTML = `
      <strong class="estimation-result-summary">Richtige Antwort: ${escapeHtml(result.answerDisplay)}</strong>
      <div class="estimation-submissions">
        ${renderEstimationTeamBox(game, "blue", result.guesses, result.averages.blue)}
        ${renderEstimationTeamBox(game, "red", result.guesses, result.averages.red)}
      </div>
      <span class="estimation-result-summary">${winnerText}</span>
      ${game.status === "finished"
        ? game.winningTeam
          ? `<br>🏆 ${getTeamName(game.winningTeam)} gewinnt Mittelwert!`
          : "<br>Mittelwert endet unentschieden."
        : ""}
    `;
    return;
  }
  if (isReady) {
    const guesses = Object.fromEntries((game.participants || []).map((item) => [
      item.id,
      parseEstimate(estimationDraft.allGuesses?.[item.id])
    ]));
    const allGuessesAvailable = (game.participants || []).every((item) => guesses[item.id] !== null);
    resultElement.innerHTML = allGuessesAvailable && estimationDraft.averages
      ? `<div class="estimation-submissions">
          ${renderEstimationTeamBox(game, "blue", guesses, estimationDraft.averages.blue)}
          ${renderEstimationTeamBox(game, "red", guesses, estimationDraft.averages.red)}
        </div>`
      : "Die Tipps und Mittelwerte werden berechnet…";
    return;
  }
  if (!locked && roomState.estimationSubmissionKey) {
    resultElement.textContent = "";
    resultElement.classList.add("hidden");
    return;
  }
  resultElement.textContent = locked
    ? "Deine Schätzung ist eingeloggt. Warte auf die anderen Spieler."
    : "Die sichere Verbindung wird aufgebaut…";
}

function wordMatchSecondsRemaining() {
  if (!roomState?.game?.phaseEndsAt) {
    return ["round-pending", "seed-collecting"].includes(roomState?.game?.status)
      ? WORD_MATCH_SEED_SECONDS
      : WORD_MATCH_PHASE_SECONDS;
  }
  return Math.max(0, Math.ceil((roomState.game.phaseEndsAt - Date.now()) / 1000));
}

function updatePlayerWordMatchTimer() {
  if (roomState?.game?.id !== WORD_MATCH_GAME_ID) return;
  const seconds = wordMatchSecondsRemaining();
  $("player-word-match-timer").textContent =
    `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function renderWordFields(editable) {
  const container = $("player-word-fields");
  for (let index = 0; index < WORD_MATCH_TERM_COUNT; index += 1) {
    let input = container.querySelector(`[data-word-field-index="${index}"]`);
    if (!input) {
      input = document.createElement("input");
      input.type = "text";
      input.autocomplete = "off";
      input.maxLength = 60;
      input.dataset.wordFieldIndex = index;
      input.placeholder = `${index + 1}. Begriff`;
      container.append(input);
    }
    if (document.activeElement !== input && input.value !== wordMatchDraft.terms[index]) {
      input.value = wordMatchDraft.terms[index];
    }
    input.disabled = !editable;
  }
}

function renderWordMatchLists(lists, matches = { blue: [], red: [] }) {
  return ["blue", "red"].map((team) => `
    <article class="word-match-list ${team}">
      <strong>${getTeamName(team)}</strong>
      ${Array.from({ length: WORD_MATCH_TERM_COUNT }, (_, index) => {
        const term = String(lists?.[team]?.[index] || "");
        const matched = matches?.[team]?.includes(index);
        return `<div class="word-match-term${matched ? " matched" : ""}${term ? "" : " empty"}">
          ${index + 1}. ${escapeHtml(term || "Leer")}${matched ? " ✓" : ""}
        </div>`;
      }).join("")}
    </article>
  `).join("");
}

function renderWordMatchGame() {
  const game = roomState.game;
  const roles = getWordMatchRoles(game);
  const [firstGuessTeam] = getWordMatchGuessOrder(game);
  const participant = game.participants.find((item) => item.id === playerId);
  const ownTeam = participant?.team;
  const isSeeder = roles.seeders[ownTeam]?.id === playerId;
  const isGuesser = roles.guessers[ownTeam]?.id === playerId;
  const activeSeeder = game.status === "seed-collecting" && isSeeder;
  const activeGuesser = game.status === `${ownTeam}-guessing` && isGuesser;
  const seederRoundActive = isSeeder && [
    "seed-collecting", "blue-guess-pending", "blue-guessing",
    "red-guess-pending", "red-guessing", "results-pending"
  ].includes(game.status);
  const categoryVisible = seederRoundActive || activeGuesser || Boolean(game.revealedLists);
  const locked = game.lockedSeederIds.includes(playerId) || false;
  const editable = activeSeeder && !locked && !wordMatchSubmissionPending;
  $("player-word-match-round").textContent =
    `Runde ${game.roundIndex + 1} von ${WORD_MATCH_CATEGORIES.length}`;
  $("player-word-match-blue-score").textContent = game.scores.blue;
  $("player-word-match-red-score").textContent = game.scores.red;
  $("player-word-match-category-card").classList.toggle("hidden", !categoryVisible);
  $("player-word-match-category").textContent = categoryVisible ? game.category : "";
  updatePlayerWordMatchTimer();

  $("player-word-seed-form").classList.toggle("hidden", !activeSeeder);
  renderWordFields(editable);
  $("lock-word-list").disabled = !editable;
  $("lock-word-list").textContent = wordMatchSubmissionPending
    ? "Wird eingeloggt…" : locked ? "Liste eingeloggt ✓" : "Liste einloggen";

  $("player-word-match-locks").innerHTML = Object.values(roles.seeders).map((item) => {
    const hasLocked = game.lockedSeederIds.includes(item?.id);
    return `<span class="${hasLocked ? "ready" : ""}">${escapeHtml(item?.name || "Spieler fehlt")}: ${hasLocked ? "eingeloggt ✓" : "schreibt…"}</span>`;
  }).join("");
  $("player-word-match-locks").classList.toggle(
    "hidden",
    !["seed-collecting", `${firstGuessTeam}-guess-pending`].includes(game.status)
  );

  const activeName = game.status.startsWith("blue-")
    ? roles.guessers.blue?.name : roles.guessers.red?.name;
  const messages = {
    "round-pending": "Wartet darauf, dass der Moderator die Listenphase startet.",
    "seed-collecting": activeSeeder
      ? "Trage bis zu zehn Begriffe ein."
      : `${roles.seeders.blue?.name} und ${roles.seeders.red?.name} erstellen ihre Listen.`,
    "blue-guess-pending": `Wartet auf den Start von ${roles.guessers.blue?.name}.`,
    "blue-guessing": activeGuesser
      ? "Nenne jetzt so viele passende Begriffe wie möglich."
      : `${activeName} aus Team Blau rät gerade.`,
    "red-guess-pending": `Wartet auf den Start von ${roles.guessers.red?.name}.`,
    "red-guessing": activeGuesser
      ? "Nenne jetzt so viele passende Begriffe wie möglich."
      : `${activeName} aus Team Rot rät gerade.`,
    "results-pending": "Beide Ratephasen sind beendet. Der Moderator deckt gleich auf.",
    "round-finished": "Die Runde ist beendet.",
    finished: game.winningTeam
      ? `🏆 ${getTeamName(game.winningTeam)} gewinnt Begriffsmatch!`
      : "Begriffsmatch endet unentschieden."
  };
  $("player-word-match-role").textContent = messages[game.status] || "";

  const result = game.roundResults[game.roundIndex];
  const revealedLists = result ? game.revealedLists : null;
  const privateLists = !result && isSeeder ? wordMatchDraft.lists : null;
  const visibleLists = revealedLists || privateLists;
  $("player-word-match-lists").classList.toggle("hidden", !visibleLists);
  $("player-word-match-lists").innerHTML = visibleLists
    ? renderWordMatchLists(visibleLists, revealedLists ? game.currentMatches : undefined)
    : "";
  $("player-word-match-result").textContent = result
    ? `Runde ${game.roundIndex + 1}: Blau ${result.blue} Treffer · Rot ${result.red} Treffer`
    : "";
}

async function tickPlayerWordMatchTimer() {
  if (roomState?.game?.id !== WORD_MATCH_GAME_ID) return;
  updatePlayerWordMatchTimer();
  if (roomState.game.status !== "seed-collecting" || !roomState.game.phaseEndsAt ||
      Date.now() < roomState.game.phaseEndsAt || wordMatchSubmissionPending || wordMatchDraft.locked) return;
  const roles = getWordMatchRoles(roomState.game);
  const isSeeder = Object.values(roles.seeders).some((item) => item?.id === playerId);
  if (!isSeeder) return;
  clearTimeout(wordMatchDraftTimer);
  wordMatchSubmissionPending = true;
  const sent = await sendWordMatchSubmission("lock");
  if (!sent) wordMatchSubmissionPending = false;
}

setInterval(() => void tickPlayerWordMatchTimer(), 250);

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
