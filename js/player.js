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
  getMatchingTurn
} from "./games/matching-game.js";
import { PRICE_PRODUCTS, getPriceProduct } from "./games/guess-the-price-products.js";
import { formatEuroAmount, formatSignedEuroDifference, parseEuroAmount } from "./euro.js";
import {
  createEncryptionKeyPair,
  decryptPrivatePayload,
  encryptPrivatePayload,
  exportEncryptionPublicKey
} from "./private-channel-crypto.js";
import { showGameTransition } from "./game-effects.js";

const TOP_20_GAME_ID = "spotify-top-artists";
const TOP_20_SLOT_COUNT = 20;
const GERMANY_MAP_GAME_ID = "germany-map";
const MATCHING_GAME_ID = "matching-game";
const PRICE_GAME_ID = "guess-the-price";

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
let top20Note = { roundIndex: -1, text: "" };
let top20NoteTimer = null;
let priceKeyPair = null;
let pricePublicKey = null;
let priceDraft = { roundIndex: -1, amount: "", comment: "", locked: false };
let priceDraftTimer = null;
let priceSubmissionPending = false;
let previousGameId = null;
let previousBuzzerStatus = null;

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
  previousGameId = roomState.game.id;
  previousBuzzerStatus = roomState.game.id === "buzzer" ? roomState.game.status : null;

  const restoredPlayer = roomState.players.find((item) => item.id === playerId);

  if (restoredPlayer) {
    player = restoredPlayer;
    showPlayerGame();
  }

  playerMap = createGermanyMap($("player-germany-map"), {
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

async function sendTop20Note() {
  if (!player || roomState?.game?.id !== TOP_20_GAME_ID ||
      roomState.game.status !== "playing" || !roomState.top20SubmissionKey) return false;

  try {
    const encrypted = await encryptPrivatePayload(roomState.top20SubmissionKey, {
      playerId,
      roundIndex: roomState.game.roundIndex,
      text: top20Note.text
    });
    await realtime.send("top20_private_submission", { playerId, encrypted });
    return true;
  } catch (error) {
    console.error("Private Top 20 note could not be encrypted:", error);
    return false;
  }
}

$("player-top20-note").addEventListener("input", (event) => {
  top20Note.text = event.currentTarget.value.slice(0, 280);
  clearTimeout(top20NoteTimer);
  top20NoteTimer = setTimeout(() => {
    void sendTop20Note();
  }, 300);
});

$("player-top20-note").addEventListener("blur", () => {
  clearTimeout(top20NoteTimer);
  void sendTop20Note();
});

$("lock-map-pin").addEventListener("click", async () => {
  if (!player || roomState?.game?.id !== GERMANY_MAP_GAME_ID ||
      roomState.game.status !== "placing" || !roomState.game.pins?.[player.team] ||
      roomState.game.lockedTeams?.[player.team]) return;

  await realtime.send("map_lock", { playerId });
});

async function sendPriceSubmission(type = "draft") {
  if (!player || roomState?.game?.id !== PRICE_GAME_ID ||
      roomState.game.status !== "guessing" || roomState.game.lockedTeams?.[player.team] ||
      !roomState.priceSubmissionKey) return false;

  try {
    const encrypted = await encryptPrivatePayload(roomState.priceSubmissionKey, {
      type,
      playerId,
      roundIndex: roomState.game.roundIndex,
      amount: priceDraft.amount,
      comment: priceDraft.comment
    });
    await realtime.send("price_private_submission", { playerId, encrypted });
    return true;
  } catch (error) {
    console.error("Private price draft could not be encrypted:", error);
    $("player-price-error").textContent = "Der Teamentwurf konnte nicht synchronisiert werden.";
    return false;
  }
}

function schedulePriceDraft() {
  clearTimeout(priceDraftTimer);
  priceDraftTimer = setTimeout(() => {
    void sendPriceSubmission("draft");
  }, 300);
}

$("player-price-amount").addEventListener("input", (event) => {
  priceDraft.amount = event.currentTarget.value.slice(0, 40);
  $("player-price-error").textContent = "";
  schedulePriceDraft();
});

$("player-price-comment").addEventListener("input", (event) => {
  priceDraft.comment = event.currentTarget.value.slice(0, 280);
  $("player-price-error").textContent = "";
  schedulePriceDraft();
});

function flushPriceDraft() {
  clearTimeout(priceDraftTimer);
  void sendPriceSubmission("draft");
}

$("player-price-amount").addEventListener("blur", flushPriceDraft);
$("player-price-comment").addEventListener("blur", flushPriceDraft);

$("lock-price-guess").addEventListener("click", async () => {
  if (priceSubmissionPending || parseEuroAmount(priceDraft.amount) === null) {
    $("player-price-error").textContent = "Bitte gebt zuerst einen gültigen Euro-Betrag ein.";
    return;
  }

  clearTimeout(priceDraftTimer);
  priceSubmissionPending = true;
  $("player-price-error").textContent = "Preis wird eingeloggt…";
  renderPriceGame();
  const sent = await sendPriceSubmission("lock");
  if (!sent) {
    priceSubmissionPending = false;
    renderPriceGame();
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
      const commentIsFocused = document.activeElement === $("player-price-comment");
      priceDraft = {
        roundIndex: privateState.roundIndex,
        amount: amountIsFocused
          ? priceDraft.amount
          : String(privateState.draft?.amount || ""),
        comment: commentIsFocused
          ? priceDraft.comment
          : String(privateState.draft?.comment || ""),
        locked: Boolean(privateState.locked)
      };
      priceSubmissionPending = false;
      render();
    } catch (error) {
      console.warn("Private team draft could not be decrypted:", error);
    }
    return;
  }

  if (event === "top20_private_state" && payload.playerId === playerId &&
      payload.encrypted && priceKeyPair?.privateKey) {
    try {
      const privateState = await decryptPrivatePayload(priceKeyPair.privateKey, payload.encrypted);
      if (privateState.roundIndex !== roomState?.game?.roundIndex) return;
      if (document.activeElement === $("player-top20-note")) return;
      top20Note = {
        roundIndex: privateState.roundIndex,
        text: String(privateState.note?.text || "")
      };
      render();
    } catch (error) {
      console.warn("Private Top 20 note could not be decrypted:", error);
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

  if (event === "room_state") {
    roomState = payload;

    if (player && roomState.players?.some((item) => item.id === playerId)) {
      showPlayerGame();
    }

    sendingBuzz = false;
    if (player) await registerPriceKey();
    if (roomState.game?.id === TOP_20_GAME_ID &&
        top20Note.roundIndex !== roomState.game.roundIndex) {
      top20Note = { roundIndex: roomState.game.roundIndex, text: "" };
    }
    if (roomState.game?.id === PRICE_GAME_ID) {
      if (priceDraft.roundIndex !== roomState.game.roundIndex) {
        priceDraft = {
          roundIndex: roomState.game.roundIndex,
          amount: "",
          comment: "",
          locked: Boolean(roomState.game.lockedTeams?.[player?.team])
        };
      }
    }
    render();
  }
}

function render() {
  if (!joined || !roomState) return;

  const currentGameId = roomState.game?.id;
  if (previousGameId && previousGameId !== currentGameId) {
    showGameTransition(currentGameId);
  } else if (currentGameId === "buzzer" && previousBuzzerStatus === "not-started" &&
      roomState.game.status !== "not-started") {
    showGameTransition(currentGameId);
  }
  previousGameId = currentGameId;
  previousBuzzerStatus = currentGameId === "buzzer" ? roomState.game.status : null;

  const spotifyIsActive = roomState.game?.id === TOP_20_GAME_ID;
  const mapIsActive = roomState.game?.id === GERMANY_MAP_GAME_ID;
  const matchingIsActive = roomState.game?.id === MATCHING_GAME_ID;
  const priceIsActive = roomState.game?.id === PRICE_GAME_ID;
  document.querySelector(".player-shell").classList.toggle(
    "wide-game",
    spotifyIsActive || mapIsActive || matchingIsActive || priceIsActive
  );
  $("player-buzzer-game").classList.toggle(
    "hidden",
    spotifyIsActive || mapIsActive || matchingIsActive || priceIsActive
  );
  $("player-spotify-game").classList.toggle("hidden", !spotifyIsActive);
  $("player-map-game").classList.toggle("hidden", !mapIsActive);
  $("player-matching-game").classList.toggle("hidden", !matchingIsActive);
  $("player-price-game").classList.toggle("hidden", !priceIsActive);

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
  const noteInput = $("player-top20-note");
  if (noteInput.value !== top20Note.text) noteInput.value = top20Note.text;
  noteInput.disabled = game.status !== "playing";
  $("player-spotify-result").classList.toggle("hidden", !isFinished && !isRoundFinished);
  $("player-spotify-result").textContent = isFinished
    ? `🏆 ${getTeamName(game.winningTeam)} gewinnt Top 20!`
    : isRoundFinished
      ? `Liste ${roundNumber} ist beendet. Wartet auf die nächste Liste.`
      : "";
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
  const isRevealed = game.status === "revealed" || game.status === "finished";
  const isFinished = game.status === "finished";
  const ownPin = game.pins?.[player.team];
  const ownTeamLocked = Boolean(game.lockedTeams?.[player.team]);

  $("player-map-question-number").textContent =
    `FRAGE ${game.roundIndex + 1} VON ${GERMANY_MAP_QUESTIONS.length}`;
  $("player-map-question").textContent = question.prompt;
  $("player-map-blue-score").textContent = game.roundScores.blue;
  $("player-map-red-score").textContent = game.roundScores.red;
  $("player-map-instruction").textContent = isRevealed
    ? "Der Moderator hat das Ziel aufgedeckt."
    : ownTeamLocked
      ? "Eure Antwort ist eingeloggt. Wartet auf das andere Team."
    : ownPin
      ? "Euer Team-Pin ist gesetzt. Ihr könnt ihn noch verschieben oder einloggen."
      : "Tippt auf die Karte, um euren gemeinsamen Team-Pin zu setzen.";

  $("lock-map-pin").disabled = isRevealed || ownTeamLocked || !ownPin;
  $("lock-map-pin").textContent = ownTeamLocked
    ? "Antwort eingeloggt ✓"
    : "Antwort einloggen";

  playerMap?.render({
    pins: isRevealed
      ? game.pins
      : { blue: player.team === "blue" ? ownPin : null, red: player.team === "red" ? ownPin : null },
    target: question.target,
    revealed: isRevealed,
    locked: isRevealed || ownTeamLocked
  });

  if (isRevealed) {
    const blueDistance = Math.round(game.distances.blue);
    const redDistance = Math.round(game.distances.red);
    $("player-map-result").textContent = isFinished
      ? `🏆 ${getTeamName(game.winningTeam)} gewinnt das Kartenspiel! Blau: ${blueDistance} km · Rot: ${redDistance} km`
      : `${question.answer} · ${getTeamName(game.roundWinner)} ist näher! Blau: ${blueDistance} km · Rot: ${redDistance} km`;
  } else {
    $("player-map-result").textContent = ownTeamLocked
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

function renderPlayerMatchingOverlays(game, imageIndex) {
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
  return overlays.join("");
}

function renderMatchingGame() {
  const game = roomState.game;
  const round = MATCHING_GAME_ROUNDS[game.roundIndex];
  const turn = getMatchingTurn(game.roundIndex, game.activeTurnIndex);
  const activePlayer = game.assignerOrder?.[turn.assignerIndex];
  const isFinished = game.status === "finished";
  const isRoundFinished = game.status === "round-finished";
  const isRevealing = ["ready-to-reveal", "revealing"].includes(game.status);
  const result = game.roundResults?.[game.roundIndex];

  $("player-matching-round").textContent =
    `Runde ${game.roundIndex + 1} von ${MATCHING_GAME_ROUNDS.length} · ${round.title}`;
  $("player-matching-blue-score").textContent = game.scores.blue;
  $("player-matching-red-score").textContent = game.scores.red;
  $("player-matching-board").innerHTML = round.images.map((image, imageIndex) => `
    <article class="matching-card">
      <div class="matching-image-frame">
        <img src="${image.src}" alt="${escapeHtml(image.label)}">
        ${renderPlayerMatchingOverlays(game, imageIndex)}
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
      `${getTeamName(turn.team)} spielt · ${turn.label} (${activePlayer?.name || "Spieler fehlt"}) ordnet zu.`;
  }

  if (isFinished) {
    const overallWinner = roomState.scores.blue === roomState.scores.red
      ? null
      : roomState.scores.blue > roomState.scores.red ? "blue" : "red";
    $("player-matching-result").textContent = game.winningTeam
      ? `🏆 ${getTeamName(game.winningTeam)} gewinnt Da seh ich dich! ` +
        `🎉 ${overallWinner
          ? `${getTeamName(overallWinner)} gewinnt die gesamte Gameshow!`
          : "Die Gameshow endet insgesamt unentschieden."}`
      : `Da seh ich dich endet unentschieden. ${overallWinner
        ? `🎉 ${getTeamName(overallWinner)} gewinnt die gesamte Gameshow!`
        : "Die Gameshow endet insgesamt unentschieden."}`;
  } else if (isRoundFinished) {
    $("player-matching-result").textContent =
      `${result[game.activeTeam]} Punkte für ${getTeamName(game.activeTeam)}. Wartet auf die nächste Runde.`;
  } else if (isRevealing) {
    const revealed = game.revealedTeams.blue ? "Team Blau" :
      game.revealedTeams.red ? "Team Rot" : "Noch kein Team";
    $("player-matching-result").textContent = `${revealed} ist aufgedeckt.`;
  } else {
    $("player-matching-result").textContent =
      `${getTeamName(turn.team)} nennt die Zuordnungen. Der Moderator trägt sie ein.`;
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
  const commentInput = $("player-price-comment");
  if (amountInput.value !== priceDraft.amount) amountInput.value = priceDraft.amount;
  if (commentInput.value !== priceDraft.comment) commentInput.value = priceDraft.comment;
  amountInput.disabled = !editable;
  commentInput.disabled = !editable;
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
      Blau: ${formatSignedEuroDifference(result.actualPrice, result.guesses.blue)}<br>
      Rot: ${formatSignedEuroDifference(result.actualPrice, result.guesses.red)}<br>
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
