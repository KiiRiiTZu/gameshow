import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  adjustModeratorScore,
  getModeratorGameScore,
  setModeratorScore
} from "../js/moderator-score.js";

import {
  BUZZER_CORRECT_POINTS,
  BUZZER_WINNING_SCORE,
  BUZZER_WRONG_POINTS,
  buzzerQuizGame
} from "../js/games/buzzer-quiz.js";
import { BUZZER_QUESTIONS } from "../js/games/buzzer-questions.js";
import { SET_WINNING_SCORE, setGame } from "../js/games/set.js";
import { SET_ROUNDS } from "../js/games/set-rounds.js";
import { TOP_20_MAX_STRIKES, top20Game } from "../js/games/top-20.js";
import { TOP_20_LISTS, TOP_20_SLOT_COUNT } from "../js/games/top-20-lists.js";
import {
  RANKING_MAX_STRIKES,
  RANKING_ROUNDS_TO_WIN,
  RANKING_TURN_SECONDS,
  einordnenGame
} from "../js/games/einordnen.js";
import { RANKING_LISTS } from "../js/games/ranking-lists.js";
import {
  KARTENWISSEN_QUESTIONS,
  KARTENWISSEN_ROUNDS_TO_WIN,
  distanceInKilometers,
  kartenwissenGame
} from "../js/games/kartenwissen.js";
import {
  MATCHING_ASSIGNERS,
  MATCHING_GAME_ROUNDS,
  MATCHING_TIEBREAK_IMAGES,
  MATCHING_TURNS,
  areMatchingValuesUnique,
  getMatchingRoleRoundIndex,
  getMatchingTurn,
  daSehIchDichGame
} from "../js/games/da-seh-ich-dich.js";
import {
  createMatchingKeyPair,
  decryptMatchingSubmission,
  encryptMatchingSubmission,
  exportMatchingPublicKey
} from "../js/matching-crypto.js";
import {
  PRICE_GAME_WINNING_SCORE,
  formatEuroAmount,
  formatSignedEuroDifference,
  thriftyGame,
  parseEuroAmount
} from "../js/games/thrifty.js";
import { PRICE_PRODUCTS } from "../js/games/guess-the-price-products.js";
import {
  ESTIMATION_ROUNDS_TO_WIN,
  mittelwertGame,
  parseEstimate
} from "../js/games/mittelwert.js";
import { ESTIMATION_QUESTIONS } from "../js/games/estimation-questions.js";
import {
  WORD_MATCH_CATEGORIES,
  WORD_MATCH_PHASE_SECONDS,
  WORD_MATCH_SEED_SECONDS,
  WORD_MATCH_TERM_COUNT,
  WORD_MATCH_TIEBREAK_SECONDS,
  WORD_MATCH_TIEBREAK_TERMS,
  getWordMatchGuessOrder,
  getWordMatchRoles,
  begriffsmatchGame
} from "../js/games/begriffsmatch.js";
import {
  createEncryptionKeyPair,
  decryptPrivatePayload,
  encryptPrivatePayload,
  exportEncryptionPublicKey
} from "../js/private-channel-crypto.js";
import { createInitialRoomState } from "../js/room.js";
import { getGamePresentation } from "../js/game-effects.js";
import {
  addTeamChatMessage,
  clearExpiredTeamChatTyping,
  createTeamChat,
  getTeamChatView,
  setTeamChatTyping,
  supportsTeamChat
} from "../js/team-chat.js";

test("keeps session chat private per team and expires typing indicators", () => {
  const chat = createTeamChat("thrifty");
  const bluePlayer = { id: "b1", name: "Blau 1" };
  const redPlayer = { id: "r1", name: "Rot 1" };

  addTeamChatMessage(chat, "blue", bluePlayer, "Unser Tipp ist 25 €", "m1", 1_000);
  addTeamChatMessage(chat, "red", redPlayer, "Vielleicht 30 €", "m2", 1_100);
  setTeamChatTyping(chat, "blue", bluePlayer, true, 2_000);

  assert.deepEqual(getTeamChatView(chat, "blue", 2_100).messages.map((item) => item.id), ["m1"]);
  assert.deepEqual(getTeamChatView(chat, "red", 2_100).messages.map((item) => item.id), ["m2"]);
  assert.equal(getTeamChatView(chat, "blue", 2_100).typing[0].name, "Blau 1");
  assert.deepEqual(clearExpiredTeamChatTyping(chat, 4_501), [
    { team: "blue", playerId: "b1", name: "Blau 1" }
  ]);
  assert.deepEqual(getTeamChatView(chat, "blue", 4_501).typing, []);
});

test("does not truncate a busy session chat after 100 messages", () => {
  const chat = createTeamChat("top-20");
  const player = { id: "b1", name: "Blau 1" };
  for (let index = 0; index < 150; index += 1) {
    addTeamChatMessage(chat, "blue", player, `Nachricht ${index + 1}`, `m${index + 1}`, index);
  }
  assert.equal(chat.blue.messages.length, 150);
  assert.equal(chat.blue.messages[0].text, "Nachricht 1");
});

test("enables the private session chat for Einordnen", () => {
  assert.equal(supportsTeamChat("einordnen"), true);
});

