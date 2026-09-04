import { RANKING_LISTS, getRankingEntry, getRankingList } from "./ranking-lists.js";

export const RANKING_MAX_STRIKES = 2;
export const RANKING_ROUNDS_TO_WIN = 2;

function otherTeam(team) {
  return team === "blue" ? "red" : "blue";
}

function startingTeamForRound(firstStartingTeam, roundIndex) {
  return roundIndex % 2 === 0 ? firstStartingTeam : otherTeam(firstStartingTeam);
}

function initialRoundState(roundIndex) {
  const list = getRankingList(roundIndex);
  return {
    placedIds: [list.anchorId],
    remainingIds: list.entries.filter((entry) => entry.id !== list.anchorId).map((entry) => entry.id),
    proposal: null,
    lastResult: null,
    strikes: { blue: 0, red: 0 }
  };
}

function finishRound(state, winner) {
  state.game.roundWinner = winner;
  if (winner) state.game.roundWins[winner] += 1;

  if (winner && state.game.roundWins[winner] >= RANKING_ROUNDS_TO_WIN) {
    state.game.status = "finished";
    state.game.winningTeam = winner;
    state.scores[winner] += 1;
    return;
  }

  const lastListPlayed = state.game.roundIndex >= RANKING_LISTS.length - 1;
  if (lastListPlayed) {
    state.game.status = "finished";
    state.game.winningTeam = state.game.roundWins.blue === state.game.roundWins.red
      ? null
      : state.game.roundWins.blue > state.game.roundWins.red ? "blue" : "red";
    if (state.game.winningTeam) state.scores[state.game.winningTeam] += 1;
    return;
  }

  state.game.status = "round-finished";
}

export const rankingGame = {
  id: "ranking-game",
  name: "Einordnen",

  start(state, startingTeam = "blue") {
    state.game = {
      id: this.id,
      status: "not-started",
      roundIndex: 0,
      roundWins: { blue: 0, red: 0 },
      roundWinner: null,
      firstStartingTeam: startingTeam,
      currentTeam: startingTeam,
      winningTeam: null,
      ...initialRoundState(0),
      scoreSystemVersion: 1
    };
    return true;
  },

  startFirstRound(state) {
    if (state.game.id !== this.id || state.game.status !== "not-started") return false;
    state.game.status = "playing";
    return true;
  },

  normalize(state) {
    if (state.game.id !== this.id) return false;
    state.game.roundIndex = Math.min(
      Math.max(Number(state.game.roundIndex) || 0, 0),
      RANKING_LISTS.length - 1
    );
    const defaults = initialRoundState(state.game.roundIndex);
    state.game.roundWins = {
      blue: Number(state.game.roundWins?.blue) || 0,
      red: Number(state.game.roundWins?.red) || 0
    };
    state.game.roundWinner ||= null;
    state.game.firstStartingTeam ||= "blue";
    state.game.currentTeam = ["blue", "red"].includes(state.game.currentTeam)
      ? state.game.currentTeam : state.game.firstStartingTeam;
    state.game.placedIds = Array.isArray(state.game.placedIds) ? state.game.placedIds : defaults.placedIds;
    state.game.remainingIds = Array.isArray(state.game.remainingIds) ? state.game.remainingIds : defaults.remainingIds;
    state.game.proposal ||= null;
    state.game.lastResult ||= null;
    state.game.strikes = {
      blue: Number(state.game.strikes?.blue) || 0,
      red: Number(state.game.strikes?.red) || 0
    };
    state.game.winningTeam ||= null;
    state.game.scoreSystemVersion = 1;
    return true;
  },

  proposePlacement(state, itemId, position) {
    if (state.game.id !== this.id || state.game.status !== "playing") return false;
    const insertionIndex = Number(position) - 1;
    if (!state.game.remainingIds.includes(itemId)) return false;
    if (!Number.isInteger(insertionIndex) || insertionIndex < 0 ||
        insertionIndex > state.game.placedIds.length) return false;
    state.game.proposal = {
      itemId,
      position: insertionIndex + 1,
      team: state.game.currentTeam
    };
    state.game.lastResult = null;
    state.game.status = "ready-to-reveal";
    return true;
  },

  revealPlacement(state) {
    if (state.game.id !== this.id || state.game.status !== "ready-to-reveal" ||
        !state.game.proposal) return false;
    const list = getRankingList(state.game.roundIndex);
    const item = getRankingEntry(list, state.game.proposal.itemId);
    if (!item) return false;
    const itemRank = list.entries.findIndex((entry) => entry.id === item.id);
    const correctIndex = state.game.placedIds.filter((id) =>
      list.entries.findIndex((entry) => entry.id === id) < itemRank
    ).length;
    const attemptedIndex = state.game.proposal.position - 1;
    const correct = attemptedIndex === correctIndex;
    const team = state.game.proposal.team;

    if (correct) {
      state.game.remainingIds = state.game.remainingIds.filter((id) => id !== item.id);
      state.game.placedIds.splice(correctIndex, 0, item.id);
    }
    else state.game.strikes[team] += 1;
    state.game.lastResult = {
      itemId: item.id,
      team,
      correct,
      attemptedPosition: attemptedIndex + 1,
      correctPosition: correctIndex + 1
    };
    state.game.proposal = null;

    if (state.game.strikes[team] >= RANKING_MAX_STRIKES) {
      finishRound(state, otherTeam(team));
      return true;
    }

    if (!state.game.remainingIds.length) {
      const winner = state.game.strikes.blue === state.game.strikes.red
        ? null
        : state.game.strikes.blue < state.game.strikes.red ? "blue" : "red";
      finishRound(state, winner);
      return true;
    }

    state.game.currentTeam = otherTeam(state.game.currentTeam);
    state.game.status = "playing";
    return true;
  },

  revealNextRemaining(state) {
    if (state.game.id !== this.id || !["round-finished", "finished"].includes(state.game.status) ||
        !state.game.remainingIds.length) return false;
    const list = getRankingList(state.game.roundIndex);
    const nextItem = list.entries.find((entry) => state.game.remainingIds.includes(entry.id));
    if (!nextItem) return false;
    const itemRank = list.entries.findIndex((entry) => entry.id === nextItem.id);
    const correctIndex = state.game.placedIds.filter((id) =>
      list.entries.findIndex((entry) => entry.id === id) < itemRank
    ).length;
    state.game.remainingIds = state.game.remainingIds.filter((id) => id !== nextItem.id);
    state.game.placedIds.splice(correctIndex, 0, nextItem.id);
    state.game.lastResult = {
      itemId: nextItem.id,
      team: null,
      correct: true,
      cleanupReveal: true,
      correctPosition: correctIndex + 1
    };
    return true;
  },

  startNextRound(state) {
    if (state.game.id !== this.id || state.game.status !== "round-finished") return false;
    const nextRoundIndex = state.game.roundIndex + 1;
    if (!RANKING_LISTS[nextRoundIndex]) return false;
    state.game.roundIndex = nextRoundIndex;
    state.game.status = "playing";
    state.game.roundWinner = null;
    state.game.currentTeam = startingTeamForRound(state.game.firstStartingTeam, nextRoundIndex);
    Object.assign(state.game, initialRoundState(nextRoundIndex));
    return true;
  }
};
