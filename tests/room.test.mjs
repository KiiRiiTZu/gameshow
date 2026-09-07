import test from "node:test";
import assert from "node:assert/strict";

import {
  addOrUpdatePlayer,
  createInitialRoomState,
  createRoomStateFromRecords,
  findReclaimableSeat,
  getShowWinner,
  normalizeGameResults,
  recordGameResult,
  SHOW_WINNING_SCORE,
  teamHasSpace
} from "../js/room.js";

test("ends the best-of-seven show at four game wins", () => {
  const state = createInitialRoomState("TEST");
  state.scores.blue = SHOW_WINNING_SCORE - 1;
  assert.equal(getShowWinner(state), null);
  state.scores.blue += 1;
  assert.equal(getShowWinner(state), "blue");
});

test("rejects a third player in the same team", () => {
  const state = createInitialRoomState("TEST");

  assert.equal(addOrUpdatePlayer(state, { id: "1", name: "A", team: "blue" }), true);
  assert.equal(addOrUpdatePlayer(state, { id: "2", name: "B", team: "blue" }), true);
  assert.equal(addOrUpdatePlayer(state, { id: "3", name: "C", team: "blue" }), false);
  assert.equal(state.players.length, 2);
});

test("rejects a team change when the target team is full", () => {
  const state = createInitialRoomState("TEST");

  addOrUpdatePlayer(state, { id: "1", name: "A", team: "blue" });
  addOrUpdatePlayer(state, { id: "2", name: "B", team: "red" });
  addOrUpdatePlayer(state, { id: "3", name: "C", team: "red" });

  assert.equal(addOrUpdatePlayer(state, { id: "1", name: "A", team: "red" }), false);
  assert.equal(state.players.find((item) => item.id === "1").team, "blue");
});

test("restores room, game and accepted players from database records", () => {
  const room = {
    blue_score: 2,
    red_score: 4,
    current_game: "buzzer",
    game_status: "locked",
    buzzer_winner_id: "2",
    buzzer_winner_name: "B",
    buzzer_winner_team: "red"
  };
  const players = [
    { id: "1", name: "A", team: "blue" },
    { id: "2", name: "B", team: "red" },
    { id: "3", name: "C", team: "red" },
    { id: "4", name: "D", team: "red" }
  ];

  const state = createRoomStateFromRecords("TEST", room, players);

  assert.deepEqual(state.scores, { blue: 2, red: 4 });
  assert.deepEqual(state.game.scores, { blue: 0, red: 0 });
  assert.equal(state.game.status, "locked");
  assert.equal(state.game.winner.playerId, "2");
  assert.deepEqual(state.players.map((item) => item.id), ["1", "2", "3"]);
});

test("restores a persisted Top 20 game state", () => {
  const persistedGame = {
    id: "spotify-top-artists",
    status: "playing",
    roundIndex: 1,
    roundWins: { blue: 1, red: 0 },
    currentTeam: "red",
    revealed: ["blue"],
    strikes: { blue: 1, red: 2 },
    winningTeam: null,
    scoreSystemVersion: 2
  };
  const room = {
    blue_score: 5,
    red_score: 3,
    current_game: "spotify-top-artists",
    game_status: "playing",
    game_state: persistedGame
  };

  const state = createRoomStateFromRecords("TEST", room);

  assert.deepEqual(state.game, persistedGame);
  assert.deepEqual(state.scores, { blue: 5, red: 3 });
});

test("upgrades legacy buzzer points into separate quiz and match scores", () => {
  const room = {
    blue_score: 5,
    red_score: 3,
    current_game: "buzzer",
    game_status: "finished",
    game_state: {
      id: "buzzer",
      status: "finished",
      winner: null,
      winningTeam: "blue"
    }
  };

  const state = createRoomStateFromRecords("TEST", room);

  assert.deepEqual(state.game.scores, { blue: 5, red: 3 });
  assert.deepEqual(state.scores, { blue: 1, red: 0 });
});

test("records which team won which game and keeps the playing order", () => {
  const state = createInitialRoomState("TEST");

  assert.deepEqual(state.gameResults, []);
  assert.equal(recordGameResult(state, "estimation-game", "blue"), true);
  assert.equal(recordGameResult(state, "guess-the-price", "red"), true);

  assert.deepEqual(state.gameResults, [
    { gameId: "estimation-game", team: "blue" },
    { gameId: "guess-the-price", team: "red" }
  ]);
});