test("contains presentation cards for all seven games", () => {
  assert.deepEqual([
    "mittelwert",
    "thrifty",
    "kartenwissen",
    "begriffsmatch",
    "einordnen",
    "da-seh-ich-dich",
    "set"
  ].map((gameId) => getGamePresentation(gameId).number), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(getGamePresentation("thrifty").name, "Thrifty");
  assert.equal(getGamePresentation("kartenwissen").name, "Kartenwissen");
  assert.equal(getGamePresentation("da-seh-ich-dich").name, "Da seh ich dich");
  assert.equal(getGamePresentation("mittelwert").name, "Mittelwert");
  assert.equal(getGamePresentation("begriffsmatch").name, "Begriffsmatch");
  assert.equal(getGamePresentation("einordnen").name, "Einordnen");
  assert.equal(getGamePresentation("top-20").name, "Top 20");
  assert.equal(getGamePresentation("set").name, "SET");
});

test("SET contains the example and all nine supplied rounds", () => {
  assert.equal(SET_ROUNDS.length, 10);
  assert.equal(SET_ROUNDS[0].example, true);
  assert.ok(SET_ROUNDS.every((round) => round.cards.length === 12));
  assert.ok(SET_ROUNDS.flatMap((round) => round.cards).every((card) =>
    ["oval", "diamond", "rectangle"].includes(card.shape) &&
    ["red", "green", "blue"].includes(card.color) &&
    ["open", "striped", "solid"].includes(card.fill) &&
    [1, 2, 3].includes(card.count)
  ));
});

test("SET lets the moderator select three cards and judge the answer", () => {
  const state = createInitialRoomState("TEST");
  setGame.setup(state);
  assert.equal(setGame.startRound(state), true);
  assert.equal(setGame.registerBuzz(state, { id: "b1", name: "Blau 1", team: "blue" }, 100), true);
  assert.equal(setGame.toggleCard(state, 4), true);
  assert.equal(setGame.toggleCard(state, 5), true);
  assert.equal(setGame.resolve(state, true), false);
  assert.equal(setGame.toggleCard(state, 6), true);
  assert.equal(setGame.resolve(state, true), true);
  assert.deepEqual(state.game.scores, { blue: 0, red: 0 }, "die Beispielrunde zählt nicht");
  assert.equal(setGame.advanceRound(state), true);
  assert.equal(state.game.status, "round-pending");
});

test("SET awards wrong answers to the opponent and ends at five", () => {
  const state = createInitialRoomState("TEST");
  setGame.setup(state);
  state.game.roundIndex = 1;
  state.game.scores.red = SET_WINNING_SCORE - 1;
  setGame.startRound(state);
  setGame.registerBuzz(state, { id: "b1", name: "Blau 1", team: "blue" });
  [1, 2, 3].forEach((number) => setGame.toggleCard(state, number));
  assert.equal(setGame.resolve(state, false), true);
  assert.equal(state.game.scores.red, SET_WINNING_SCORE);
  assert.equal(state.game.status, "finished");
  assert.equal(state.game.winningTeam, "red");
  assert.equal(state.scores.red, 1);
});

test("contains the three prepared Einordnen lists and their anchors", () => {
  assert.equal(RANKING_LISTS.length, 3);
  assert.deepEqual(RANKING_LISTS.map((list) => list.anchorId), ["iso", "banana", "man-germany"]);
  assert.deepEqual(RANKING_LISTS.map((list) => list.entries.length), [15, 15, 15]);
  assert.equal(RANKING_LISTS[0].entries.find((entry) => entry.id === "miks")?.label, "Miks");
  assert.equal(RANKING_LISTS[1].entries[0].label, "Ja Blütenhonig");
  assert.equal(RANKING_LISTS[1].entries.at(-2).label, "Avocado");
  assert.equal(RANKING_LISTS[2].entries[5].label, "Ponys");
  for (const list of RANKING_LISTS) {
    assert.ok(list.entries.length > 1);
    assert.ok(list.entries.some((entry) => entry.id === list.anchorId));
  }
});

test("Einordnen validates relative placements and alternates turns", () => {
  const state = createInitialRoomState("TEST");
  einordnenGame.start(state, "blue");

  assert.equal(state.game.status, "not-started");
  assert.equal(einordnenGame.startFirstRound(state), true);
  assert.deepEqual(state.game.placedIds, ["iso"]);
  assert.equal(einordnenGame.proposePlacement(state, "sova", 1), true);
  assert.equal(einordnenGame.revealPlacement(state), true);
  assert.equal(state.game.lastResult.correct, true);
  assert.deepEqual(state.game.placedIds, ["sova", "iso"]);
  assert.equal(state.game.currentTeam, "red");

  assert.equal(einordnenGame.proposePlacement(state, "harbor", 1), true);
  assert.equal(einordnenGame.revealPlacement(state), true);
  assert.equal(state.game.lastResult.correct, false);
  assert.equal(state.game.strikes.red, 1);
  assert.equal(state.game.remainingIds.includes("harbor"), true);
  assert.equal(state.game.currentTeam, "blue");
});

test("Einordnen starts a 90 second timer and leaves timeout judgment to the moderator", () => {
  const state = createInitialRoomState("TEST");
  einordnenGame.start(state, "blue");
  assert.equal(RANKING_TURN_SECONDS, 90);
  assert.equal(einordnenGame.startFirstRound(state, 1_000), true);
  assert.equal(state.game.turnEndsAt, 91_000);
  assert.equal(einordnenGame.penalizeExpiredTurn(state, 90_999), false);
  assert.equal(state.game.strikes.blue, 0);

  assert.equal(einordnenGame.penalizeExpiredTurn(state, 91_000), true);
  assert.equal(state.game.strikes.blue, 1);
  assert.equal(state.game.currentTeam, "red");
  assert.equal(state.game.turnEndsAt, 181_000);
  assert.equal(state.game.lastResult.timedOut, true);
});

test("Einordnen lets the moderator move a pending placement before revealing it", () => {
  const state = createInitialRoomState("TEST");
  einordnenGame.start(state, "blue");
  einordnenGame.startFirstRound(state);

  assert.equal(einordnenGame.proposePlacement(state, "sova", 1), true);
  assert.equal(state.game.status, "ready-to-reveal");
  assert.equal(state.game.proposal.position, 1);
  assert.equal(einordnenGame.updateProposalPosition(state, 2), true);
  assert.equal(state.game.proposal.position, 2);
  assert.equal(einordnenGame.updateProposalPosition(state, 3), false);

  assert.equal(einordnenGame.revealPlacement(state), true);
  assert.equal(einordnenGame.updateProposalPosition(state, 1), false);
});

test("lets the moderator correct overall and active game scores without going below zero", () => {
  const state = createInitialRoomState("TEST");

  assert.equal(adjustModeratorScore(state, "show", "blue", 1), true);
  assert.deepEqual(state.scores, { blue: 1, red: 0 });
  assert.equal(adjustModeratorScore(state, "show", "red", -1), false);

  assert.equal(getModeratorGameScore(state.game).label, "Rundensiege");
  assert.equal(adjustModeratorScore(state, "game", "red", 1), true);
  assert.deepEqual(state.game.roundScores, { blue: 0, red: 1 });
  assert.equal(setModeratorScore(state, "game", "red", "7"), true);
  assert.equal(state.game.roundScores.red, 7);
  assert.equal(setModeratorScore(state, "game", "red", "falsch"), false);
  assert.equal(state.game.roundScores.red, 7);
  assert.equal(adjustModeratorScore(state, "game", "red", -1), true);
  assert.equal(state.game.roundScores.red, 6);
});

test("finishes fixed-target games when the moderator enters a winning score", () => {
  const state = createInitialRoomState("TEST");

  assert.equal(setModeratorScore(state, "game", "red", "5"), true);
  assert.equal(state.game.status, "finished");
  assert.equal(state.game.winningTeam, "red");
  assert.equal(state.game.manualFinish, true);
  assert.deepEqual(state.scores, { blue: 0, red: 1 });
});

test("does not award the same manually selected game winner twice", () => {
  const state = createInitialRoomState("TEST");

  setModeratorScore(state, "game", "blue", "5");
  assert.equal(setModeratorScore(state, "game", "blue", "6"), true);
  assert.deepEqual(state.scores, { blue: 1, red: 0 });
});

test("finishes cumulative games once a manually entered lead is unreachable", () => {
  const state = createInitialRoomState("TEST");
  state.game = {
    id: "da-seh-ich-dich",
    status: "assigning",
    roundIndex: 2,
    scores: { blue: 5, red: 4 },
    roundResults: [{ blue: 2, red: 2 }, { blue: 3, red: 2 }],
    winningTeam: null
  };

  assert.equal(setModeratorScore(state, "game", "blue", "13"), true);
  assert.equal(state.game.status, "finished");
  assert.equal(state.game.winningTeam, "blue");
  assert.equal(state.scores.blue, 1);
});

test("maps every game to the score shown to the moderator", () => {
  const cases = [
    ["buzzer-quiz", "scores"],
    ["set", "scores"],
    ["top-20", "roundWins"],
    ["einordnen", "roundWins"],
    ["kartenwissen", "roundScores"],
    ["da-seh-ich-dich", "scores"],
    ["thrifty", "roundScores"],
    ["mittelwert", "roundScores"],
    ["begriffsmatch", "scores"]
  ];

  for (const [id, key] of cases) {
    const game = { id, [key]: { blue: 2, red: 3 } };
    assert.deepEqual(getModeratorGameScore(game).scores, { blue: 2, red: 3 });
  }

  const tiebreak = {
    id: "begriffsmatch",
    scores: { blue: 8, red: 8 },
    tiebreak: { scores: { blue: 1, red: 2 } }
  };
  assert.deepEqual(getModeratorGameScore(tiebreak).scores, { blue: 1, red: 2 });
});

test("Einordnen ends a list on the second error and alternates its starting team", () => {
  const state = createInitialRoomState("TEST");
  einordnenGame.start(state, "blue");
  einordnenGame.startFirstRound(state);
  assert.equal(RANKING_MAX_STRIKES, 2);
  assert.equal(RANKING_ROUNDS_TO_WIN, 2);

  einordnenGame.proposePlacement(state, "jett", 2);
  einordnenGame.revealPlacement(state);
  einordnenGame.proposePlacement(state, "harbor", 2);
  einordnenGame.revealPlacement(state);
  einordnenGame.proposePlacement(state, "reyna", 2);
  einordnenGame.revealPlacement(state);

  assert.equal(state.game.status, "round-finished");
  assert.equal(state.game.roundWinner, "red");
  assert.equal(state.game.roundWins.red, 1);
  const nextRemainingId = RANKING_LISTS[0].entries.find((entry) =>
    state.game.remainingIds.includes(entry.id)
  ).id;
  assert.equal(einordnenGame.revealNextRemaining(state), true);
  assert.equal(state.game.remainingIds.includes(nextRemainingId), false);
  assert.equal(state.game.lastResult.itemId, nextRemainingId);
  assert.equal(state.game.lastResult.cleanupReveal, true);
  assert.equal(einordnenGame.startNextRound(state), true);
  assert.equal(state.game.currentTeam, "red");
  assert.deepEqual(state.game.placedIds, ["banana"]);
});

test("starts a new show with Mittelwert waiting for the moderator", () => {
  const state = createInitialRoomState("TEST");
  assert.equal(state.game.id, "mittelwert");
  assert.equal(state.game.status, "not-started");
});

test("alternates Begriffsmatch roles with 120 seconds to write and 45 seconds to guess", () => {
  const state = createInitialRoomState("TEST");
  const participants = [
    { id: "b1", name: "B1", team: "blue" },
    { id: "b2", name: "B2", team: "blue" },
    { id: "r1", name: "R1", team: "red" },
    { id: "r2", name: "R2", team: "red" }
  ];
  begriffsmatchGame.start(state, participants);
  let roles = getWordMatchRoles(state.game);
  assert.equal(roles.seeders.blue.id, "b1");
  assert.equal(roles.guessers.blue.id, "b2");
  assert.equal(begriffsmatchGame.startSeedPhase(state, WORD_MATCH_CATEGORIES[0], 1_000), true);
  assert.equal(state.game.phaseEndsAt, 1_000 + WORD_MATCH_SEED_SECONDS * 1000);
  begriffsmatchGame.lockSeeder(state, "b1");
  begriffsmatchGame.lockSeeder(state, "r1");
  assert.equal(state.game.status, "blue-guess-pending");
  begriffsmatchGame.startGuessPhase(state, "blue", 2_000);
  assert.equal(state.game.phaseEndsAt, 2_000 + WORD_MATCH_PHASE_SECONDS * 1000);
  begriffsmatchGame.finishGuessPhase(state, "blue");
  begriffsmatchGame.startGuessPhase(state, "red", 3_000);
  begriffsmatchGame.finishGuessPhase(state, "red");
  assert.equal(state.game.status, "results-pending");
  assert.equal(state.game.roundResults.length, 0);
  assert.deepEqual(state.game.scores, { blue: 0, red: 0 });
  assert.equal(begriffsmatchGame.revealRound(state, { blue: ["A"], red: ["B"] }), true);
  assert.equal(state.game.revealedLists.blue[0], "A");
  begriffsmatchGame.startNextRound(state);
  roles = getWordMatchRoles(state.game);
  assert.equal(roles.seeders.blue.id, "b2");
  assert.equal(roles.guessers.blue.id, "b1");
  assert.deepEqual(getWordMatchGuessOrder(state.game), ["red", "blue"]);
  begriffsmatchGame.startSeedPhase(state, WORD_MATCH_CATEGORIES[1]);
  begriffsmatchGame.finishSeedPhase(state);
  assert.equal(state.game.status, "red-guess-pending");
  assert.equal(begriffsmatchGame.startGuessPhase(state, "blue"), false);
  assert.equal(begriffsmatchGame.startGuessPhase(state, "red"), true);
  assert.equal(begriffsmatchGame.finishGuessPhase(state, "red"), true);
  assert.equal(state.game.status, "blue-guess-pending");
});

test("starts the Begriffsmatch Kino tiebreak after four tied rounds", () => {
  const state = createInitialRoomState("TEST");
  const participants = [
    { id: "b1", name: "B1", team: "blue" },
    { id: "b2", name: "B2", team: "blue" },
    { id: "r1", name: "R1", team: "red" },
    { id: "r2", name: "R2", team: "red" }
  ];
  begriffsmatchGame.start(state, participants);

  for (let round = 0; round < WORD_MATCH_CATEGORIES.length; round += 1) {
    begriffsmatchGame.startSeedPhase(state, WORD_MATCH_CATEGORIES[round]);
    begriffsmatchGame.finishSeedPhase(state);
    for (const team of getWordMatchGuessOrder(state.game)) {
      begriffsmatchGame.startGuessPhase(state, team);
      begriffsmatchGame.finishGuessPhase(state, team);
    }
    begriffsmatchGame.revealRound(state, { blue: [], red: [] });
    if (round < WORD_MATCH_CATEGORIES.length - 1) begriffsmatchGame.startNextRound(state);
  }

  assert.equal(state.game.status, "round-finished");
  assert.equal(state.game.tiebreak, null);
  assert.deepEqual(state.game.roundResults[state.game.roundIndex], { blue: 0, red: 0 });
  assert.equal(begriffsmatchGame.startTiebreaker(state, 4_000), true);
  assert.equal(state.game.status, "tiebreak-playing");
  assert.deepEqual(state.game.tiebreak.terms, WORD_MATCH_TIEBREAK_TERMS);
  assert.equal(state.game.phaseEndsAt, 4_000 + WORD_MATCH_TIEBREAK_SECONDS * 1000);
  assert.equal(begriffsmatchGame.claimTiebreakTerm(state, 0, "red"), true);
  assert.equal(state.game.tiebreak.revealed[0], false);
  assert.equal(begriffsmatchGame.claimTiebreakTerm(state, 1, "blue"), true);
  assert.equal(begriffsmatchGame.claimTiebreakTerm(state, 3, "red"), true);
  assert.equal(begriffsmatchGame.finishTiebreaker(state), true);
  assert.equal(state.game.status, "tiebreak-reveal");
  assert.equal(begriffsmatchGame.claimTiebreakTerm(state, 4, "blue"), false);
  for (let index = 0; index < WORD_MATCH_TIEBREAK_TERMS.length; index += 1) {
    assert.equal(begriffsmatchGame.revealTiebreakTerm(state, index), true);
  }
  assert.equal(state.game.status, "finished");
  assert.equal(state.game.winningTeam, "red");
  assert.deepEqual(state.game.tiebreak.scores, { blue: 1, red: 2 });
  assert.equal(state.scores.red, 1);
});

test("lets every Begriffsmatch player begin one guessing phase", () => {
  const state = createInitialRoomState("TEST");
  const participants = [
    { id: "b1", name: "Kii", team: "blue" },
    { id: "b2", name: "Luu", team: "blue" },
    { id: "r1", name: "Jo", team: "red" },
    { id: "r2", name: "Ramsi", team: "red" }
  ];
  begriffsmatchGame.start(state, participants);

  const firstGuessers = [];
  for (let roundIndex = 0; roundIndex < 4; roundIndex += 1) {
    const firstTeam = getWordMatchGuessOrder(state.game)[0];
    firstGuessers.push(getWordMatchRoles(state.game).guessers[firstTeam].name);
    if (roundIndex < 3) {
      state.game.status = "round-finished";
      begriffsmatchGame.startNextRound(state);
    }
  }

  assert.deepEqual(firstGuessers, ["Luu", "Jo", "Ramsi", "Kii"]);
});

test("ends Begriffsmatch early when the trailing team cannot catch up", () => {
  const state = createInitialRoomState("TEST");
  const participants = [
    { id: "b1", name: "B1", team: "blue" },
    { id: "b2", name: "B2", team: "blue" },
    { id: "r1", name: "R1", team: "red" },
    { id: "r2", name: "R2", team: "red" }
  ];
  begriffsmatchGame.start(state, participants);

  for (let round = 0; round < 3; round += 1) {
    begriffsmatchGame.startSeedPhase(state, WORD_MATCH_CATEGORIES[round]);
    begriffsmatchGame.finishSeedPhase(state);
    const [firstTeam, secondTeam] = getWordMatchGuessOrder(state.game);
    begriffsmatchGame.startGuessPhase(state, firstTeam);
    if (firstTeam === "blue") {
      for (let index = 0; index < WORD_MATCH_TERM_COUNT; index += 1) {
        begriffsmatchGame.toggleMatch(state, "blue", index);
      }
    }
    begriffsmatchGame.finishGuessPhase(state, firstTeam);
    begriffsmatchGame.startGuessPhase(state, secondTeam);
    if (secondTeam === "blue") {
      for (let index = 0; index < WORD_MATCH_TERM_COUNT; index += 1) {
        begriffsmatchGame.toggleMatch(state, "blue", index);
      }
    }
    begriffsmatchGame.finishGuessPhase(state, secondTeam);
    assert.equal(state.game.status, "results-pending");
    begriffsmatchGame.revealRound(state, {
      blue: Array(WORD_MATCH_TERM_COUNT).fill("Blau"),
      red: Array(WORD_MATCH_TERM_COUNT).fill("Rot")
    });
    if (round < 2) begriffsmatchGame.startNextRound(state);
  }

  assert.equal(state.game.status, "finished");
  assert.equal(state.game.roundIndex, 2);
  assert.equal(state.game.winningTeam, "blue");
  assert.deepEqual(state.game.scores, { blue: 30, red: 0 });
  assert.equal(state.scores.blue, 1);
});

test("contains fifteen estimation questions and keeps the first question hidden until started", () => {
  const state = createInitialRoomState("TEST");
  const participants = [
    { id: "b1", name: "B1", team: "blue" },
    { id: "b2", name: "B2", team: "blue" },
    { id: "r1", name: "R1", team: "red" },
    { id: "r2", name: "R2", team: "red" }
  ];

  assert.equal(ESTIMATION_QUESTIONS.length, 15);
  assert.equal(mittelwertGame.start(state, participants), true);
  assert.equal(state.game.status, "question-pending");
  assert.equal(
    ESTIMATION_QUESTIONS[1].moderatorHint,
    "Vor März 2022 war er noch kürzer; die neue Antenne erhöhte ihn um 6 Meter."
  );
  assert.equal(state.game.questionPrompt, "");
  assert.equal(mittelwertGame.startQuestion(state, ESTIMATION_QUESTIONS[0].prompt), true);
  assert.equal(state.game.status, "guessing");
  assert.equal(state.game.questionPrompt, ESTIMATION_QUESTIONS[0].prompt);
});

test("parses comma decimals and negative estimates", () => {
  assert.equal(parseEstimate("12,5"), 12.5);
  assert.equal(parseEstimate("-4,25"), -4.25);
  assert.equal(parseEstimate("+3"), 3);
  assert.equal(parseEstimate("1.700"), 1700);
  assert.equal(parseEstimate("1,2,3"), null);
  assert.equal(parseEstimate(""), null);
});

test("continues Mittelwert after a tied question without awarding a point", () => {
  const state = createInitialRoomState("TEST");
  const participants = [
    { id: "b1", name: "B1", team: "blue" },
    { id: "b2", name: "B2", team: "blue" },
    { id: "r1", name: "R1", team: "red" },
    { id: "r2", name: "R2", team: "red" }
  ];

  mittelwertGame.start(state, participants);
  mittelwertGame.startQuestion(state, "Testfrage");
  participants.forEach((item) => mittelwertGame.lockPlayer(state, item.id));
  const estimates = { b1: 90, b2: 110, r1: 80, r2: 120 };
  mittelwertGame.prepareRound(state, estimates);
  mittelwertGame.revealRound(state, estimates, 100, "100");

  assert.equal(state.game.revealed.roundWinner, null);
  assert.deepEqual(state.game.roundScores, { blue: 0, red: 0 });
  assert.equal(state.game.status, "revealed");
  assert.equal(mittelwertGame.startNextQuestion(state, "Nächste Frage"), true);
});

test("scores estimation rounds from both team averages and finishes at five points", () => {
  const state = createInitialRoomState("TEST");
  const participants = [
    { id: "b1", name: "B1", team: "blue" },
    { id: "b2", name: "B2", team: "blue" },
    { id: "r1", name: "R1", team: "red" },
    { id: "r2", name: "R2", team: "red" }
  ];
  mittelwertGame.start(state, participants);

  for (let round = 0; round < ESTIMATION_ROUNDS_TO_WIN; round += 1) {
    if (round === 0) mittelwertGame.startQuestion(state, `Frage ${round + 1}`);
    else mittelwertGame.startNextQuestion(state, `Frage ${round + 1}`);
    participants.forEach((item) => mittelwertGame.lockPlayer(state, item.id));
    assert.equal(state.game.status, "ready-to-reveal");
    assert.equal(
      mittelwertGame.prepareRound(state, { b1: 90, b2: 110, r1: 0, r2: 40 }),
      true
    );
    assert.deepEqual(state.game.averages, { blue: 100, red: 20 });
    mittelwertGame.revealRound(state, { b1: 90, b2: 110, r1: 0, r2: 40 }, 100, "100");
    assert.equal(state.game.revealed.averages.blue, 100);
    assert.equal(state.game.revealed.averages.red, 20);
    assert.deepEqual(state.game.revealed.guesses, { b1: 90, b2: 110, r1: 0, r2: 40 });
  }

  assert.equal(state.game.status, "finished");
  assert.equal(state.game.winningTeam, "blue");
  assert.equal(state.game.roundScores.blue, 5);
  assert.equal(state.scores.blue, 1);
});

test("finishes the buzzer game at 40 points with four points per correct answer", () => {
  const state = createInitialRoomState("TEST");
  state.game = {
    id: "buzzer-quiz",
    status: "locked",
    winner: { playerId: "1", playerName: "A", team: "blue" },
    winningTeam: null,
    scores: { blue: BUZZER_WINNING_SCORE - BUZZER_CORRECT_POINTS, red: 2 }
  };

  assert.equal(BUZZER_WINNING_SCORE, 40);
  assert.equal(BUZZER_CORRECT_POINTS, 4);
  assert.equal(BUZZER_WRONG_POINTS, 1);
  assert.equal(buzzerQuizGame.awardPoint(state), true);
  assert.equal(state.game.scores.blue, BUZZER_WINNING_SCORE);
  assert.deepEqual(state.scores, { blue: 1, red: 0 });
  assert.equal(state.game.status, "finished");
  assert.equal(state.game.winningTeam, "blue");
  assert.equal(buzzerQuizGame.awardPoint(state), false);
  assert.deepEqual(state.scores, { blue: 1, red: 0 });
  assert.equal(buzzerQuizGame.reset(state), false);
});

test("keeps buzzer quiz points when the next question starts", () => {
  const state = createInitialRoomState("TEST");
  state.game = {
    id: "buzzer-quiz",
    status: "not-started",
    scores: { blue: 2, red: 1 },
    questionIndex: 0
  };

  assert.equal(state.game.status, "not-started");
  assert.equal(buzzerQuizGame.start(state), true);
  assert.equal(state.game.status, "waiting");
  assert.equal(buzzerQuizGame.open(state), true);
  assert.deepEqual(state.game.scores, { blue: 2, red: 1 });
  assert.equal(buzzerQuizGame.reset(state), true);
  assert.deepEqual(state.game.scores, { blue: 2, red: 1 });
});

test("skips an unanswered buzzer question without awarding points", () => {
  const state = createInitialRoomState("TEST");
  buzzerQuizGame.start(state);
  buzzerQuizGame.open(state);
  buzzerQuizGame.registerBuzz(state, { id: "1", name: "A", team: "blue" });
  const scoresBefore = structuredClone(state.game.scores);

  assert.equal(buzzerQuizGame.advanceQuestion(state), true);
  assert.equal(state.game.questionIndex, 1);
  assert.equal(state.game.status, "waiting");
  assert.equal(state.game.winner, null);
  assert.deepEqual(state.game.scores, scoresBefore);
  assert.deepEqual(state.scores, { blue: 0, red: 0 });
});

test("awards a quiz point to the opposing team after a wrong answer", () => {
  const state = createInitialRoomState("TEST");
  state.game = {
    id: "buzzer-quiz",
    status: "locked",
    winner: { playerId: "1", playerName: "A", team: "blue" },
    winningTeam: null,
    scores: { blue: 2, red: 3 }
  };

  assert.equal(buzzerQuizGame.awardOpponentPoint(state), true);
  assert.deepEqual(state.game.scores, { blue: 2, red: 4 });
  assert.equal(state.game.status, "open");
  assert.equal(state.game.winner, null);
  assert.deepEqual(state.scores, { blue: 0, red: 0 });
});

test("lets the opposing team win the buzzer game from a wrong answer", () => {
  const state = createInitialRoomState("TEST");
  state.game = {
    id: "buzzer-quiz",
    status: "locked",
    winner: { playerId: "1", playerName: "A", team: "blue" },
    winningTeam: null,
    scores: { blue: 2, red: BUZZER_WINNING_SCORE - 1 }
  };

  assert.equal(buzzerQuizGame.awardOpponentPoint(state), true);
  assert.equal(state.game.status, "finished");
  assert.equal(state.game.winningTeam, "red");
  assert.deepEqual(state.scores, { blue: 0, red: 1 });
});

test("reveals prepared Top 20 entries and alternates teams", () => {
  const state = createInitialRoomState("TEST");
  top20Game.start(state, "blue");

  assert.equal(top20Game.reveal(state, 4), true);
  assert.deepEqual(state.game.revealed[3], {
    team: "blue",
    answer: "The Weeknd",
    value: "84,8 Mrd."
  });
  assert.equal(state.game.currentTeam, "red");
  assert.equal(top20Game.reveal(state, 4), false);
});

test("ends a Top 20 round after a team's second miss", () => {
  const state = createInitialRoomState("TEST");
  top20Game.start(state, "blue");
  state.game.currentTeam = "red";
  state.game.strikes.red = TOP_20_MAX_STRIKES - 1;

  assert.equal(top20Game.recordMiss(state), true);
  assert.equal(state.game.strikes.red, TOP_20_MAX_STRIKES);
  assert.equal(state.game.status, "round-finished");
  assert.equal(state.game.roundWinner, "blue");
  assert.deepEqual(state.game.roundWins, { blue: 1, red: 0 });
  assert.deepEqual(state.scores, { blue: 0, red: 0 });
});

test("awards one match point to the first team with two Top 20 round wins", () => {
  const state = createInitialRoomState("TEST");
  top20Game.start(state, "blue");

  state.game.currentTeam = "red";
  state.game.strikes.red = TOP_20_MAX_STRIKES - 1;
  top20Game.recordMiss(state);

  assert.equal(top20Game.startNextRound(state), true);
  assert.equal(state.game.roundIndex, 1);
  assert.equal(state.game.currentTeam, "red");
  assert.equal(state.game.revealed.length, TOP_20_SLOT_COUNT);
  assert.ok(state.game.revealed.every((slot) => slot === null));

  state.game.strikes.red = TOP_20_MAX_STRIKES - 1;
  assert.equal(top20Game.recordMiss(state), true);
  assert.equal(state.game.status, "finished");
  assert.equal(state.game.winningTeam, "blue");
  assert.deepEqual(state.game.roundWins, { blue: 2, red: 0 });
  assert.deepEqual(state.scores, { blue: 1, red: 0 });
  assert.equal(top20Game.recordMiss(state), false);
  assert.deepEqual(state.scores, { blue: 1, red: 0 });
});

test("starts the third list when the first two rounds are split", () => {
  const state = createInitialRoomState("TEST");
  top20Game.start(state, "blue");

  state.game.roundWins = { blue: 1, red: 1 };
  state.game.roundIndex = 1;
  state.game.status = "round-finished";
  state.game.roundWinner = "red";

  assert.equal(top20Game.startNextRound(state), true);
  assert.equal(state.game.roundIndex, 2);
  assert.equal(state.game.listTitle, "Umsatzstärkste deutsche Unternehmen");
  assert.equal(state.game.currentTeam, "blue");
});

test("contains three complete prepared Top 20 lists", () => {
  assert.equal(TOP_20_LISTS.length, 3);
  assert.ok(TOP_20_LISTS.every((list) => list.entries.length === TOP_20_SLOT_COUNT));
  assert.deepEqual(TOP_20_LISTS[0].entries.map((entry) => entry.answer), [
    "Taylor Swift", "Drake", "Bad Bunny", "The Weeknd", "Ariana Grande",
    "Ed Sheeran", "Billie Eilish", "Eminem", "Kanye West", "BTS",
    "Justin Bieber", "Bruno Mars", "Post Malone", "Rihanna", "Coldplay",
    "Travis Scott", "Kendrick Lamar", "Dua Lipa", "J Balvin", "Imagine Dragons"
  ]);
});

test("normalizes a persisted single-round Top 20 state", () => {
  const state = createInitialRoomState("TEST");
  state.game = {
    id: top20Game.id,
    status: "playing",
    currentTeam: "red",
    slots: [{ artist: "Taylor Swift", team: "blue" }],
    strikes: { blue: 1, red: 0 },
    winningTeam: null
  };

  assert.equal(top20Game.normalize(state), true);
  assert.deepEqual(state.game.revealed[0], {
    team: "blue",
    answer: "Taylor Swift",
    value: ""
  });
  assert.equal(state.game.revealed.length, TOP_20_SLOT_COUNT);
  assert.deepEqual(state.game.roundWins, { blue: 0, red: 0 });
  assert.equal("slots" in state.game, false);
});

test("contains seven prepared Europe map questions", () => {
  assert.equal(KARTENWISSEN_QUESTIONS.length, 7);
  assert.ok(KARTENWISSEN_QUESTIONS.every((question) =>
    question.prompt && question.answer && Number.isFinite(question.target.lat) && Number.isFinite(question.target.lng)
  ));
});

test("uses the seven requested European destinations", () => {
  const answers = KARTENWISSEN_QUESTIONS.map((question) => question.answer);
  assert.deepEqual(answers, [
    "Sagrada Família · Barcelona, Spanien",
    "Kolosseum · Rom, Italien",
    "Warschau · Polen",
    "Altstadt von Dubrovnik · Kroatien",
    "Hagia Sophia · Istanbul, Türkei",
    "Stonehenge · nahe Amesbury/Salisbury, England",
    "Atomium · Brüssel, Belgien"
  ]);
  assert.deepEqual(KARTENWISSEN_QUESTIONS.map((question) => question.location), [
    "Barcelona, Spanien",
    "Rom, Italien",
    "Warschau, Polen",
    "Dubrovnik, Kroatien",
    "Istanbul, Türkei",
    "Amesbury/Salisbury, England",
    "Brüssel, Belgien"
  ]);
  assert.equal(
    KARTENWISSEN_QUESTIONS[4].prompt,
    "Wo steht die Hagia Sophia, eine der historisch bedeutendsten Moscheen der Welt?"
  );
});

test("ships detailed European country geometry", () => {
  const mapPath = new URL("../assets/maps/europe-countries-50m.geojson", import.meta.url);
  const mapData = JSON.parse(readFileSync(mapPath, "utf8"));
  assert.ok(mapData.features.length >= 40);
  assert.ok(mapData.features.every((feature) =>
    ["Polygon", "MultiPolygon"].includes(feature.geometry?.type)
  ));
  assert.ok(mapData.features.some((feature) => feature.properties?.name === "Türkei"));
  assert.deepEqual(KARTENWISSEN_QUESTIONS[4].target, { lat: 41.0086, lng: 28.9802 });
});

test("keeps map distance lines visually constant while zooming", () => {
  const styles = readFileSync(new URL("../css/styles.css", import.meta.url), "utf8");
  const mapScript = readFileSync(new URL("../js/europe-map-view.js", import.meta.url), "utf8");
  const distanceLineRule = styles.match(/\.distance-line\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(distanceLineRule, /vector-effect:\s*non-scaling-stroke/);
  assert.match(mapScript, /const MAX_ZOOM = 10;/);
  assert.doesNotMatch(styles, /\.europe-map-svg\.zoomable\.zoomed\s*\{[^}]*cursor:\s*grab;/s);
  assert.match(styles, /\.europe-map-svg\.zoomable\.dragging\s*\{[^}]*cursor:\s*grabbing;/s);
});

test("keeps the moderator map and its zoom controls inside the styled map frame", () => {
  const hostMarkup = readFileSync(new URL("../host.html", import.meta.url), "utf8");
  assert.match(
    hostMarkup,
    /id="host-kartenwissen-map"\s+class="europe-map"/
  );
  assert.doesNotMatch(hostMarkup, /id="target-legend"/);
});

test("supports skipping games and four independent player tabs for testing", () => {
  const hostMarkup = readFileSync(new URL("../host.html", import.meta.url), "utf8");
  const playerScript = readFileSync(new URL("../js/player.js", import.meta.url), "utf8");
  const hostScript = readFileSync(new URL("../js/host.js", import.meta.url), "utf8");
  assert.match(hostMarkup, /id="skip-current-game"[^>]*>Spiel überspringen</);
  assert.match(playerScript, /sessionStorage\.getItem\(PLAYER_ID_KEY\)/);
  assert.match(playerScript, /sessionStorage\.setItem\(PLAYER_ID_KEY, id\)/);
  assert.doesNotMatch(playerScript, /localStorage\.setItem\(PLAYER_ID_KEY, id\)/);
  assert.match(hostScript, /GAME_SEQUENCE\.indexOf\(state\.game\.id\)/);
});

test("keeps wide moderator games inside the middle chat column", () => {
  const styles = readFileSync(new URL("../css/styles.css", import.meta.url), "utf8");
  const hostMarkup = readFileSync(new URL("../host.html", import.meta.url), "utf8");
  const chatColumnRule = styles.match(
    /\.host-layout\.chat-active\s*>\s*\.shell\.wide-game\s*\{([^}]*)\}/
  )?.[1] || "";
  assert.match(chatColumnRule, /width:\s*100%/);
  assert.match(chatColumnRule, /min-width:\s*0/);
  assert.doesNotMatch(hostMarkup, /host-panel-scale-90/);
});

test("scales only the two large player game views down by another ten percent", () => {
  const styles = readFileSync(new URL("../css/styles.css", import.meta.url), "utf8");
  const playerMarkup = readFileSync(new URL("../player.html", import.meta.url), "utf8");
  assert.match(playerMarkup, /id="player-map-game"\s+class="player-panel-scale-90 hidden"/);
  assert.match(playerMarkup, /id="player-matching-game"\s+class="player-panel-scale-90 hidden"/);
  assert.match(styles, /\.player-panel-scale-90\s*\{[^}]*width:\s*100%;[^}]*zoom:\s*\.9;/s);
});

