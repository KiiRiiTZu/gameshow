export const BUZZER_WINNING_SCORE = 5;
const SCORE_SYSTEM_VERSION = 2;

function currentGameScores(state) {
  return {
    blue: Number(state.game?.scores?.blue) || 0,
    red: Number(state.game?.scores?.red) || 0
  };
}

function otherTeam(team) {
  return team === "blue" ? "red" : "blue";
}

export const buzzerGame = {
  id: "buzzer",
  name: "Buzzer Quiz",

  open(state) {
    if (state.game.status === "finished") return false;

    const scores = currentGameScores(state);

    state.game = {
      id: "buzzer",
      status: "open",
      winner: null,
      winningTeam: null,
      scores,
      scoreSystemVersion: SCORE_SYSTEM_VERSION
    };

    return true;
  },

  registerBuzz(state, player) {
    if (state.game.status !== "open") return false;

    state.game.status = "locked";
    state.game.winner = {
      playerId: player.id,
      playerName: player.name,
      team: player.team,
      receivedAt: Date.now()
    };

    return true;
  },

  reset(state) {
    if (state.game.status === "finished") return false;

    const scores = currentGameScores(state);

    state.game = {
      id: "buzzer",
      status: "waiting",
      winner: null,
      winningTeam: null,
      scores,
      scoreSystemVersion: SCORE_SYSTEM_VERSION
    };

    return true;
  },

  awardPoint(state, team = state.game.winner?.team) {
    if (state.game.status !== "locked") return false;
    if (!["blue", "red"].includes(team)) return false;

    state.game.scores = currentGameScores(state);
    state.game.scores[team] += 1;

    if (state.game.scores[team] >= BUZZER_WINNING_SCORE) {
      state.game.status = "finished";
      state.game.winningTeam = team;
      state.scores[team] += 1;
    }

    return true;
  },

  awardOpponentPoint(state) {
    const answeringTeam = state.game.winner?.team;
    if (!["blue", "red"].includes(answeringTeam)) return false;
    return this.awardPoint(state, otherTeam(answeringTeam));
  }
};
