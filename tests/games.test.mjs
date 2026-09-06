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
  buzzerGame
} from "../js/games/buzzer.js";
import { BUZZER_QUESTIONS } from "../js/games/buzzer-questions.js";
import { TOP_20_MAX_STRIKES, top20Game } from "../js/games/spotify-top-artists.js";
import { TOP_20_LISTS, TOP_20_SLOT_COUNT } from "../js/games/top-20-lists.js";
import {
  RANKING_MAX_STRIKES,
  RANKING_ROUNDS_TO_WIN,
  rankingGame
} from "../js/games/ranking-game.js";
import { RANKING_LISTS } from "../js/games/ranking-lists.js";
import {
  GERMANY_MAP_QUESTIONS,
  GERMANY_MAP_ROUNDS_TO_WIN,
  distanceInKilometers,
  germanyMapGame
} from "../js/games/germany-map.js";
import {
  MATCHING_ASSIGNERS,
  MATCHING_GAME_ROUNDS,
  MATCHING_TIEBREAK_IMAGES,
  MATCHING_TURNS,
  areMatchingValuesUnique,
  getMatchingRoleRoundIndex,
  getMatchingTurn,
  matchingGame
} from "../js/games/matching-game.js";
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
  guessThePriceGame,
  parseEuroAmount
} from "../js/games/guess-the-price.js";
import { PRICE_PRODUCTS } from "../js/games/guess-the-price-products.js";
import {
  ESTIMATION_ROUNDS_TO_WIN,
  estimationGame,
  parseEstimate
} from "../js/games/estimation-game.js";
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
  wordMatchGame
} from "../js/games/word-match-game.js";
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
  const chat = createTeamChat("guess-the-price");
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
  const chat = createTeamChat("spotify-top-artists");
  const player = { id: "b1", name: "Blau 1" };
  for (let index = 0; index < 150; index += 1) {
    addTeamChatMessage(chat, "blue", player, `Nachricht ${index + 1}`, `m${index + 1}`, index);
  }
  assert.equal(chat.blue.messages.length, 150);
  assert.equal(chat.blue.messages[0].text, "Nachricht 1");
});

test("enables the private session chat for Einordnen", () => {
  assert.equal(supportsTeamChat("ranking-game"), true);
});

