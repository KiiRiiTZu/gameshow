export const WORD_MATCH_CATEGORIES = ["Sage", "Frühstück", "Golf", "Ascent"];
export const WORD_MATCH_TERM_COUNT = 10;
export const WORD_MATCH_PHASE_SECONDS = 60;
export const WORD_MATCH_SEED_SECONDS = 80;

function emptyScores() {
  return { blue: 0, red: 0 };
}

function emptyMatches() {
  return { blue: [], red: [] };
}

function validParticipants(participants) {
  return Array.isArray(participants) && participants.length === 4 &&
    new Set(participants.map((item) => item.id)).size === 4 &&
    participants.filter((item) => item.team === "blue").length === 2 &&
    participants.filter((item) => item.team === "red").length === 2;
}

function publicParticipants(participants) {
  return ["blue", "red"].flatMap((team) =>
    participants.filter((item) => item.team === team).map((item, playerIndex) => ({
      id: item.id,
      name: item.name,
      team,
      playerIndex
    }))
  );
}

function finishGame(state) {
  state.game.status = "finished";
  state.game.phaseEndsAt = null;
  state.game.winningTeam = state.game.scores.blue === state.game.scores.red
    ? null : state.game.scores.blue > state.game.scores.red ? "blue" : "red";
  if (state.game.winningTeam) state.scores[state.game.winningTeam] += 1;
}

export function getWordMatchRoles(game) {
  const seederIndex = Number(game?.roundIndex) % 2;
  const guesserIndex = seederIndex === 0 ? 1 : 0;
  const byTeamAndIndex = (team, playerIndex) => game?.participants?.find((item) =>
    item.team === team && item.playerIndex === playerIndex
  ) || null;
  return {
    seederIndex,
    guesserIndex,
    seeders: {
      blue: byTeamAndIndex("blue", seederIndex),
      red: byTeamAndIndex("red", seederIndex)
    },
    guessers: {
      blue: byTeamAndIndex("blue", guesserIndex),
      red: byTeamAndIndex("red", guesserIndex)
    }
  };
}

export function getWordMatchGuessOrder(game) {
  return Number(game?.roundIndex) % 2 === 0
    ? ["blue", "red"]
    : ["red", "blue"];
}