test("adds vertical space around landscape Thrifty product images", () => {
  const styles = readFileSync(new URL("../css/styles.css", import.meta.url), "utf8");
  const playerScript = readFileSync(new URL("../js/player.js", import.meta.url), "utf8");
  assert.match(styles, /\.player-price-layout\s+\.price-product-image\.landscape\s*\{[^}]*aspect-ratio:\s*1\s*\/\s*1;/s);
  assert.match(styles, /\.player-price-layout\s+\.price-team-form\s*\{[^}]*contain:\s*size;/s);
  assert.match(playerScript, /player-price-product-image[\s\S]*?naturalWidth\s*>\s*image\.naturalHeight/);
});

test("keeps fixed effects outside the interface zoom", () => {
  const styles = readFileSync(new URL("../css/styles.css", import.meta.url), "utf8");
  const effectRule = styles.match(
    /\.ranking-moving-token,[\s\S]*?\.score-overview-overlay\s*\{([^}]*)\}/
  )?.[1] || "";
  assert.match(styles, /--ui-scale:\s*\.9/);
  assert.match(effectRule, /zoom:\s*var\(--ui-scale-inverse\)/);
});

test("calculates geographic distances in kilometers", () => {
  const berlin = { lat: 52.5200, lng: 13.4050 };
  const hamburg = { lat: 53.5511, lng: 9.9937 };
  const distance = distanceInKilometers(berlin, hamburg);

  assert.ok(distance > 250 && distance < 260);
});

