import test from "node:test";
import assert from "node:assert/strict";

import {
  addOrUpdatePlayer,
  createInitialRoomState,
  createRoomStateFromRecords,
  getShowWinner,
  SHOW_WINNING_SCORE
} from "../js/room.js";

test("ends the best-of-five show at three game wins", () => {
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
