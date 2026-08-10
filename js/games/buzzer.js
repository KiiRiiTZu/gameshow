export const buzzerGame = {
  id: "buzzer",
  name: "Buzzer Quiz",

  open(state) {
    state.game = {
      id: "buzzer",
      status: "open",
      winner: null
    };
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
    state.game = {
      id: "buzzer",
      status: "waiting",
      winner: null
    };
  },

  awardPoint(state) {
    const team = state.game.winner?.team;
    if (!team) return false;
    state.scores[team] += 1;
    return true;
  }
};