test("shares one map pin per team and awards the closer team", () => {
  const state = createInitialRoomState("TEST");
  kartenwissenGame.start(state);
  assert.equal(state.game.status, "round-pending");
  assert.equal(kartenwissenGame.startFirstRound(state), true);
  const target = KARTENWISSEN_QUESTIONS[0].target;

  assert.equal(kartenwissenGame.placePin(state, "blue", { lat: 53.5, lng: 10 }), true);
  assert.equal(kartenwissenGame.placePin(state, "blue", target), true);
  assert.deepEqual(state.game.pins.blue, target);
  assert.equal(kartenwissenGame.placePin(state, "red", { lat: 52.52, lng: 13.405 }), true);
  assert.equal(kartenwissenGame.lockTeam(state, "blue"), true);
  assert.equal(kartenwissenGame.lockTeam(state, "red"), true);
  assert.equal(kartenwissenGame.revealRound(state), true);
  assert.equal(state.game.roundWinner, "blue");
  assert.deepEqual(state.game.roundScores, { blue: 1, red: 0 });
  assert.equal(state.game.distances.blue, 0);
});

test("finishes the best of seven map game at four points", () => {
  const state = createInitialRoomState("TEST");
  kartenwissenGame.start(state);
  kartenwissenGame.startFirstRound(state);
  state.game.roundScores.blue = KARTENWISSEN_ROUNDS_TO_WIN - 1;
  const target = KARTENWISSEN_QUESTIONS[0].target;

  kartenwissenGame.placePin(state, "blue", target);
  kartenwissenGame.placePin(state, "red", { lat: 53.5, lng: 10 });
  kartenwissenGame.lockTeam(state, "blue");
  kartenwissenGame.lockTeam(state, "red");
  kartenwissenGame.revealRound(state);

  assert.equal(state.game.status, "revealed");
  assert.equal(kartenwissenGame.startNextRound(state), true);
  assert.equal(state.game.status, "finished");
  assert.equal(state.game.winningTeam, "blue");
  assert.deepEqual(state.scores, { blue: 1, red: 0 });
  assert.equal(kartenwissenGame.startNextRound(state), false);
  assert.deepEqual(state.scores, { blue: 1, red: 0 });
});

