import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import { BUZZER_WINNING_SCORE, buzzerGame } from "../js/games/buzzer.js";
import { BUZZER_QUESTIONS } from "../js/games/buzzer-questions.js";
import { TOP_20_MAX_STRIKES, top20Game } from "../js/games/spotify-top-artists.js";
import { TOP_20_LISTS, TOP_20_SLOT_COUNT } from "../js/games/top-20-lists.js";
import {
  GERMANY_MAP_QUESTIONS,
  GERMANY_MAP_ROUNDS_TO_WIN,
  distanceInKilometers,
  germanyMapGame
} from "../js/games/germany-map.js";
import {
  MATCHING_ASSIGNERS,
  MATCHING_GAME_ROUNDS,
  MATCHING_TURNS,
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
  createEncryptionKeyPair,
  decryptPrivatePayload,
  encryptPrivatePayload,
  exportEncryptionPublicKey
} from "../js/private-channel-crypto.js";
import { createInitialRoomState } from "../js/room.js";
import { getGamePresentation } from "../js/game-effects.js";

test("contains presentation cards for all five games", () => {
  assert.deepEqual([
    "buzzer",
    "guess-the-price",
    "spotify-top-artists",
    "germany-map",
    "matching-game"
  ].map((gameId) => getGamePresentation(gameId).number), [1, 2, 3, 4, 5]);
  assert.equal(getGamePresentation("guess-the-price").name, "Thrifty");
  assert.equal(getGamePresentation("germany-map").name, "Kartenwissen");
  assert.equal(getGamePresentation("matching-game").name, "Da seh ich dich");
});

