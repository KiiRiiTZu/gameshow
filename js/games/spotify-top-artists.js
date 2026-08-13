import { TOP_20_LISTS, TOP_20_SLOT_COUNT, getTop20List } from "./top-20-lists.js";

export const TOP_20_MAX_STRIKES = 3;
export const TOP_20_ROUNDS_TO_WIN = 2;
const SCORE_SYSTEM_VERSION = 2;

function otherTeam(team) {
  return team === "blue" ? "red" : "blue";
}

function emptyRevealedSlots() {
  return Array.from({ length: TOP_20_SLOT_COUNT }, () => null);
}

function startingTeamForRound(firstStartingTeam, roundIndex) {
  return roundIndex % 2 === 0 ? firstStartingTeam : otherTeam(firstStartingTeam);
}

export const top20Game = {
  id: "spotify-top-artists",
  name: "Top 20",

  start(state, startingTeam = "blue") {
    const list = getTop20List(0);

    state.game = {
      id: this.id,
      status: "playing",
      roundIndex: 0,
      roundWins: { blue: 0, red: 0 },
      roundWinner: null,
      firstStartingTeam: startingTeam,
      currentTeam: startingTeam,
      listTitle: list.title,
      listDescription: list.description,
      valueLabel: list.valueLabel,
      revealed: emptyRevealedSlots(),
      strikes: { blue: 0, red: 0 },
      winningTeam: null,
      scoreSystemVersion: SCORE_SYSTEM_VERSION
    };

    return true;
  },

  normalize(state) {
    if (state.game.id !== this.id) return false;

    state.game.roundIndex = Number(state.game.roundIndex) || 0;
    state.game.roundWins ||= { blue: 0, red: 0 };
    state.game.roundWinner ||= null;
    state.game.firstStartingTeam ||= "blue";
    state.game.revealed ||= Array.isArray(state.game.slots)
      ? state.game.slots.map((slot) => slot
        ? { team: slot.team, answer: slot.artist, value: "" }
        : null)
      : emptyRevealedSlots();

    const list = getTop20List(state.game.roundIndex);
    state.game.revealed = state.game.revealed.map((slot, index) =>
      typeof slot === "string"
        ? { team: slot, answer: list.entries[index]?.answer || "", value: list.entries[index]?.value || "" }
        : slot
    );
    state.game.listTitle ||= list.title;
    state.game.listDescription ||= list.description;
    state.game.valueLabel ||= list.valueLabel;

    while (state.game.revealed.length < TOP_20_SLOT_COUNT) state.game.revealed.push(null);

    if (state.game.status === "finished" && state.game.winningTeam) {
      state.game.roundWins[state.game.winningTeam] = Math.max(
        TOP_20_ROUNDS_TO_WIN,
        Number(state.game.roundWins[state.game.winningTeam]) || 0
      );
    }

    delete state.game.slots;
    return true;
  },

  reveal(state, rank) {
    if (state.game.id !== this.id || state.game.status !== "playing") return false;

    const slotIndex = Number(rank) - 1;

    if (!Number.isInteger(slotIndex)) return false;
    if (slotIndex < 0 || slotIndex >= TOP_20_SLOT_COUNT) return false;
    if (state.game.revealed[slotIndex]) return false;

    const entry = getTop20List(state.game.roundIndex).entries[slotIndex];
    state.game.revealed[slotIndex] = {
      team: state.game.currentTeam,
      answer: entry.answer,
      value: entry.value
    };
    state.game.currentTeam = otherTeam(state.game.currentTeam);
    return true;
  },

  recordMiss(state) {
    if (state.game.id !== this.id || state.game.status !== "playing") return false;

    const losingTeam = state.game.currentTeam;
    state.game.strikes[losingTeam] += 1;

    if (state.game.strikes[losingTeam] >= TOP_20_MAX_STRIKES) {
      const roundWinner = otherTeam(losingTeam);
      state.game.roundWinner = roundWinner;
      state.game.roundWins[roundWinner] += 1;

      if (state.game.roundWins[roundWinner] >= TOP_20_ROUNDS_TO_WIN) {
        state.game.status = "finished";
        state.game.winningTeam = roundWinner;
        state.scores[roundWinner] += 1;
      } else {
        state.game.status = "round-finished";
      }

      return true;
    }

    state.game.currentTeam = otherTeam(losingTeam);
    return true;
  },

  startNextRound(state) {
    if (state.game.id !== this.id || state.game.status !== "round-finished") return false;

    const nextRoundIndex = state.game.roundIndex + 1;
    if (!TOP_20_LISTS[nextRoundIndex]) return false;
    const nextList = getTop20List(nextRoundIndex);

    state.game.roundIndex = nextRoundIndex;
    state.game.status = "playing";
    state.game.roundWinner = null;
    state.game.currentTeam = startingTeamForRound(state.game.firstStartingTeam, nextRoundIndex);
    state.game.listTitle = nextList.title;
    state.game.listDescription = nextList.description;
    state.game.valueLabel = nextList.valueLabel;
    state.game.revealed = emptyRevealedSlots();
    state.game.strikes = { blue: 0, red: 0 };
    return true;
  }
};

// Backwards-compatible aliases for older imports and persisted rooms.
export const spotifyTopArtistsGame = top20Game;
export const SPOTIFY_SLOT_COUNT = TOP_20_SLOT_COUNT;
export const SPOTIFY_MAX_STRIKES = TOP_20_MAX_STRIKES;
