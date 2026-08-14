import test from "node:test";
import assert from "node:assert/strict";

import { BUZZER_WINNING_SCORE, buzzerGame } from "../js/games/buzzer.js";
import { TOP_20_MAX_STRIKES, top20Game } from "../js/games/spotify-top-artists.js";
import { TOP_20_LISTS, TOP_20_SLOT_COUNT } from "../js/games/top-20-lists.js";
import {
  GERMANY_MAP_QUESTIONS,
  GERMANY_MAP_ROUNDS_TO_WIN,
  distanceInKilometers,
  germanyMapGame
} from "../js/games/germany-map.js";
import { createInitialRoomState } from "../js/room.js";

test("finishes the buzzer game when a team reaches five points", () => {
  const state = createInitialRoomState("TEST");
  state.game = {
    id: "buzzer",
    status: "locked",
    winner: { playerId: "1", playerName: "A", team: "blue" },
    winningTeam: null,
    scores: { blue: BUZZER_WINNING_SCORE - 1, red: 2 }
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
    value: "~96,7"
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
  germanyMapGame.revealRound(state);

  assert.equal(state.game.status, "revealed");
  assert.equal(germanyMapGame.startNextRound(state), true);
  assert.equal(state.game.status, "finished");
  assert.equal(state.game.winningTeam, "blue");
  assert.deepEqual(state.scores, { blue: 1, red: 0 });
  assert.equal(germanyMapGame.startNextRound(state), false);
  assert.deepEqual(state.scores, { blue: 1, red: 0 });
});
