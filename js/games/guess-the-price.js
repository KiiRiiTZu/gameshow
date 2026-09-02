import { PRICE_PRODUCTS } from "./guess-the-price-products.js";
export { formatEuroAmount, formatSignedEuroDifference, parseEuroAmount } from "../euro.js";

export const PRICE_GAME_WINNING_SCORE = 4;

const PRODUCT_PRICES = [79.99, 82_220, 11.54, 25.95, 51_800, 49.95, 149.90];

function emptyTeams(value) {
  return { blue: structuredClone(value), red: structuredClone(value) };
}

function validGuess(value) {
  return Number.isFinite(value) && value >= 0 && value <= 10_000_000;
}

function cents(value) {
  return Math.round(Number(value) * 100) / 100;
}

export const guessThePriceGame = {
  id: "guess-the-price",
  name: "Thrifty",

  start(state) {
    state.game = {
      id: this.id,
      status: "guessing",
      roundIndex: 0,
      roundScores: emptyTeams(0),
      lockedTeams: emptyTeams(false),
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
      PRICE_PRODUCTS.length - 1
    );
    state.game.roundScores = {
      blue: Number(state.game.roundScores?.blue) || 0,
      red: Number(state.game.roundScores?.red) || 0
    };
    state.game.lockedTeams = {
      blue: Boolean(state.game.lockedTeams?.blue),
      red: Boolean(state.game.lockedTeams?.red)
    };
    state.game.roundResults = Array.isArray(state.game.roundResults)
      ? state.game.roundResults.slice(0, PRICE_PRODUCTS.length)
      : [];
    state.game.revealed ||= null;
    state.game.winningTeam ||= null;
    state.game.scoreSystemVersion = 2;
    return true;
  },

  lockTeam(state, team) {
    if (state.game.id !== this.id || state.game.status !== "guessing") return false;
    if (!['blue', 'red'].includes(team) || state.game.lockedTeams[team]) return false;
    state.game.lockedTeams[team] = true;
    if (state.game.lockedTeams.blue && state.game.lockedTeams.red) {
      state.game.status = "ready-to-reveal";
    }
    return true;
  },

  revealRound(state, guesses) {
    if (state.game.id !== this.id || state.game.status !== "ready-to-reveal") return false;
    if (!Number.isFinite(guesses?.blue) || !Number.isFinite(guesses?.red)) return false;
    const blueGuess = cents(Number(guesses?.blue));
    const redGuess = cents(Number(guesses?.red));
    if (!validGuess(blueGuess) || !validGuess(redGuess)) return false;

    const actualPrice = PRODUCT_PRICES[state.game.roundIndex];
    const differences = {
      blue: cents(Math.abs(blueGuess - actualPrice)),
      red: cents(Math.abs(redGuess - actualPrice))
    };
    const roundWinner = differences.blue === differences.red
      ? null
      : differences.blue < differences.red ? "blue" : "red";

    if (roundWinner) state.game.roundScores[roundWinner] += 1;
    state.game.revealed = {
      actualPrice,
      guesses: { blue: blueGuess, red: redGuess },
      differences,
      roundWinner
    };
    state.game.roundResults[state.game.roundIndex] = structuredClone(state.game.revealed);

    const reachedWinningScore = roundWinner &&
      state.game.roundScores[roundWinner] >= PRICE_GAME_WINNING_SCORE;
    const productsExhausted = state.game.roundIndex >= PRICE_PRODUCTS.length - 1;

    if (!reachedWinningScore && !productsExhausted) {
      state.game.status = "revealed";
      return true;
    }

    state.game.status = "finished";
    state.game.winningTeam = state.game.roundScores.blue === state.game.roundScores.red
      ? null
      : state.game.roundScores.blue > state.game.roundScores.red ? "blue" : "red";
    if (state.game.winningTeam) state.scores[state.game.winningTeam] += 1;
    return true;
  },

  startNextRound(state) {
    if (state.game.id !== this.id || state.game.status !== "revealed") return false;
    if (state.game.roundIndex >= PRICE_PRODUCTS.length - 1) return false;
    state.game.roundIndex += 1;
    state.game.status = "guessing";
    state.game.lockedTeams = emptyTeams(false);
    state.game.revealed = null;
    return true;
  }
};
