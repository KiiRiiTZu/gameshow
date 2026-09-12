import { SET_ROUNDS } from "./set-rounds.js";

export const SET_WINNING_SCORE = 5;

function otherTeam(team) {
  return team === "blue" ? "red" : "blue";
}

export const setGame = {
  id: "set",
  name: "SET",

  setup(state) {
    state.game = {
      id: this.id,
      status: "not-started",
      roundIndex: 0,
      scores: { blue: 0, red: 0 },
      winner: null,
      selectedCards: [],
      result: null,
      winningTeam: null,
      scoreSystemVersion: 2
    };
    return true;
  },

  startRound(state) {
    if (state.game.id !== this.id || !["not-started", "round-pending"].includes(state.game.status)) return false;
    state.game.status = "open";
    state.game.winner = null;
    state.game.selectedCards = [];
    state.game.result = null;
    return true;
  },

  registerBuzz(state, player, now = Date.now()) {
    if (state.game.id !== this.id || state.game.status !== "open") return false;
    state.game.status = "locked";
    state.game.winner = {
      playerId: player.id,
      playerName: player.name,
      team: player.team,
      receivedAt: now
    };
    state.game.selectedCards = [];
    return true;
  },

  toggleCard(state, cardNumber) {
    if (state.game.id !== this.id || state.game.status !== "locked") return false;
    const number = Number(cardNumber);
    if (!Number.isInteger(number) || number < 1 || number > 12) return false;
    const selected = state.game.selectedCards || [];
    if (selected.includes(number)) {
      state.game.selectedCards = selected.filter((value) => value !== number);
      return true;
    }
    if (selected.length >= 3) return false;
    state.game.selectedCards = [...selected, number];
    return true;
  },

  resolve(state, correct) {
    if (state.game.id !== this.id || state.game.status !== "locked" ||
        state.game.selectedCards?.length !== 3 || !state.game.winner) return false;
    const example = Boolean(SET_ROUNDS[state.game.roundIndex]?.example);
    const scoringTeam = correct ? state.game.winner.team : otherTeam(state.game.winner.team);
    if (!example) state.game.scores[scoringTeam] += 1;
    state.game.result = { correct: Boolean(correct), scoringTeam, example };

    if (!example && state.game.scores[scoringTeam] >= SET_WINNING_SCORE) {
      state.game.status = "finished";
      state.game.winningTeam = scoringTeam;
      state.scores[scoringTeam] += 1;
    } else {
      state.game.status = "resolved";
    }
    return true;
  },

  advanceRound(state) {
    if (state.game.id !== this.id || state.game.status !== "resolved") return false;
    state.game.roundIndex = (state.game.roundIndex + 1) % SET_ROUNDS.length;
    if (state.game.roundIndex === 0) state.game.roundIndex = 1;
    state.game.status = "round-pending";
    state.game.winner = null;
    state.game.selectedCards = [];
    state.game.result = null;
    return true;
  }
};
