import { BUZZER_WINNING_SCORE } from "./games/buzzer.js";
import { TOP_20_ROUNDS_TO_WIN } from "./games/spotify-top-artists.js";
import { RANKING_ROUNDS_TO_WIN } from "./games/ranking-game.js";
import { GERMANY_MAP_ROUNDS_TO_WIN } from "./games/germany-map.js";
import { MATCHING_GAME_ROUNDS } from "./games/matching-game.js";
import { PRICE_GAME_WINNING_SCORE } from "./games/guess-the-price.js";
import { ESTIMATION_ROUNDS_TO_WIN } from "./games/estimation-game.js";
import { WORD_MATCH_CATEGORIES, WORD_MATCH_TERM_COUNT } from "./games/word-match-game.js";

const GAME_SCORE_CONFIG = {
  buzzer: { key: "scores", label: "Quizpunkte" },
  "spotify-top-artists": { key: "roundWins", label: "Rundensiege" },
  "ranking-game": { key: "roundWins", label: "Listensiege" },
  "germany-map": { key: "roundScores", label: "Kartenpunkte" },
  "matching-game": { key: "scores", label: "Übereinstimmungen" },
  "guess-the-price": { key: "roundScores", label: "Rundensiege" },
  "estimation-game": { key: "roundScores", label: "Rundensiege" },
  "word-match-game": { key: "scores", label: "Treffer" }
};

const FIXED_WINNING_SCORES = {
  buzzer: BUZZER_WINNING_SCORE,
  "spotify-top-artists": TOP_20_ROUNDS_TO_WIN,
  "ranking-game": RANKING_ROUNDS_TO_WIN,
  "germany-map": GERMANY_MAP_ROUNDS_TO_WIN,
  "guess-the-price": PRICE_GAME_WINNING_SCORE,
  "estimation-game": ESTIMATION_ROUNDS_TO_WIN
};

function normalizeScore(value) {
  return Math.max(0, Math.trunc(Number(value) || 0));
}

function otherTeam(team) {
  return team === "blue" ? "red" : "blue";
}

function remainingRegularRounds(game, roundCount) {
  const currentRoundWasScored = Boolean(game.roundResults?.[game.roundIndex]);
  return Math.max(roundCount - normalizeScore(game.roundIndex) - (currentRoundWasScored ? 1 : 0), 0);
}

function manualWinningTeam(game, editedTeam) {
  const score = getModeratorGameScore(game)?.scores;
  if (!score) return null;

  const fixedTarget = FIXED_WINNING_SCORES[game.id];
  if (fixedTarget && score[editedTeam] >= fixedTarget) return editedTeam;

  const opponent = otherTeam(editedTeam);
  if (game.id === "matching-game") {
    if (game.tiebreak) return score[editedTeam] > score[opponent] ? editedTeam : null;
    const remainingPoints = remainingRegularRounds(game, MATCHING_GAME_ROUNDS.length) * 4;
    return score[editedTeam] > score[opponent] + remainingPoints ? editedTeam : null;
  }

  if (game.id === "word-match-game") {
    const remainingPoints = game.tiebreak
      ? game.tiebreak.claimedBy.filter((team) => !team).length
      : remainingRegularRounds(game, WORD_MATCH_CATEGORIES.length) * WORD_MATCH_TERM_COUNT;
    return score[editedTeam] > score[opponent] + remainingPoints ? editedTeam : null;
  }

  return null;
}

function finishGameFromModeratorScore(state, editedTeam) {
  const winningTeam = manualWinningTeam(state.game, editedTeam);
  if (!winningTeam) return;

  const previousWinner = state.game.status === "finished" ? state.game.winningTeam : null;
  if (previousWinner && previousWinner !== winningTeam) {
    state.scores[previousWinner] = Math.max(0, normalizeScore(state.scores[previousWinner]) - 1);
  }
  if (previousWinner !== winningTeam) {
    state.scores[winningTeam] = normalizeScore(state.scores[winningTeam]) + 1;
  }

  state.game.status = "finished";
  state.game.winningTeam = winningTeam;
  state.game.manualFinish = true;
  if ("phaseEndsAt" in state.game) state.game.phaseEndsAt = null;
}

export function getModeratorGameScore(game) {
  const config = GAME_SCORE_CONFIG[game?.id];
  if (!config) return null;

  const scoreTarget = game.id === "word-match-game" && game.tiebreak?.scores
    ? game.tiebreak.scores
    : game[config.key];
  if (!scoreTarget || typeof scoreTarget !== "object") return null;

  return {
    label: config.label,
    scores: {
      blue: normalizeScore(scoreTarget.blue),
      red: normalizeScore(scoreTarget.red)
    },
    target: scoreTarget
  };
}

export function adjustModeratorScore(state, scope, team, delta) {
  if (!state || !["blue", "red"].includes(team) || ![-1, 1].includes(Number(delta))) {
    return false;
  }

  const target = scope === "show"
    ? state.scores
    : scope === "game"
      ? getModeratorGameScore(state.game)?.target
      : null;
  if (!target || typeof target !== "object") return false;

  const current = normalizeScore(target[team]);
  const next = Math.max(0, current + Number(delta));
  if (next === current) return false;
  target[team] = next;
  if (scope === "game") finishGameFromModeratorScore(state, team);
  return true;
}

export function setModeratorScore(state, scope, team, value) {
  if (!state || !["blue", "red"].includes(team) || !/^\d+$/.test(String(value).trim())) {
    return false;
  }

  const target = scope === "show"
    ? state.scores
    : scope === "game"
      ? getModeratorGameScore(state.game)?.target
      : null;
  if (!target || typeof target !== "object") return false;

  const next = normalizeScore(value);
  if (normalizeScore(target[team]) === next) return false;
  target[team] = next;
  if (scope === "game") finishGameFromModeratorScore(state, team);
  return true;
}