test("contains four complete matching rounds", () => {
  assert.equal(MATCHING_GAME_ROUNDS.length, 4);
  assert.ok(MATCHING_GAME_ROUNDS.every((round) => round.images.length === 4));
  assert.ok(MATCHING_GAME_ROUNDS.flatMap((round) => round.images)
    .every((image) => image.label && image.src.endsWith(".webp")));
  assert.ok(MATCHING_GAME_ROUNDS.flatMap((round) => round.images).every((image) =>
    existsSync(new URL(`../${image.src.replace("./", "")}`, import.meta.url))
  ));
});

test("collects both first players before the blue and red matching turns", () => {
  const state = createInitialRoomState("TEST");
  const players = [
    { id: "b1", name: "Max", team: "blue" },
    { id: "r1", name: "Lisa", team: "red" },
    { id: "b2", name: "Tom", team: "blue" },
    { id: "r2", name: "Mia", team: "red" }
  ];
  assert.equal(daSehIchDichGame.start(state, players), true);
  assert.equal(state.game.status, "round-pending");
  assert.equal(daSehIchDichGame.submitTeam(state, "blue"), false);
  assert.equal(daSehIchDichGame.startFirstRound(state), true);
  assert.equal("assignments" in state.game, false);
  assert.equal(MATCHING_TURNS.length, 3);
  assert.equal(daSehIchDichGame.submitTeam(state, "blue"), true);
  assert.equal(daSehIchDichGame.completeTurn(state), false);
  assert.equal(daSehIchDichGame.submitTeam(state, "red"), true);
  assert.equal(daSehIchDichGame.completeTurn(state), true);
  assert.equal(state.game.activeTurnIndex, 1);
  assert.equal(state.game.turnSubmitted, false);

  assert.equal(daSehIchDichGame.submitTeam(state, "red"), false);
  assert.equal(daSehIchDichGame.submitTeam(state, "blue"), true);
  assert.equal(daSehIchDichGame.completeTurn(state), true);
  assert.equal(state.game.activeTurnIndex, 2);
  assert.equal(daSehIchDichGame.submitTeam(state, "blue"), false);
  assert.equal(daSehIchDichGame.submitTeam(state, "red"), true);
  assert.equal(daSehIchDichGame.completeTurn(state), true);
  assert.equal(state.game.status, "ready-to-reveal");
  assert.equal("assignments" in state.game, false);
});

