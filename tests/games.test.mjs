import test from "node:test";
import assert from "node:assert/strict";

import { BUZZER_WINNING_SCORE, buzzerGame } from "../js/games/buzzer.js";
import { spotifyTopArtistsGame } from "../js/games/spotify-top-artists.js";
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

test("places Spotify hits in ranked slots and alternates teams", () => {
  const state = createInitialRoomState("TEST");
  spotifyTopArtistsGame.start(state, "blue");

  assert.equal(spotifyTopArtistsGame.recordHit(state, "Artist A", 4), true);
  assert.deepEqual(state.game.slots[3], { artist: "Artist A", team: "blue" });
  assert.equal(state.game.currentTeam, "red");
  assert.equal(spotifyTopArtistsGame.recordHit(state, "Artist B", 4), false);
  assert.equal(spotifyTopArtistsGame.recordHit(state, "artist a", 5), false);
});

test("ends the Spotify game after a team's third miss", () => {
  const state = createInitialRoomState("TEST");
  spotifyTopArtistsGame.start(state, "red");
  state.game.strikes.red = 2;

  assert.equal(spotifyTopArtistsGame.recordMiss(state), true);
  assert.equal(state.game.strikes.red, 3);
  assert.equal(state.game.status, "finished");
  assert.equal(state.game.winningTeam, "blue");
  assert.deepEqual(state.scores, { blue: 1, red: 0 });
  assert.equal(spotifyTopArtistsGame.recordMiss(state), false);
  assert.deepEqual(state.scores, { blue: 1, red: 0 });
});
