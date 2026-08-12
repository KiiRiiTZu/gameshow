export const BUZZER_WINNING_SCORE = 5;

export const buzzerGame = {
  id: "buzzer",
  name: "Buzzer Quiz",

  open(state) {
    if (state.game.status === "finished") return false;

    state.game = {
      id: "buzzer",
      status: "open",
      winner: null,
      winningTeam: null
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

    state.game = {
      id: "buzzer",
      status: "waiting",
      winner: null,
      winningTeam: null
    };

    return true;
  },

  awardPoint(state) {
    if (state.game.status !== "locked") return false;

    const team = state.game.winner?.team;
    if (!team) return false;

    state.scores[team] += 1;

    if (state.scores[team] >= BUZZER_WINNING_SCORE) {
      state.game.status = "finished";
      state.game.winningTeam = team;
    }

    return true;
  }
};