test("contains six complete Golden Image tiebreak pictures", () => {
  assert.equal(MATCHING_TIEBREAK_IMAGES.length, 6);
  assert.ok(MATCHING_TIEBREAK_IMAGES.every((image) =>
    image.id && image.label && image.src.endsWith(".webp") &&
    existsSync(new URL(`../${image.src.replace("./", "")}`, import.meta.url))
  ));
});

test("contains all prepared buzzer questions", () => {
  assert.equal(BUZZER_QUESTIONS.length, 34);
  assert.ok(BUZZER_QUESTIONS.every((entry) => entry.question && entry.answer));
  assert.equal(BUZZER_QUESTIONS[0].answer, "Seismograph");
  assert.equal(BUZZER_QUESTIONS.at(-1).answer, "Stäbchen");
  assert.equal(BUZZER_QUESTIONS.some((entry) => entry.answer.includes("Burj Khalifa")), false);
});

test("reveals and scores both teams on the same four images", () => {
  const state = createInitialRoomState("TEST");
  const players = MATCHING_ASSIGNERS.map((assigner, index) => ({
    id: String(index), name: `Spieler ${index + 1}`, team: assigner.team
  }));
  const blueAssignments = [["Max", "Max"], ["Tom", "Lisa"], ["Lisa", "Tom"], ["Mia", "Mia"]];
  const redAssignments = [["Max", "Max"], ["Tom", "Lisa"], ["Lisa", "Tom"], ["Mia", "Mia"]];
  daSehIchDichGame.start(state, players);
  state.game.status = "ready-to-reveal";

  assert.equal(daSehIchDichGame.revealAll(state, { blue: blueAssignments }), false);
  assert.equal(daSehIchDichGame.revealAll(state, { blue: blueAssignments, red: redAssignments }), true);
  assert.equal(state.game.status, "round-finished");
  assert.deepEqual(state.game.revealedTeams, { blue: true, red: true });
  assert.deepEqual(state.game.scores, { blue: 2, red: 2 });
});