test("finishes the buzzer game at 20 points with three points per correct answer", () => {
  const state = createInitialRoomState("TEST");
  state.game = {
    id: "buzzer",
    status: "locked",
    winner: { playerId: "1", playerName: "A", team: "blue" },
    winningTeam: null,
    scores: { blue: BUZZER_WINNING_SCORE - 3, red: 2 }
  };

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
  state.game.scores = { blue: 2, red: 1 };

  assert.equal(state.game.status, "not-started");
  assert.equal(buzzerGame.start(state), true);
  assert.equal(state.game.status, "waiting");
  assert.equal(buzzerGame.open(state), true);
  assert.deepEqual(state.game.scores, { blue: 2, red: 1 });
  assert.equal(buzzerGame.reset(state), true);
  assert.deepEqual(state.game.scores, { blue: 2, red: 1 });
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

test("contains eleven prepared Germany map questions", () => {
  assert.equal(GERMANY_MAP_QUESTIONS.length, 11);
  assert.ok(GERMANY_MAP_QUESTIONS.every((question) =>
    question.prompt && question.answer && Number.isFinite(question.target.lat) && Number.isFinite(question.target.lng)
  ));
});

test("mixes full map questions with city-only rounds", () => {
  assert.deepEqual(
    [1, 3, 5, 7, 9].map((index) => GERMANY_MAP_QUESTIONS[index].prompt),
    ["Hannover", "Dresden", "Saarbrücken", "Freiburg", "Erfurt"]
  );
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

test("finishes the best of eleven map game at six points", () => {
  const state = createInitialRoomState("TEST");
  germanyMapGame.start(state);
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

test("collects one active team in two moderator-controlled turns", () => {
  const state = createInitialRoomState("TEST");
  const players = [
    { id: "b1", name: "Max", team: "blue" },
    { id: "r1", name: "Lisa", team: "red" },
    { id: "b2", name: "Tom", team: "blue" },
    { id: "r2", name: "Mia", team: "red" }
  ];
  assert.equal(matchingGame.start(state, players), true);
  assert.equal("assignments" in state.game, false);
  assert.equal(state.game.activeTeam, "blue");
  assert.equal(MATCHING_TURNS.length, 2);
  assert.equal(matchingGame.submitTeam(state, "red"), false);
  assert.equal(matchingGame.submitTeam(state, "blue"), true);
  assert.equal(matchingGame.completeTurn(state), true);
  assert.equal(state.game.activeTurnIndex, 1);
  assert.equal(state.game.turnSubmitted, false);

  assert.equal(matchingGame.submitTeam(state, "blue"), true);
  assert.equal(matchingGame.completeTurn(state), true);
  assert.equal(state.game.status, "ready-to-reveal");
  assert.equal("assignments" in state.game, false);
});

test("contains all prepared buzzer questions", () => {
  assert.equal(BUZZER_QUESTIONS.length, 13);
  assert.ok(BUZZER_QUESTIONS.every((entry) => entry.question && entry.answer));
});

test("reveals and scores only the active team", () => {
  const state = createInitialRoomState("TEST");
  const players = MATCHING_ASSIGNERS.map((assigner, index) => ({
    id: String(index), name: `Spieler ${index + 1}`, team: assigner.team
  }));
  const blueAssignments = [["Max", "Max"], ["Tom", "Max"], ["Lisa", "Lisa"], ["Mia", "Mia"]];
  matchingGame.start(state, players);
  state.game.status = "ready-to-reveal";

  assert.equal(matchingGame.revealAll(state, {
    blue: blueAssignments
  }), true);
  assert.equal(state.game.status, "round-finished");
  assert.deepEqual(state.game.revealedTeams, { blue: true, red: false });
  assert.deepEqual(state.game.scores, { blue: 3, red: 0 });
});

test("alternates blue and red image rounds and awards one match point", () => {
  const state = createInitialRoomState("TEST");
  const players = MATCHING_ASSIGNERS.map((assigner, index) => ({
    id: String(index),
    name: `Spieler ${index + 1}`,
    team: assigner.team
  }));
  matchingGame.start(state, players);

  const perfect = Array.from({ length: 4 }, () => ["Max", "Max"]);
  const twoMatches = [["Max", "Max"], ["Max", "Tom"], ["Lisa", "Lisa"], ["Mia", "Tom"]];

  for (let roundIndex = 0; roundIndex < MATCHING_GAME_ROUNDS.length; roundIndex += 1) {
    const team = roundIndex % 2 === 0 ? "blue" : "red";
    matchingGame.submitTeam(state, team);
    matchingGame.completeTurn(state);
    matchingGame.submitTeam(state, team);
    matchingGame.completeTurn(state);
    matchingGame.revealAll(state, { [team]: team === "blue" ? perfect : twoMatches });
    if (roundIndex < MATCHING_GAME_ROUNDS.length - 1) matchingGame.startNextRound(state);
  }

  assert.equal(state.game.status, "finished");
  assert.equal(state.game.winningTeam, "blue");
  assert.deepEqual(state.game.scores, { blue: 8, red: 4 });
  assert.deepEqual(state.scores, { blue: 1, red: 0 });
  assert.equal(matchingGame.revealAll(state, { red: perfect }), false);
});

test("allows a draw in the matching game without awarding a match point", () => {
  const state = createInitialRoomState("TEST");
  const players = MATCHING_ASSIGNERS.map((assigner, index) => ({
    id: String(index),
    name: `Spieler ${index + 1}`,
    team: assigner.team
  }));
  matchingGame.start(state, players);
  state.game.roundIndex = MATCHING_GAME_ROUNDS.length - 1;
  state.game.activeTeam = "red";
  state.game.status = "ready-to-reveal";
  state.game.scores = { blue: 4, red: 0 };
  const equalAssignments = Array.from({ length: 4 }, () => ["Max", "Max"]);

  assert.equal(matchingGame.revealAll(state, {
    red: equalAssignments
  }), true);
  assert.equal(state.game.winningTeam, null);
  assert.deepEqual(state.scores, { blue: 0, red: 0 });
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

test("uses player one then player two and alternates the active team per round", () => {
  assert.equal(getMatchingTurn(0, 0).playerIndex, 0);
  assert.equal(getMatchingTurn(0, 1).playerIndex, 1);
  assert.equal(getMatchingTurn(0, 0).team, "blue");
  assert.equal(getMatchingTurn(1, 0).playerIndex, 0);
  assert.equal(getMatchingTurn(1, 1).playerIndex, 1);
  assert.equal(getMatchingTurn(1, 0).team, "red");
  assert.equal(getMatchingTurn(2, 0).playerIndex, 0);
  assert.equal(getMatchingTurn(3, 0).team, "red");
});

test("contains nine complete price products without public prices", () => {
  assert.equal(PRICE_PRODUCTS.length, 9);
  assert.ok(PRICE_PRODUCTS.every((product) => product.id && product.name &&
    product.src.endsWith(".webp") && !("price" in product)));
  assert.ok(PRICE_PRODUCTS.every((product) =>
    existsSync(new URL(`../${product.src.replace("./", "")}`, import.meta.url))
  ));
  assert.deepEqual(PRICE_PRODUCTS.map((product) => product.id), [
    "ck-one",
    "ferrero-box",
    "weber-grill",
    "der-nachbar",
    "iphone-17-pro-max",
    "hyperx-cloud-3",
    "cat-toy",
    "rtx-5090",
    "mercedes"
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
  assert.equal(formatSignedEuroDifference(548, 34), "+514,00 €");
  assert.equal(formatSignedEuroDifference(548, 803), "−255,00 €");
});

test("locks both teams and awards the closer price guess", () => {
  const state = createInitialRoomState("TEST");
  guessThePriceGame.start(state);

  assert.equal(guessThePriceGame.lockTeam(state, "blue"), true);
  assert.equal(state.game.status, "guessing");
  assert.equal(guessThePriceGame.lockTeam(state, "red"), true);
  assert.equal(state.game.status, "ready-to-reveal");
  assert.equal(guessThePriceGame.revealRound(state, { blue: null, red: 40 }), false);
  assert.equal(guessThePriceGame.revealRound(state, { blue: 30, red: 40 }), true);
  assert.equal(state.game.revealed.actualPrice, 29.99);
  assert.equal(state.game.revealed.roundWinner, "blue");
  assert.deepEqual(state.game.roundScores, { blue: 1, red: 0 });
  assert.equal(state.game.status, "revealed");
});

test("finishes the best of nine price game at five wins", () => {
  const state = createInitialRoomState("TEST");
  guessThePriceGame.start(state);

  for (let round = 0; round < PRICE_GAME_WINNING_SCORE; round += 1) {
    guessThePriceGame.lockTeam(state, "blue");
    guessThePriceGame.lockTeam(state, "red");
    guessThePriceGame.revealRound(state, { blue: 0, red: 10_000_000 });
    if (round < PRICE_GAME_WINNING_SCORE - 1) guessThePriceGame.startNextRound(state);
  }

  assert.equal(state.game.status, "finished");
  assert.equal(state.game.winningTeam, "blue");
  assert.deepEqual(state.game.roundScores, { blue: 5, red: 0 });
  assert.deepEqual(state.scores, { blue: 1, red: 0 });
  assert.equal(guessThePriceGame.startNextRound(state), false);
});

test("uses the requested product order with matching prices", () => {
  const state = createInitialRoomState("TEST");
  const expectedPrices = [29.99, 59.99, 548, 25, 2269, 94.36, 22.94, 4746.04, 144.48];
  guessThePriceGame.start(state);

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
  const payload = { roundIndex: 2, amount: "59,99", comment: "Ich tippe knapp 60 Euro" };
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
