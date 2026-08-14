export const MATCHING_ASSIGNERS = [
  { id: "blue-1", team: "blue", playerIndex: 0, label: "Spieler 1 · Team Blau" },
  { id: "red-1", team: "red", playerIndex: 0, label: "Spieler 1 · Team Rot" },
  { id: "blue-2", team: "blue", playerIndex: 1, label: "Spieler 2 · Team Blau" },
  { id: "red-2", team: "red", playerIndex: 1, label: "Spieler 2 · Team Rot" }
];

const IMAGE_ROOT = "./assets/images/matching%20game";

export const MATCHING_GAME_ROUNDS = [
  {
    id: "jahreszeiten",
    title: "Jahreszeiten",
    images: [
      { id: "fruehling", label: "Frühling", src: `${IMAGE_ROOT}/jahreszeiten/fruehling.webp` },
      { id: "sommer", label: "Sommer", src: `${IMAGE_ROOT}/jahreszeiten/sommer.webp` },
      { id: "herbst", label: "Herbst", src: `${IMAGE_ROOT}/jahreszeiten/herbst.webp` },
      { id: "winter", label: "Winter", src: `${IMAGE_ROOT}/jahreszeiten/winter.webp` }
    ]
  },
  {
    id: "essen",
    title: "Essen",
    images: [
      { id: "salat", label: "Salat", src: `${IMAGE_ROOT}/essen/salat.webp` },
      { id: "steak", label: "Steak", src: `${IMAGE_ROOT}/essen/steak.webp` },
      { id: "sushi", label: "Sushi", src: `${IMAGE_ROOT}/essen/sushi.webp` },
      { id: "tacos", label: "Tacos", src: `${IMAGE_ROOT}/essen/tacos.webp` }
    ]
  },
  {
    id: "haustiere",
    title: "Haustiere",
    images: [
      { id: "hund", label: "Hund", src: `${IMAGE_ROOT}/haustiere/hund.webp` },
      { id: "katze", label: "Katze", src: `${IMAGE_ROOT}/haustiere/katze.webp` },
      { id: "schildkroete", label: "Schildkröte", src: `${IMAGE_ROOT}/haustiere/schildkroete.webp` },
      { id: "wiesel", label: "Wiesel", src: `${IMAGE_ROOT}/haustiere/wiesel.webp` }
    ]
  },
  {
    id: "setups",
    title: "Gaming-Setups",
    images: [
      { id: "cheap", label: "Budget", src: `${IMAGE_ROOT}/setups/cheap.webp` },
      { id: "clean", label: "Clean", src: `${IMAGE_ROOT}/setups/clean.webp` },
      { id: "pink", label: "Pink", src: `${IMAGE_ROOT}/setups/pink.webp` },
      { id: "work", label: "Work", src: `${IMAGE_ROOT}/setups/work.webp` }
    ]
  }
];

function emptyScores() {
  return { blue: 0, red: 0 };
}

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("de");
}

export function scoreMatchingAssignments(assignments) {
  const scores = emptyScores();

  for (const imageAssignments of assignments || []) {
    const blueFirst = normalizeName(imageAssignments?.[0]);
    const redFirst = normalizeName(imageAssignments?.[1]);
    const blueSecond = normalizeName(imageAssignments?.[2]);
    const redSecond = normalizeName(imageAssignments?.[3]);

    if (blueFirst && blueFirst === blueSecond) scores.blue += 1;
    if (redFirst && redFirst === redSecond) scores.red += 1;
  }

  return scores;
}

export const matchingGame = {
  id: "matching-game",
  name: "Wer passt zu wem?",

  start(state, assignerOrder) {
    if (!Array.isArray(assignerOrder) || assignerOrder.length !== MATCHING_ASSIGNERS.length) {
      return false;
    }

    state.game = {
      id: this.id,
      status: "assigning",
      roundIndex: 0,
      activeAssignerIndex: 0,
      scores: emptyScores(),
      roundResults: [],
      assignerOrder: assignerOrder.map((player) => ({
        id: player.id,
        name: player.name,
        team: player.team
      })),
      winningTeam: null,
      scoreSystemVersion: 2
    };
    return true;
  },

  normalize(state) {
    if (state.game.id !== this.id) return false;

    state.game.roundIndex = Math.min(
      Math.max(Number(state.game.roundIndex) || 0, 0),
      MATCHING_GAME_ROUNDS.length - 1
    );
    state.game.activeAssignerIndex = Math.min(
      Math.max(Number(state.game.activeAssignerIndex) || 0, 0),
      MATCHING_ASSIGNERS.length - 1
    );
    state.game.scores = {
      blue: Number(state.game.scores?.blue) || 0,
      red: Number(state.game.scores?.red) || 0
    };
    state.game.roundResults = Array.isArray(state.game.roundResults)
      ? state.game.roundResults.slice(0, MATCHING_GAME_ROUNDS.length)
      : [];
    state.game.assignerOrder = Array.isArray(state.game.assignerOrder)
      ? state.game.assignerOrder.slice(0, MATCHING_ASSIGNERS.length)
      : [];
    state.game.winningTeam ||= null;
    state.game.scoreSystemVersion = 2;
    return true;
  },

  advanceAssigner(state) {
    if (state.game.id !== this.id || state.game.status !== "assigning") return false;
    if (state.game.activeAssignerIndex >= MATCHING_ASSIGNERS.length - 1) return false;

    state.game.activeAssignerIndex += 1;
    return true;
  },

  completeRound(state, roundScores) {
    if (state.game.id !== this.id || state.game.status !== "assigning") return false;
    if (state.game.activeAssignerIndex !== MATCHING_ASSIGNERS.length - 1) return false;

    const blue = Number(roundScores?.blue);
    const red = Number(roundScores?.red);
    if (!Number.isInteger(blue) || !Number.isInteger(red) ||
        blue < 0 || blue > 4 || red < 0 || red > 4) return false;

    state.game.scores.blue += blue;
    state.game.scores.red += red;
    state.game.roundResults[state.game.roundIndex] = { blue, red };

    if (state.game.roundIndex < MATCHING_GAME_ROUNDS.length - 1) {
      state.game.status = "round-finished";
      return true;
    }

    state.game.status = "finished";
    state.game.winningTeam = state.game.scores.blue === state.game.scores.red
      ? null
      : state.game.scores.blue > state.game.scores.red ? "blue" : "red";

    if (state.game.winningTeam) state.scores[state.game.winningTeam] += 1;
    return true;
  },

  startNextRound(state) {
    if (state.game.id !== this.id || state.game.status !== "round-finished") return false;
    if (state.game.roundIndex >= MATCHING_GAME_ROUNDS.length - 1) return false;

    state.game.roundIndex += 1;
    state.game.activeAssignerIndex = 0;
    state.game.status = "assigning";
    return true;
  }
};