test("ends matching early when the trailing team cannot catch up", () => {
  const state = createInitialRoomState("TEST");
  const players = MATCHING_ASSIGNERS.map((assigner, index) => ({
    id: String(index),
    name: `Spieler ${index + 1}`,
    team: assigner.team
  }));
  daSehIchDichGame.start(state, players);
  daSehIchDichGame.startFirstRound(state);

  const perfect = [["Max", "Max"], ["Tom", "Tom"], ["Lisa", "Lisa"], ["Mia", "Mia"]];
  const noMatches = [["Max", "Tom"], ["Tom", "Lisa"], ["Lisa", "Mia"], ["Mia", "Max"]];

  for (let roundIndex = 0; roundIndex < MATCHING_GAME_ROUNDS.length; roundIndex += 1) {
    daSehIchDichGame.submitTeam(state, "blue");
    daSehIchDichGame.submitTeam(state, "red");
    daSehIchDichGame.completeTurn(state);
    daSehIchDichGame.submitTeam(state, "blue");
    daSehIchDichGame.completeTurn(state);
    daSehIchDichGame.submitTeam(state, "red");
    daSehIchDichGame.completeTurn(state);
    daSehIchDichGame.revealAll(state, { blue: perfect, red: noMatches });
    if (state.game.status === "finished") break;
    daSehIchDichGame.startNextRound(state);
  }

  assert.equal(state.game.status, "finished");
  assert.equal(state.game.winningTeam, "blue");
  assert.equal(state.game.roundIndex, 2);
  assert.deepEqual(state.game.scores, { blue: 12, red: 0 });
  assert.deepEqual(state.scores, { blue: 1, red: 0 });
  assert.equal(daSehIchDichGame.revealAll(state, { blue: perfect, red: perfect }), false);
});

test("keeps round four results until Golden Image is started and uses both second players", () => {
  const state = createInitialRoomState("TEST");
  const players = MATCHING_ASSIGNERS.map((assigner, index) => ({
    id: String(index),
    name: `Spieler ${index + 1}`,
    team: assigner.team
  }));
  daSehIchDichGame.start(state, players);
  state.game.roundIndex = MATCHING_GAME_ROUNDS.length - 1;
  state.game.status = "ready-to-reveal";
  state.game.scores = { blue: 4, red: 4 };
  const equalAssignments = [["Max", "Max"], ["Tom", "Tom"], ["Lisa", "Lisa"], ["Mia", "Mia"]];

  assert.equal(daSehIchDichGame.revealAll(state, {
    blue: equalAssignments,
    red: equalAssignments
  }), true);
  assert.equal(state.game.status, "round-finished");
  assert.equal(state.game.tiebreak, null);
  assert.deepEqual(state.game.revealedAssignments.blue, equalAssignments);
  assert.deepEqual(state.game.revealedAssignments.red, equalAssignments);
  assert.deepEqual(state.game.roundResults[3], { blue: 4, red: 4 });
  daSehIchDichGame.normalize(state);
  assert.deepEqual(state.game.revealedAssignments.blue, equalAssignments);
  assert.equal(daSehIchDichGame.startNextRound(state), true);
  assert.equal(state.game.tiebreak.imageIndex, 0);
  assert.equal(state.game.status, "tiebreak-assigning");
  assert.deepEqual(state.game.revealedAssignments, { blue: null, red: null });
  assert.equal(daSehIchDichGame.startNextRound(state), false);
  assert.deepEqual(state.scores, { blue: 0, red: 0 });

  assert.deepEqual(getMatchingTurn(getMatchingRoleRoundIndex(state.game), 0, true).assignerIndexes, [0, 1]);
  assert.equal(daSehIchDichGame.submitTeam(state, "red"), true);
  assert.equal(daSehIchDichGame.completeTurn(state), false);
  assert.equal(daSehIchDichGame.submitTeam(state, "blue"), true);
  assert.equal(daSehIchDichGame.completeTurn(state), true);
  assert.deepEqual(state.game.submittedTeams, { blue: false, red: false });
  assert.deepEqual(getMatchingTurn(getMatchingRoleRoundIndex(state.game), 1, true).assignerIndexes, [2, 3]);
  assert.equal(daSehIchDichGame.submitTeam(state, "blue"), true);
  assert.equal(daSehIchDichGame.completeTurn(state), false);
  assert.equal(daSehIchDichGame.submitTeam(state, "red"), true);
  assert.equal(daSehIchDichGame.completeTurn(state), true);
  assert.equal(state.game.status, "tiebreak-ready-to-reveal");
  assert.equal(daSehIchDichGame.revealTiebreak(state, {
    blue: ["Max", "Max"],
    red: ["Lisa", "Lisa"]
  }), true);
  assert.equal(state.game.status, "tiebreak-round-finished");
  assert.equal(daSehIchDichGame.startNextTiebreakRound(state), true);
  assert.equal(state.game.tiebreak.imageIndex, 1);
  assert.deepEqual(getMatchingTurn(getMatchingRoleRoundIndex(state.game), 0, true).assignerIndexes, [2, 3]);

  daSehIchDichGame.startTiebreakRound(state);
  daSehIchDichGame.submitTeam(state, "blue");
  daSehIchDichGame.submitTeam(state, "red");
  daSehIchDichGame.completeTurn(state);
  assert.deepEqual(getMatchingTurn(getMatchingRoleRoundIndex(state.game), 1, true).assignerIndexes, [0, 1]);
  daSehIchDichGame.submitTeam(state, "blue");
  daSehIchDichGame.submitTeam(state, "red");
  daSehIchDichGame.completeTurn(state);
  assert.equal(daSehIchDichGame.revealTiebreak(state, {
    blue: ["Max", "Max"],
    red: ["Lisa", "Mia"]
  }), true);
  assert.equal(state.game.status, "finished");
  assert.equal(state.game.winningTeam, "blue");
  assert.deepEqual(state.scores, { blue: 1, red: 0 });
});

test("encrypts player assignments so only the moderator key can read them", async () => {
  const keyPair = await createMatchingKeyPair();
  const publicKey = await exportMatchingPublicKey(keyPair.publicKey);
  const payload = {
    playerId: "blue-1",
    roundIndex: 0,
    turnIndex: 0,
    values: ["Max", "Lisa", "Tom", "Mia"]
  };
  const encrypted = await encryptMatchingSubmission(publicKey, payload);

  assert.equal(JSON.stringify(encrypted).includes("Max"), false);
  assert.deepEqual(await decryptMatchingSubmission(keyPair.privateKey, encrypted), payload);
});

test("alternates assigning and matching players between rounds", () => {
  assert.equal(getMatchingTurn(0, 0).playerIndex, 0);
  assert.equal(getMatchingTurn(0, 1).playerIndex, 1);
  assert.equal(getMatchingTurn(0, 0).team, null);
  assert.deepEqual(getMatchingTurn(0, 0).assignerIndexes, [0, 1]);
  assert.equal(getMatchingTurn(0, 1).team, "blue");
  assert.equal(getMatchingTurn(0, 1).assignerIndex, 2);
  assert.equal(getMatchingTurn(0, 2).team, "red");
  assert.equal(getMatchingTurn(0, 2).assignerIndex, 3);
  assert.deepEqual(getMatchingTurn(1, 0).assignerIndexes, [2, 3]);
  assert.equal(getMatchingTurn(1, 1).assignerIndex, 0);
  assert.equal(getMatchingTurn(1, 2).assignerIndex, 1);
  assert.deepEqual(getMatchingTurn(3, 0).assignerIndexes, [2, 3]);
});

