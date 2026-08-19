import { BUZZER_QUESTIONS } from "./buzzer-questions.js";

export const BUZZER_WINNING_SCORE = 30;
export const BUZZER_CORRECT_POINTS = 3;
export const BUZZER_WRONG_POINTS = 1;
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

function currentQuestionIndex(state) {
  return Math.min(
    Math.max(Number(state.game?.questionIndex) || 0, 0),
    BUZZER_QUESTIONS.length - 1
  );
}

export const buzzerGame = {
  id: "buzzer",
  name: "Buzzer Quiz",

  start(state) {
    if (state.game.id === this.id && state.game.status === "not-started") {
      state.game.status = "waiting";
      return true;
    }
    if (state.game.id === this.id) return false;
    state.game = {
      id: this.id,
      status: "waiting",
      winner: null,
      winningTeam: null,
      scores: { blue: 0, red: 0 },
      questionIndex: 0,
      scoreSystemVersion: SCORE_SYSTEM_VERSION
    };
    return true;
  },

  open(state) {
    if (state.game.status !== "waiting") return false;

    const scores = currentGameScores(state);

    state.game = {
      id: "buzzer",
      status: "open",
      winner: null,
      winningTeam: null,
      scores,
      questionIndex: currentQuestionIndex(state),
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
      questionIndex: currentQuestionIndex(state),
      scoreSystemVersion: SCORE_SYSTEM_VERSION
    };

    return true;
  },

  awardPoint(state, team = state.game.winner?.team, points = BUZZER_CORRECT_POINTS) {
    if (state.game.status !== "locked") return false;
    if (!["blue", "red"].includes(team)) return false;

    state.game.scores = currentGameScores(state);
    state.game.scores[team] += points;

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
    if (!this.awardPoint(state, otherTeam(answeringTeam), BUZZER_WRONG_POINTS)) return false;
    if (state.game.status !== "finished") {
      state.game.status = "open";
      state.game.winner = null;
    }
    return true;
  },

  advanceQuestion(state) {
    if (state.game.id !== this.id || ["not-started", "finished"].includes(state.game.status)) {
      return false;
    }
    state.game.questionIndex = (currentQuestionIndex(state) + 1) % BUZZER_QUESTIONS.length;
    state.game.status = "waiting";
    state.game.winner = null;
    return true;
  }
};