test("contains presentation cards for all seven games", () => {
  assert.deepEqual([
    "estimation-game",
    "guess-the-price",
    "germany-map",
    "word-match-game",
    "ranking-game",
    "matching-game",
    "buzzer"
  ].map((gameId) => getGamePresentation(gameId).number), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(getGamePresentation("guess-the-price").name, "Thrifty");
  assert.equal(getGamePresentation("germany-map").name, "Kartenwissen");
  assert.equal(getGamePresentation("matching-game").name, "Da seh ich dich");
  assert.equal(getGamePresentation("estimation-game").name, "Mittelwert");
  assert.equal(getGamePresentation("word-match-game").name, "Begriffsmatch");
  assert.equal(getGamePresentation("ranking-game").name, "Einordnen");
  assert.equal(getGamePresentation("spotify-top-artists").name, "Top 20");
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
  rankingGame.start(state, "blue");

  assert.equal(state.game.status, "not-started");
  assert.equal(rankingGame.startFirstRound(state), true);
  assert.deepEqual(state.game.placedIds, ["iso"]);
  assert.equal(rankingGame.proposePlacement(state, "sova", 1), true);
  assert.equal(rankingGame.revealPlacement(state), true);
  assert.equal(state.game.lastResult.correct, true);
  assert.deepEqual(state.game.placedIds, ["sova", "iso"]);
  assert.equal(state.game.currentTeam, "red");

  assert.equal(rankingGame.proposePlacement(state, "harbor", 1), true);
  assert.equal(rankingGame.revealPlacement(state), true);
  assert.equal(state.game.lastResult.correct, false);
  assert.equal(state.game.strikes.red, 1);
  assert.equal(state.game.remainingIds.includes("harbor"), true);
  assert.equal(state.game.currentTeam, "blue");
});

test("Einordnen lets the moderator move a pending placement before revealing it", () => {
  const state = createInitialRoomState("TEST");
  rankingGame.start(state, "blue");
  rankingGame.startFirstRound(state);

  assert.equal(rankingGame.proposePlacement(state, "sova", 1), true);
  assert.equal(state.game.status, "ready-to-reveal");
  assert.equal(state.game.proposal.position, 1);
  assert.equal(rankingGame.updateProposalPosition(state, 2), true);
  assert.equal(state.game.proposal.position, 2);
  assert.equal(rankingGame.updateProposalPosition(state, 3), false);

  assert.equal(rankingGame.revealPlacement(state), true);
  assert.equal(rankingGame.updateProposalPosition(state, 1), false);
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

test("maps every game to the score shown to the moderator", () => {
  const cases = [
    ["buzzer", "scores"],
    ["spotify-top-artists", "roundWins"],
    ["ranking-game", "roundWins"],
    ["germany-map", "roundScores"],
    ["matching-game", "scores"],
    ["guess-the-price", "roundScores"],
    ["estimation-game", "roundScores"],
    ["word-match-game", "scores"]
  ];

  for (const [id, key] of cases) {
    const game = { id, [key]: { blue: 2, red: 3 } };
    assert.deepEqual(getModeratorGameScore(game).scores, { blue: 2, red: 3 });
  }

  const tiebreak = {
    id: "word-match-game",
    scores: { blue: 8, red: 8 },
    tiebreak: { scores: { blue: 1, red: 2 } }
  };
  assert.deepEqual(getModeratorGameScore(tiebreak).scores, { blue: 1, red: 2 });
});

test("Einordnen ends a list on the second error and alternates its starting team", () => {
  const state = createInitialRoomState("TEST");
  rankingGame.start(state, "blue");
  rankingGame.startFirstRound(state);
  assert.equal(RANKING_MAX_STRIKES, 2);
  assert.equal(RANKING_ROUNDS_TO_WIN, 2);

  rankingGame.proposePlacement(state, "jett", 2);
  rankingGame.revealPlacement(state);
  rankingGame.proposePlacement(state, "harbor", 2);
  rankingGame.revealPlacement(state);
  rankingGame.proposePlacement(state, "reyna", 2);
  rankingGame.revealPlacement(state);

  assert.equal(state.game.status, "round-finished");
  assert.equal(state.game.roundWinner, "red");
  assert.equal(state.game.roundWins.red, 1);
  const nextRemainingId = RANKING_LISTS[0].entries.find((entry) =>
    state.game.remainingIds.includes(entry.id)
  ).id;
  assert.equal(rankingGame.revealNextRemaining(state), true);
  assert.equal(state.game.remainingIds.includes(nextRemainingId), false);
  assert.equal(state.game.lastResult.itemId, nextRemainingId);
  assert.equal(state.game.lastResult.cleanupReveal, true);
  assert.equal(rankingGame.startNextRound(state), true);
  assert.equal(state.game.currentTeam, "red");
  assert.deepEqual(state.game.placedIds, ["banana"]);
});

test("starts a new show with Mittelwert waiting for the moderator", () => {
  const state = createInitialRoomState("TEST");
  assert.equal(state.game.id, "estimation-game");
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
  wordMatchGame.start(state, participants);
  let roles = getWordMatchRoles(state.game);
  assert.equal(roles.seeders.blue.id, "b1");
  assert.equal(roles.guessers.blue.id, "b2");
  assert.equal(wordMatchGame.startSeedPhase(state, WORD_MATCH_CATEGORIES[0], 1_000), true);
  assert.equal(state.game.phaseEndsAt, 1_000 + WORD_MATCH_SEED_SECONDS * 1000);
  wordMatchGame.lockSeeder(state, "b1");
  wordMatchGame.lockSeeder(state, "r1");
  assert.equal(state.game.status, "blue-guess-pending");
  wordMatchGame.startGuessPhase(state, "blue", 2_000);
  assert.equal(state.game.phaseEndsAt, 2_000 + WORD_MATCH_PHASE_SECONDS * 1000);
  wordMatchGame.finishGuessPhase(state, "blue");
  wordMatchGame.startGuessPhase(state, "red", 3_000);
  wordMatchGame.finishGuessPhase(state, "red");
  assert.equal(state.game.status, "results-pending");
  assert.equal(state.game.roundResults.length, 0);
  assert.deepEqual(state.game.scores, { blue: 0, red: 0 });
  assert.equal(wordMatchGame.revealRound(state, { blue: ["A"], red: ["B"] }), true);
  assert.equal(state.game.revealedLists.blue[0], "A");
  wordMatchGame.startNextRound(state);
  roles = getWordMatchRoles(state.game);
  assert.equal(roles.seeders.blue.id, "b2");
  assert.equal(roles.guessers.blue.id, "b1");
  assert.deepEqual(getWordMatchGuessOrder(state.game), ["red", "blue"]);
  wordMatchGame.startSeedPhase(state, WORD_MATCH_CATEGORIES[1]);
  wordMatchGame.finishSeedPhase(state);
  assert.equal(state.game.status, "red-guess-pending");
  assert.equal(wordMatchGame.startGuessPhase(state, "blue"), false);
  assert.equal(wordMatchGame.startGuessPhase(state, "red"), true);
  assert.equal(wordMatchGame.finishGuessPhase(state, "red"), true);
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
  wordMatchGame.start(state, participants);

  for (let round = 0; round < WORD_MATCH_CATEGORIES.length; round += 1) {
    wordMatchGame.startSeedPhase(state, WORD_MATCH_CATEGORIES[round]);
    wordMatchGame.finishSeedPhase(state);
    for (const team of getWordMatchGuessOrder(state.game)) {
      wordMatchGame.startGuessPhase(state, team);
      wordMatchGame.finishGuessPhase(state, team);
    }
    wordMatchGame.revealRound(state, { blue: [], red: [] });
    if (round < WORD_MATCH_CATEGORIES.length - 1) wordMatchGame.startNextRound(state);
  }

  assert.equal(state.game.status, "tiebreak-pending");
  assert.deepEqual(state.game.tiebreak.terms, WORD_MATCH_TIEBREAK_TERMS);
  assert.equal(wordMatchGame.startTiebreaker(state, 4_000), true);
  assert.equal(state.game.phaseEndsAt, 4_000 + WORD_MATCH_TIEBREAK_SECONDS * 1000);
  assert.equal(wordMatchGame.claimTiebreakTerm(state, 0, "red"), true);
  assert.equal(state.game.tiebreak.revealed[0], false);
  assert.equal(wordMatchGame.claimTiebreakTerm(state, 1, "blue"), true);
  assert.equal(wordMatchGame.claimTiebreakTerm(state, 3, "red"), true);
  assert.equal(wordMatchGame.finishTiebreaker(state), true);
  assert.equal(state.game.status, "tiebreak-reveal");
  assert.equal(wordMatchGame.claimTiebreakTerm(state, 4, "blue"), false);
  for (let index = 0; index < WORD_MATCH_TIEBREAK_TERMS.length; index += 1) {
    assert.equal(wordMatchGame.revealTiebreakTerm(state, index), true);
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
  wordMatchGame.start(state, participants);

  const firstGuessers = [];
  for (let roundIndex = 0; roundIndex < 4; roundIndex += 1) {
    const firstTeam = getWordMatchGuessOrder(state.game)[0];
    firstGuessers.push(getWordMatchRoles(state.game).guessers[firstTeam].name);
    if (roundIndex < 3) {
      state.game.status = "round-finished";
      wordMatchGame.startNextRound(state);
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
  wordMatchGame.start(state, participants);

  for (let round = 0; round < 3; round += 1) {
    wordMatchGame.startSeedPhase(state, WORD_MATCH_CATEGORIES[round]);
    wordMatchGame.finishSeedPhase(state);
    const [firstTeam, secondTeam] = getWordMatchGuessOrder(state.game);
    wordMatchGame.startGuessPhase(state, firstTeam);
    if (firstTeam === "blue") {
      for (let index = 0; index < WORD_MATCH_TERM_COUNT; index += 1) {
        wordMatchGame.toggleMatch(state, "blue", index);
      }
    }
    wordMatchGame.finishGuessPhase(state, firstTeam);
    wordMatchGame.startGuessPhase(state, secondTeam);
    if (secondTeam === "blue") {
      for (let index = 0; index < WORD_MATCH_TERM_COUNT; index += 1) {
        wordMatchGame.toggleMatch(state, "blue", index);
      }
    }
    wordMatchGame.finishGuessPhase(state, secondTeam);
    assert.equal(state.game.status, "results-pending");
    wordMatchGame.revealRound(state, {
      blue: Array(WORD_MATCH_TERM_COUNT).fill("Blau"),
      red: Array(WORD_MATCH_TERM_COUNT).fill("Rot")
    });
    if (round < 2) wordMatchGame.startNextRound(state);
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
  assert.equal(estimationGame.start(state, participants), true);
  assert.equal(state.game.status, "question-pending");
  assert.equal(
    ESTIMATION_QUESTIONS[1].moderatorHint,
    "Vor März 2022 war er noch kürzer; die neue Antenne erhöhte ihn um 6 Meter."
  );
  assert.equal(state.game.questionPrompt, "");
  assert.equal(estimationGame.startQuestion(state, ESTIMATION_QUESTIONS[0].prompt), true);
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

  estimationGame.start(state, participants);
  estimationGame.startQuestion(state, "Testfrage");
  participants.forEach((item) => estimationGame.lockPlayer(state, item.id));
  const estimates = { b1: 90, b2: 110, r1: 80, r2: 120 };
  estimationGame.prepareRound(state, estimates);
  estimationGame.revealRound(state, estimates, 100, "100");

  assert.equal(state.game.revealed.roundWinner, null);
  assert.deepEqual(state.game.roundScores, { blue: 0, red: 0 });
  assert.equal(state.game.status, "revealed");
  assert.equal(estimationGame.startNextQuestion(state, "Nächste Frage"), true);
});

test("scores estimation rounds from both team averages and finishes at five points", () => {
  const state = createInitialRoomState("TEST");
  const participants = [
    { id: "b1", name: "B1", team: "blue" },
    { id: "b2", name: "B2", team: "blue" },
    { id: "r1", name: "R1", team: "red" },
    { id: "r2", name: "R2", team: "red" }
  ];
  estimationGame.start(state, participants);

  for (let round = 0; round < ESTIMATION_ROUNDS_TO_WIN; round += 1) {
    if (round === 0) estimationGame.startQuestion(state, `Frage ${round + 1}`);
    else estimationGame.startNextQuestion(state, `Frage ${round + 1}`);
    participants.forEach((item) => estimationGame.lockPlayer(state, item.id));
    assert.equal(state.game.status, "ready-to-reveal");
    assert.equal(
      estimationGame.prepareRound(state, { b1: 90, b2: 110, r1: 0, r2: 40 }),
      true
    );
    assert.deepEqual(state.game.averages, { blue: 100, red: 20 });
    estimationGame.revealRound(state, { b1: 90, b2: 110, r1: 0, r2: 40 }, 100, "100");
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
    id: "buzzer",
    status: "locked",
    winner: { playerId: "1", playerName: "A", team: "blue" },
    winningTeam: null,
    scores: { blue: BUZZER_WINNING_SCORE - BUZZER_CORRECT_POINTS, red: 2 }
  };

  assert.equal(BUZZER_WINNING_SCORE, 40);
  assert.equal(BUZZER_CORRECT_POINTS, 4);
  assert.equal(BUZZER_WRONG_POINTS, 1);
  assert.equal(buzzerGame.awardPoint(state), true);
  assert.equal(state.game.scores.blue, BUZZER_WINNING_SCORE);
  assert.deepEqual(state.scores, { blue: 1, red: 0 });
  assert.equal(state.game.status, "finished");
  assert.equal(state.game.winningTeam, "blue");
  assert.equal(buzzerGame.awardPoint(state), false);
  assert.deepEqual(state.scores, { blue: 1, red: 0 });
  assert.equal(buzzerGame.reset(state), false);
});

test("keeps buzzer quiz points when the next question starts", () => {
  const state = createInitialRoomState("TEST");
  state.game = {
    id: "buzzer",
    status: "not-started",
    scores: { blue: 2, red: 1 },
    questionIndex: 0
  };

  assert.equal(state.game.status, "not-started");
  assert.equal(buzzerGame.start(state), true);
  assert.equal(state.game.status, "waiting");
  assert.equal(buzzerGame.open(state), true);
  assert.deepEqual(state.game.scores, { blue: 2, red: 1 });
  assert.equal(buzzerGame.reset(state), true);
  assert.deepEqual(state.game.scores, { blue: 2, red: 1 });
});

test("skips an unanswered buzzer question without awarding points", () => {
  const state = createInitialRoomState("TEST");
  buzzerGame.start(state);
  buzzerGame.open(state);
  buzzerGame.registerBuzz(state, { id: "1", name: "A", team: "blue" });
  const scoresBefore = structuredClone(state.game.scores);

  assert.equal(buzzerGame.advanceQuestion(state), true);
  assert.equal(state.game.questionIndex, 1);
  assert.equal(state.game.status, "waiting");
  assert.equal(state.game.winner, null);
  assert.deepEqual(state.game.scores, scoresBefore);
  assert.deepEqual(state.scores, { blue: 0, red: 0 });
});

test("awards a quiz point to the opposing team after a wrong answer", () => {
  const state = createInitialRoomState("TEST");
  state.game = {
    id: "buzzer",
    status: "locked",
    winner: { playerId: "1", playerName: "A", team: "blue" },
    winningTeam: null,
    scores: { blue: 2, red: 3 }
  };

  assert.equal(buzzerGame.awardOpponentPoint(state), true);
  assert.deepEqual(state.game.scores, { blue: 2, red: 4 });
  assert.equal(state.game.status, "open");
  assert.equal(state.game.winner, null);
  assert.deepEqual(state.scores, { blue: 0, red: 0 });
});

test("lets the opposing team win the buzzer game from a wrong answer", () => {
  const state = createInitialRoomState("TEST");
  state.game = {
    id: "buzzer",
    status: "locked",
    winner: { playerId: "1", playerName: "A", team: "blue" },
    winningTeam: null,
    scores: { blue: 2, red: BUZZER_WINNING_SCORE - 1 }
  };

  assert.equal(buzzerGame.awardOpponentPoint(state), true);
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

test("normalizes a persisted single-round Spotify state", () => {
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
  assert.equal(GERMANY_MAP_QUESTIONS.length, 7);
  assert.ok(GERMANY_MAP_QUESTIONS.every((question) =>
    question.prompt && question.answer && Number.isFinite(question.target.lat) && Number.isFinite(question.target.lng)
  ));
});

test("uses the seven requested European destinations", () => {
  const answers = GERMANY_MAP_QUESTIONS.map((question) => question.answer);
  assert.deepEqual(answers, [
    "Sagrada Família · Barcelona, Spanien",
    "Kolosseum · Rom, Italien",
    "Warschau · Polen",
    "Altstadt von Dubrovnik · Kroatien",
    "Hagia Sophia · Istanbul, Türkei",
    "Stonehenge · nahe Amesbury/Salisbury, England",
    "Atomium · Brüssel, Belgien"
  ]);
  assert.deepEqual(GERMANY_MAP_QUESTIONS.map((question) => question.location), [
    "Barcelona, Spanien",
    "Rom, Italien",
    "Warschau, Polen",
    "Dubrovnik, Kroatien",
    "Istanbul, Türkei",
    "Amesbury/Salisbury, England",
    "Brüssel, Belgien"
  ]);
  assert.equal(
    GERMANY_MAP_QUESTIONS[4].prompt,
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
});

test("keeps map distance lines visually constant while zooming", () => {
  const styles = readFileSync(new URL("../css/styles.css", import.meta.url), "utf8");
  const distanceLineRule = styles.match(/\.distance-line\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(distanceLineRule, /vector-effect:\s*non-scaling-stroke/);
});

test("calculates geographic distances in kilometers", () => {
  const berlin = { lat: 52.5200, lng: 13.4050 };
  const hamburg = { lat: 53.5511, lng: 9.9937 };
  const distance = distanceInKilometers(berlin, hamburg);

  assert.ok(distance > 250 && distance < 260);
});

test("shares one map pin per team and awards the closer team", () => {
  const state = createInitialRoomState("TEST");
  germanyMapGame.start(state);
  assert.equal(state.game.status, "round-pending");
  assert.equal(germanyMapGame.startFirstRound(state), true);
  const target = GERMANY_MAP_QUESTIONS[0].target;

  assert.equal(germanyMapGame.placePin(state, "blue", { lat: 53.5, lng: 10 }), true);
  assert.equal(germanyMapGame.placePin(state, "blue", target), true);
  assert.deepEqual(state.game.pins.blue, target);
  assert.equal(germanyMapGame.placePin(state, "red", { lat: 52.52, lng: 13.405 }), true);
  assert.equal(germanyMapGame.lockTeam(state, "blue"), true);
  assert.equal(germanyMapGame.lockTeam(state, "red"), true);
  assert.equal(germanyMapGame.revealRound(state), true);
  assert.equal(state.game.roundWinner, "blue");
  assert.deepEqual(state.game.roundScores, { blue: 1, red: 0 });
  assert.equal(state.game.distances.blue, 0);
});

test("finishes the best of seven map game at four points", () => {
  const state = createInitialRoomState("TEST");
  germanyMapGame.start(state);
  germanyMapGame.startFirstRound(state);
  state.game.roundScores.blue = GERMANY_MAP_ROUNDS_TO_WIN - 1;
  const target = GERMANY_MAP_QUESTIONS[0].target;

  germanyMapGame.placePin(state, "blue", target);
  germanyMapGame.placePin(state, "red", { lat: 53.5, lng: 10 });
  germanyMapGame.lockTeam(state, "blue");
  germanyMapGame.lockTeam(state, "red");
  germanyMapGame.revealRound(state);

  assert.equal(state.game.status, "revealed");
  assert.equal(germanyMapGame.startNextRound(state), true);
  assert.equal(state.game.status, "finished");
  assert.equal(state.game.winningTeam, "blue");
  assert.deepEqual(state.scores, { blue: 1, red: 0 });
  assert.equal(germanyMapGame.startNextRound(state), false);
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
  assert.equal(matchingGame.start(state, players), true);
  assert.equal(state.game.status, "round-pending");
  assert.equal(matchingGame.submitTeam(state, "blue"), false);
  assert.equal(matchingGame.startFirstRound(state), true);
  assert.equal("assignments" in state.game, false);
  assert.equal(MATCHING_TURNS.length, 3);
  assert.equal(matchingGame.submitTeam(state, "blue"), true);
  assert.equal(matchingGame.completeTurn(state), false);
  assert.equal(matchingGame.submitTeam(state, "red"), true);
  assert.equal(matchingGame.completeTurn(state), true);
  assert.equal(state.game.activeTurnIndex, 1);
  assert.equal(state.game.turnSubmitted, false);

  assert.equal(matchingGame.submitTeam(state, "red"), false);
  assert.equal(matchingGame.submitTeam(state, "blue"), true);
  assert.equal(matchingGame.completeTurn(state), true);
  assert.equal(state.game.activeTurnIndex, 2);
  assert.equal(matchingGame.submitTeam(state, "blue"), false);
  assert.equal(matchingGame.submitTeam(state, "red"), true);
  assert.equal(matchingGame.completeTurn(state), true);
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
  matchingGame.start(state, players);
  state.game.status = "ready-to-reveal";

  assert.equal(matchingGame.revealAll(state, { blue: blueAssignments }), false);
  assert.equal(matchingGame.revealAll(state, { blue: blueAssignments, red: redAssignments }), true);
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
  matchingGame.start(state, players);
  matchingGame.startFirstRound(state);

  const perfect = [["Max", "Max"], ["Tom", "Tom"], ["Lisa", "Lisa"], ["Mia", "Mia"]];
  const noMatches = [["Max", "Tom"], ["Tom", "Lisa"], ["Lisa", "Mia"], ["Mia", "Max"]];

  for (let roundIndex = 0; roundIndex < MATCHING_GAME_ROUNDS.length; roundIndex += 1) {
    matchingGame.submitTeam(state, "blue");
    matchingGame.submitTeam(state, "red");
    matchingGame.completeTurn(state);
    matchingGame.submitTeam(state, "blue");
    matchingGame.completeTurn(state);
    matchingGame.submitTeam(state, "red");
    matchingGame.completeTurn(state);
    matchingGame.revealAll(state, { blue: perfect, red: noMatches });
    if (state.game.status === "finished") break;
    matchingGame.startNextRound(state);
  }

  assert.equal(state.game.status, "finished");
  assert.equal(state.game.winningTeam, "blue");
  assert.equal(state.game.roundIndex, 2);
  assert.deepEqual(state.game.scores, { blue: 12, red: 0 });
  assert.deepEqual(state.scores, { blue: 1, red: 0 });
  assert.equal(matchingGame.revealAll(state, { blue: perfect, red: perfect }), false);
});

test("starts Golden Image after a draw and alternates the assigning players", () => {
  const state = createInitialRoomState("TEST");
  const players = MATCHING_ASSIGNERS.map((assigner, index) => ({
    id: String(index),
    name: `Spieler ${index + 1}`,
    team: assigner.team
  }));
  matchingGame.start(state, players);
  state.game.roundIndex = MATCHING_GAME_ROUNDS.length - 1;
  state.game.status = "ready-to-reveal";
  state.game.scores = { blue: 4, red: 4 };
  const equalAssignments = [["Max", "Max"], ["Tom", "Tom"], ["Lisa", "Lisa"], ["Mia", "Mia"]];

  assert.equal(matchingGame.revealAll(state, {
    blue: equalAssignments,
    red: equalAssignments
  }), true);
  assert.equal(state.game.status, "tiebreak-pending");
  assert.equal(state.game.tiebreak.imageIndex, 0);
  assert.deepEqual(state.scores, { blue: 0, red: 0 });

  assert.equal(getMatchingTurn(getMatchingRoleRoundIndex(state.game), 0).playerIndex, 0);
  assert.equal(matchingGame.startTiebreakRound(state), true);
  matchingGame.submitTeam(state, "blue");
  matchingGame.submitTeam(state, "red");
  matchingGame.completeTurn(state);
  matchingGame.submitTeam(state, "blue");
  matchingGame.completeTurn(state);
  matchingGame.submitTeam(state, "red");
  matchingGame.completeTurn(state);
  assert.equal(state.game.status, "tiebreak-ready-to-reveal");
  assert.equal(matchingGame.revealTiebreak(state, {
    blue: ["Max", "Max"],
    red: ["Lisa", "Lisa"]
  }), true);
  assert.equal(state.game.status, "tiebreak-round-finished");
  assert.equal(matchingGame.startNextTiebreakRound(state), true);
  assert.equal(state.game.tiebreak.imageIndex, 1);
  assert.equal(getMatchingTurn(getMatchingRoleRoundIndex(state.game), 0).playerIndex, 1);

  matchingGame.startTiebreakRound(state);
  matchingGame.submitTeam(state, "blue");
  matchingGame.submitTeam(state, "red");
  matchingGame.completeTurn(state);
  matchingGame.submitTeam(state, "blue");
  matchingGame.completeTurn(state);
  matchingGame.submitTeam(state, "red");
  matchingGame.completeTurn(state);
  assert.equal(matchingGame.revealTiebreak(state, {
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
  guessThePriceGame.start(state);

  assert.equal(state.game.status, "product-pending");
  assert.equal(guessThePriceGame.lockTeam(state, "blue"), false);
  assert.equal(guessThePriceGame.startFirstRound(state), true);
  assert.equal(guessThePriceGame.lockTeam(state, "blue"), true);
  assert.equal(state.game.status, "guessing");
  assert.equal(guessThePriceGame.lockTeam(state, "red"), true);
  assert.equal(state.game.status, "ready-to-reveal");
  assert.equal(guessThePriceGame.revealRound(state, { blue: null, red: 40 }), false);
  assert.equal(guessThePriceGame.revealRound(state, { blue: 80, red: 40 }), true);
  assert.equal(state.game.revealed.actualPrice, 79.99);
  assert.equal(state.game.revealed.roundWinner, "blue");
  assert.deepEqual(state.game.roundScores, { blue: 1, red: 0 });
  assert.equal(state.game.status, "revealed");
});

test("finishes the best of seven price game at four wins", () => {
  const state = createInitialRoomState("TEST");
  guessThePriceGame.start(state);
  guessThePriceGame.startFirstRound(state);

  for (let round = 0; round < PRICE_GAME_WINNING_SCORE; round += 1) {
    guessThePriceGame.lockTeam(state, "blue");
    guessThePriceGame.lockTeam(state, "red");
    guessThePriceGame.revealRound(state, { blue: 0, red: 10_000_000 });
    if (round < PRICE_GAME_WINNING_SCORE - 1) guessThePriceGame.startNextRound(state);
  }

  assert.equal(state.game.status, "finished");
  assert.equal(state.game.winningTeam, "blue");
  assert.deepEqual(state.game.roundScores, { blue: 4, red: 0 });
  assert.deepEqual(state.scores, { blue: 1, red: 0 });
  assert.equal(guessThePriceGame.startNextRound(state), false);
});

test("uses the requested product order with matching prices", () => {
  const state = createInitialRoomState("TEST");
  const expectedPrices = [79.99, 82_220, 11.54, 25.95, 51_800, 49.95, 149.90];
  guessThePriceGame.start(state);
  guessThePriceGame.startFirstRound(state);

  expectedPrices.forEach((expectedPrice, index) => {
    guessThePriceGame.lockTeam(state, "blue");
    guessThePriceGame.lockTeam(state, "red");
    guessThePriceGame.revealRound(state, { blue: 0, red: 0 });
    assert.equal(state.game.revealed.actualPrice, expectedPrice);
    if (index < expectedPrices.length - 1) guessThePriceGame.startNextRound(state);
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