test("requires every player name to be unique within one assignment", () => {
  assert.equal(areMatchingValuesUnique(["Max", "Lisa", "Tom", "Mia"]), true);
  assert.equal(areMatchingValuesUnique(["Max", "Lisa", "Max", "Mia"]), false);
});

test("contains seven complete price products without public prices", () => {
  assert.equal(PRICE_PRODUCTS.length, 7);
  assert.ok(PRICE_PRODUCTS.every((product) => product.id && product.name &&
    product.src.endsWith(".webp") && !("price" in product)));
  assert.ok(PRICE_PRODUCTS.every((product) =>
    existsSync(new URL(`../${product.src.replace("./", "")}`, import.meta.url))
  ));
  assert.deepEqual(PRICE_PRODUCTS.map((product) => product.id), [
    "heated-gloves",
    "bmw-m2",
    "phone-tripod",
    "thriller-vinyl",
    "oxford-master",
    "oono",
    "zwilling-knife-block"
  ]);
});

test("parses German and common Euro inputs", () => {
  assert.equal(parseEuroAmount("12,99€"), 12.99);
  assert.equal(parseEuroAmount("12.99"), 12.99);
  assert.equal(parseEuroAmount("2.269,00 €"), 2269);
  assert.equal(parseEuroAmount("4.746"), 4746);
  assert.equal(parseEuroAmount("-2,00"), null);
  assert.equal(parseEuroAmount("abc"), null);
  assert.equal(formatEuroAmount(2269), "2.269,00 €");
  assert.equal(formatSignedEuroDifference(548, 34), "−514,00 €");
  assert.equal(formatSignedEuroDifference(548, 803), "+255,00 €");
});

test("locks both teams and awards the closer price guess", () => {
  const state = createInitialRoomState("TEST");
  thriftyGame.start(state);

  assert.equal(state.game.status, "product-pending");
  assert.equal(thriftyGame.lockTeam(state, "blue"), false);
  assert.equal(thriftyGame.startFirstRound(state), true);
  assert.equal(thriftyGame.lockTeam(state, "blue"), true);
  assert.equal(state.game.status, "guessing");
  assert.equal(thriftyGame.lockTeam(state, "red"), true);
  assert.equal(state.game.status, "ready-to-reveal");
  assert.equal(thriftyGame.revealRound(state, { blue: null, red: 40 }), false);
  assert.equal(thriftyGame.revealRound(state, { blue: 80, red: 40 }), true);
  assert.equal(state.game.revealed.actualPrice, 79.99);
  assert.equal(state.game.revealed.roundWinner, "blue");
  assert.deepEqual(state.game.roundScores, { blue: 1, red: 0 });
  assert.equal(state.game.status, "revealed");
});

test("finishes the best of seven price game at four wins", () => {
  const state = createInitialRoomState("TEST");
  thriftyGame.start(state);
  thriftyGame.startFirstRound(state);

  for (let round = 0; round < PRICE_GAME_WINNING_SCORE; round += 1) {
    thriftyGame.lockTeam(state, "blue");
    thriftyGame.lockTeam(state, "red");
    thriftyGame.revealRound(state, { blue: 0, red: 10_000_000 });
    if (round < PRICE_GAME_WINNING_SCORE - 1) thriftyGame.startNextRound(state);
  }

  assert.equal(state.game.status, "finished");
  assert.equal(state.game.winningTeam, "blue");
  assert.deepEqual(state.game.roundScores, { blue: 4, red: 0 });
  assert.deepEqual(state.scores, { blue: 1, red: 0 });
  assert.equal(thriftyGame.startNextRound(state), false);
});

test("uses the requested product order with matching prices", () => {
  const state = createInitialRoomState("TEST");
  const expectedPrices = [79.99, 82_220, 11.54, 25.95, 51_800, 49.95, 149.90];
  thriftyGame.start(state);
  thriftyGame.startFirstRound(state);

  expectedPrices.forEach((expectedPrice, index) => {
    thriftyGame.lockTeam(state, "blue");
    thriftyGame.lockTeam(state, "red");
    thriftyGame.revealRound(state, { blue: 0, red: 0 });
    assert.equal(state.game.revealed.actualPrice, expectedPrice);
    if (index < expectedPrices.length - 1) thriftyGame.startNextRound(state);
  });

  assert.equal(state.game.status, "finished");
  assert.equal(state.game.winningTeam, null);
});

test("encrypts private team drafts for one recipient", async () => {
  const keyPair = await createEncryptionKeyPair();
  const otherKeyPair = await createEncryptionKeyPair();
  const publicKey = await exportEncryptionPublicKey(keyPair.publicKey);
  const payload = {
    roundIndex: 2,
    amount: "59,99",
    comments: {
      "blue-1": "Ich tippe knapp 60 Euro",
      "blue-2": "Könnte etwas günstiger sein"
    }
  };
  const encrypted = await encryptPrivatePayload(publicKey, payload);

  assert.equal(JSON.stringify(encrypted).includes("60 Euro"), false);
  assert.deepEqual(await decryptPrivatePayload(keyPair.privateKey, encrypted), payload);
  await assert.rejects(() => decryptPrivatePayload(otherKeyPair.privateKey, encrypted));
});

test("encrypts a Top 20 team note without exposing its text", async () => {
  const keyPair = await createEncryptionKeyPair();
  const publicKey = await exportEncryptionPublicKey(keyPair.publicKey);
  const payload = { playerId: "blue-1", roundIndex: 1, text: "Vielleicht ist Adele dabei" };
  const encrypted = await encryptPrivatePayload(publicKey, payload);

  assert.equal(JSON.stringify(encrypted).includes("Adele"), false);
  assert.deepEqual(await decryptPrivatePayload(keyPair.privateKey, encrypted), payload);
});

test("encrypts separate Kartenwissen notes for both teammates", async () => {
  const keyPair = await createEncryptionKeyPair();
  const publicKey = await exportEncryptionPublicKey(keyPair.publicKey);
  const payload = {
    roundIndex: 4,
    notes: {
      "red-1": "Ich würde den Pin weiter nach Westen setzen",
      "red-2": "Für mich liegt es eher im Süden"
    }
  };
  const encrypted = await encryptPrivatePayload(publicKey, payload);

  assert.equal(JSON.stringify(encrypted).includes("Westen"), false);
  assert.equal(JSON.stringify(encrypted).includes("Süden"), false);
  assert.deepEqual(await decryptPrivatePayload(keyPair.privateKey, encrypted), payload);
});

test("encrypts an individual estimation without exposing it to teammates", async () => {
  const keyPair = await createEncryptionKeyPair();
  const otherKeyPair = await createEncryptionKeyPair();
  const publicKey = await exportEncryptionPublicKey(keyPair.publicKey);
  const payload = {
    type: "lock",
    playerId: "blue-1",
    roundIndex: 3,
    value: "-12,75"
  };
  const encrypted = await encryptPrivatePayload(publicKey, payload);

  assert.equal(JSON.stringify(encrypted).includes("-12,75"), false);
  assert.deepEqual(await decryptPrivatePayload(keyPair.privateKey, encrypted), payload);
  await assert.rejects(() => decryptPrivatePayload(otherKeyPair.privateKey, encrypted));
});

test("encrypts a Begriffsmatch list so the guessing partner cannot read it", async () => {
  const keyPair = await createEncryptionKeyPair();
  const otherKeyPair = await createEncryptionKeyPair();
  const publicKey = await exportEncryptionPublicKey(keyPair.publicKey);
  const payload = {
    type: "lock",
    playerId: "red-1",
    roundIndex: 0,
    terms: ["Märchen", "Legende", ...Array(8).fill("")]
  };
  const encrypted = await encryptPrivatePayload(publicKey, payload);

  assert.equal(JSON.stringify(encrypted).includes("Märchen"), false);
  assert.deepEqual(await decryptPrivatePayload(keyPair.privateKey, encrypted), payload);
  await assert.rejects(() => decryptPrivatePayload(otherKeyPair.privateKey, encrypted));
});