export const wordMatchGame = {
  id: "word-match-game",
  name: "Begriffsmatch",

  start(state, participants) {
    if (!validParticipants(participants)) return false;
    state.game = {
      id: this.id,
      status: "round-pending",
      roundIndex: 0,
      category: "",
      scores: emptyScores(),
      participants: publicParticipants(participants),
      lockedSeederIds: [],
      currentMatches: emptyMatches(),
      revealedLists: null,
      phaseEndsAt: null,
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
      WORD_MATCH_CATEGORIES.length - 1
    );
    state.game.category = String(state.game.category || "");
    state.game.scores = {
      blue: Number(state.game.scores?.blue) || 0,
      red: Number(state.game.scores?.red) || 0
    };
    state.game.participants = Array.isArray(state.game.participants)
      ? state.game.participants.slice(0, 4) : [];
    state.game.lockedSeederIds = Array.isArray(state.game.lockedSeederIds)
      ? state.game.lockedSeederIds.filter((id) => state.game.participants.some((item) => item.id === id))
      : [];
    state.game.currentMatches = {
      blue: Array.isArray(state.game.currentMatches?.blue) ? state.game.currentMatches.blue : [],
      red: Array.isArray(state.game.currentMatches?.red) ? state.game.currentMatches.red : []
    };
    state.game.revealedLists = state.game.revealedLists &&
      ["blue", "red"].every((team) => Array.isArray(state.game.revealedLists[team]))
      ? {
          blue: state.game.revealedLists.blue.slice(0, WORD_MATCH_TERM_COUNT).map(String),
          red: state.game.revealedLists.red.slice(0, WORD_MATCH_TERM_COUNT).map(String)
        }
      : null;
    state.game.phaseEndsAt = Number(state.game.phaseEndsAt) || null;
    state.game.roundResults = Array.isArray(state.game.roundResults)
      ? state.game.roundResults.slice(0, WORD_MATCH_CATEGORIES.length) : [];
    state.game.winningTeam ||= null;
    state.game.scoreSystemVersion = 2;
    return true;
  },

  startSeedPhase(state, category, now = Date.now()) {
    if (state.game.id !== this.id || state.game.status !== "round-pending") return false;
    state.game.status = "seed-collecting";
    state.game.category = String(category || "");
    state.game.lockedSeederIds = [];
    state.game.currentMatches = emptyMatches();
    state.game.revealedLists = null;
    state.game.phaseEndsAt = now + WORD_MATCH_SEED_SECONDS * 1000;
    return Boolean(state.game.category);
  },

  lockSeeder(state, playerId) {
    if (state.game.id !== this.id || state.game.status !== "seed-collecting") return false;
    const roles = getWordMatchRoles(state.game);
    const seederIds = Object.values(roles.seeders).map((item) => item?.id);
    if (!seederIds.includes(playerId) || state.game.lockedSeederIds.includes(playerId)) return false;
    state.game.lockedSeederIds.push(playerId);
    if (state.game.lockedSeederIds.length === 2) this.finishSeedPhase(state);
    return true;
  },

  finishSeedPhase(state) {
    if (state.game.id !== this.id || state.game.status !== "seed-collecting") return false;
    const roles = getWordMatchRoles(state.game);
    state.game.lockedSeederIds = Object.values(roles.seeders).map((item) => item.id);
    state.game.status = `${getWordMatchGuessOrder(state.game)[0]}-guess-pending`;
    state.game.phaseEndsAt = null;
    return true;
  },

  startGuessPhase(state, team, now = Date.now()) {
    if (!["blue", "red"].includes(team)) return false;
    if (state.game.id !== this.id || state.game.status !== `${team}-guess-pending`) return false;
    state.game.status = `${team}-guessing`;
    state.game.phaseEndsAt = now + WORD_MATCH_PHASE_SECONDS * 1000;
    return true;
  },

  toggleMatch(state, team, index) {
    if (state.game.id !== this.id || state.game.status !== `${team}-guessing`) return false;
    const slotIndex = Number(index);
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= WORD_MATCH_TERM_COUNT) return false;
    const matches = state.game.currentMatches[team];
    const existingIndex = matches.indexOf(slotIndex);
    if (existingIndex >= 0) matches.splice(existingIndex, 1);
    else matches.push(slotIndex);
    matches.sort((a, b) => a - b);
    return true;
  },

  finishGuessPhase(state, team) {
    if (state.game.id !== this.id || state.game.status !== `${team}-guessing`) return false;
    state.game.phaseEndsAt = null;
    const [firstTeam, secondTeam] = getWordMatchGuessOrder(state.game);
    if (team === firstTeam) {
      state.game.status = `${secondTeam}-guess-pending`;
      return true;
    }

    state.game.status = "results-pending";
    return true;
  },

  revealRound(state, lists) {
    if (state.game.id !== this.id || state.game.status !== "results-pending") return false;
    if (!["blue", "red"].every((team) => Array.isArray(lists?.[team]))) return false;
    state.game.revealedLists = {
      blue: Array.from({ length: WORD_MATCH_TERM_COUNT }, (_, index) =>
        String(lists.blue[index] || "").slice(0, 60)
      ),
      red: Array.from({ length: WORD_MATCH_TERM_COUNT }, (_, index) =>
        String(lists.red[index] || "").slice(0, 60)
      )
    };

    const result = {
      blue: state.game.currentMatches.blue.length,
      red: state.game.currentMatches.red.length
    };
    state.game.scores.blue += result.blue;
    state.game.scores.red += result.red;
    state.game.roundResults[state.game.roundIndex] = result;

    const remainingRounds = WORD_MATCH_CATEGORIES.length - state.game.roundIndex - 1;
    const blueMaximum = state.game.scores.blue + remainingRounds * WORD_MATCH_TERM_COUNT;
    const redMaximum = state.game.scores.red + remainingRounds * WORD_MATCH_TERM_COUNT;
    const clinched = state.game.scores.blue > redMaximum || state.game.scores.red > blueMaximum;
    if (clinched || remainingRounds === 0) finishGame(state);
    else state.game.status = "round-finished";
    return true;
  },

  startNextRound(state) {
    if (state.game.id !== this.id || state.game.status !== "round-finished") return false;
    state.game.roundIndex += 1;
    state.game.status = "round-pending";
    state.game.category = "";
    state.game.lockedSeederIds = [];
    state.game.currentMatches = emptyMatches();
    state.game.revealedLists = null;
    state.game.phaseEndsAt = null;
    return true;
  }
};
