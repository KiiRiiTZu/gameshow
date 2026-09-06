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

function normalizeScore(value) {
  return Math.max(0, Math.trunc(Number(value) || 0));
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
  return true;
}
