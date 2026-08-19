export const ESTIMATION_ROUNDS_TO_WIN = 5;
export const ESTIMATION_ROUND_COUNT = 9;

export function parseEstimate(value) {
  const compact = String(value ?? "").trim().replaceAll(" ", "");
  const usesGermanThousands = /^[+-]?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(compact);
  const normalized = (usesGermanThousands ? compact.replaceAll(".", "") : compact)
    .replace(",", ".");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function emptyScores() {
  return { blue: 0, red: 0 };
}

function validParticipants(participants) {
  return Array.isArray(participants) && participants.length === 4 &&
    new Set(participants.map((item) => item.id)).size === 4 &&
    participants.filter((item) => item.team === "blue").length === 2 &&
    participants.filter((item) => item.team === "red").length === 2;
}

function publicParticipants(participants) {
  return participants.map(({ id, name, team }) => ({ id, name, team }));
}

export const estimationGame = {
  id: "estimation-game",
  name: "Schätzfragen",

  start(state, participants) {
    if (!validParticipants(participants)) return false;
    state.game = {
      id: this.id,
      status: "question-pending",
      roundIndex: 0,
      roundScores: emptyScores(),
      participants: publicParticipants(participants),
      lockedPlayerIds: [],
      questionPrompt: "",
      revealed: null,
      roundResults: [],
      winningTeam: null,
      scoreSystemVersion: 2
    };
    return true;
  },

  normalize(state) {
    if (state.game.id !== this.id) return false;
    state.game.roundIndex = Math.min(
      Math.max(Number(state.game.roundIndex) || 0, 0),
      ESTIMATION_ROUND_COUNT - 1
    );
    state.game.roundScores = {
      blue: Number(state.game.roundScores?.blue) || 0,
      red: Number(state.game.roundScores?.red) || 0
    };
    state.game.participants = Array.isArray(state.game.participants)
      ? state.game.participants.slice(0, 4) : [];
    state.game.lockedPlayerIds = Array.isArray(state.game.lockedPlayerIds)
      ? state.game.lockedPlayerIds.filter((id) => state.game.participants.some((item) => item.id === id))
      : [];
    state.game.questionPrompt = String(state.game.questionPrompt || "");
    state.game.roundResults = Array.isArray(state.game.roundResults)
      ? state.game.roundResults.slice(0, ESTIMATION_ROUND_COUNT) : [];
    state.game.revealed ||= null;
    state.game.winningTeam ||= null;
    state.game.scoreSystemVersion = 2;
    return true;
  },

  startQuestion(state, prompt) {
    if (state.game.id !== this.id || state.game.status !== "question-pending") return false;
    state.game.status = "guessing";
    state.game.questionPrompt = String(prompt || "");
    state.game.lockedPlayerIds = [];
    state.game.revealed = null;
    return Boolean(state.game.questionPrompt);
  },

  lockPlayer(state, playerId) {
    if (state.game.id !== this.id || state.game.status !== "guessing") return false;
    if (!state.game.participants.some((item) => item.id === playerId) ||
        state.game.lockedPlayerIds.includes(playerId)) return false;
    state.game.lockedPlayerIds.push(playerId);
    if (state.game.lockedPlayerIds.length === state.game.participants.length) {
      state.game.status = "ready-to-reveal";
    }
    return true;
  },

  revealRound(state, estimates, answer, answerDisplay) {
    if (state.game.id !== this.id || state.game.status !== "ready-to-reveal") return false;
    const guesses = {};
    for (const participant of state.game.participants) {
      const value = Number(estimates?.[participant.id]);
      if (!Number.isFinite(value)) return false;
      guesses[participant.id] = value;
    }

    const averages = {};
    for (const team of ["blue", "red"]) {
      const teamValues = state.game.participants
        .filter((item) => item.team === team)
        .map((item) => guesses[item.id]);
      averages[team] = (teamValues[0] + teamValues[1]) / 2;
    }
    const distances = {
      blue: Math.abs(averages.blue - answer),
      red: Math.abs(averages.red - answer)
    };
    const roundWinner = distances.blue === distances.red
      ? null : distances.blue < distances.red ? "blue" : "red";
    if (roundWinner) state.game.roundScores[roundWinner] += 1;

    state.game.revealed = { answer, answerDisplay, guesses, averages, distances, roundWinner };
    state.game.roundResults[state.game.roundIndex] = structuredClone(state.game.revealed);

    const reachedWinningScore = roundWinner &&
      state.game.roundScores[roundWinner] >= ESTIMATION_ROUNDS_TO_WIN;
    const questionsExhausted = state.game.roundIndex >= ESTIMATION_ROUND_COUNT - 1;
    if (reachedWinningScore || questionsExhausted) {
      state.game.status = "finished";
      state.game.winningTeam = state.game.roundScores.blue === state.game.roundScores.red
        ? null
        : state.game.roundScores.blue > state.game.roundScores.red ? "blue" : "red";
      if (state.game.winningTeam) state.scores[state.game.winningTeam] += 1;
    } else {
      state.game.status = "revealed";
    }
    return true;
  },

  startNextQuestion(state, prompt) {
    if (state.game.id !== this.id || state.game.status !== "revealed") return false;
    state.game.roundIndex += 1;
    state.game.status = "question-pending";
    state.game.questionPrompt = "";
    state.game.lockedPlayerIds = [];
    state.game.revealed = null;
    return this.startQuestion(state, prompt);
  }
};