test("does not record the same game twice when the host renders again", () => {
  const state = createInitialRoomState("TEST");

  assert.equal(recordGameResult(state, "germany-map", "red"), true);
  assert.equal(recordGameResult(state, "germany-map", "red"), false);
  assert.equal(state.gameResults.length, 1);
});

test("follows a corrected game winner instead of adding a second entry", () => {
  const state = createInitialRoomState("TEST");

  recordGameResult(state, "buzzer", "blue");
  assert.equal(recordGameResult(state, "buzzer", "red"), true);
  assert.deepEqual(state.gameResults, [{ gameId: "buzzer", team: "red" }]);
});

test("stores a drawn game without a winning team", () => {
  const state = createInitialRoomState("TEST");

  recordGameResult(state, "word-match-game", null);
  assert.deepEqual(state.gameResults, [{ gameId: "word-match-game", team: null }]);
});

test("drops damaged entries when restoring the game results", () => {
  const restored = normalizeGameResults([
    { gameId: "estimation-game", team: "blue" },
    { gameId: "estimation-game", team: "red" },
    { gameId: "guess-the-price", team: "gruen" },
    { gameId: "", team: "blue" },
    null
  ]);

  assert.deepEqual(restored, [
    { gameId: "estimation-game", team: "blue" },
    { gameId: "guess-the-price", team: null }
  ]);
  assert.deepEqual(normalizeGameResults("kaputt"), []);
});

test("returns the old seat to a player who lost their id", () => {
  const state = createInitialRoomState("TEST");
  addOrUpdatePlayer(state, { id: "alt", name: "Max", team: "blue" });
  addOrUpdatePlayer(state, { id: "andere", name: "Lena", team: "blue" });

  // Team ist voll: ohne Rückgewinnung käme "Dieses Team ist bereits voll".
  assert.equal(addOrUpdatePlayer(state, { id: "neu", name: "Max", team: "blue" }), false);

  const seat = findReclaimableSeat(state, { id: "neu", name: "Max", team: "blue" });
  assert.equal(seat?.id, "alt", "der frühere Platz wird zurückgegeben");
});

test("matches a reclaimed seat regardless of upper case and spacing", () => {
  const state = createInitialRoomState("TEST");
  addOrUpdatePlayer(state, { id: "alt", name: "Max", team: "red" });

  assert.equal(findReclaimableSeat(state, { id: "neu", name: "  max  ", team: "red" })?.id, "alt");
});

test("does not hand out a seat from the other team or another name", () => {
  const state = createInitialRoomState("TEST");
  addOrUpdatePlayer(state, { id: "alt", name: "Max", team: "blue" });

  assert.equal(findReclaimableSeat(state, { id: "neu", name: "Max", team: "red" }), null);
  assert.equal(findReclaimableSeat(state, { id: "neu", name: "Moritz", team: "blue" }), null);
  assert.equal(findReclaimableSeat(state, { id: "neu", name: "", team: "blue" }), null);
});

test("leaves a player with an intact id on the normal join path", () => {
  const state = createInitialRoomState("TEST");
  addOrUpdatePlayer(state, { id: "alt", name: "Max", team: "blue" });

  // Gleiche Id: kein Rückgewinnungsfall, der reguläre Beitritt aktualisiert den Eintrag.
  assert.equal(findReclaimableSeat(state, { id: "alt", name: "Max", team: "blue" }), null);
  assert.equal(addOrUpdatePlayer(state, { id: "alt", name: "Max", team: "blue" }), true);
  assert.equal(state.players.length, 1);
});

test("prevents a second entry under the same name while the team still has room", () => {
  const state = createInitialRoomState("TEST");
  addOrUpdatePlayer(state, { id: "alt", name: "Max", team: "blue" });

  // Ohne diese Prüfung entstünde neben der Karteileiche ein zweiter "Max".
  assert.equal(teamHasSpace(state, "blue"), true);
  assert.equal(findReclaimableSeat(state, { id: "neu", name: "Max", team: "blue" })?.id, "alt");
});
