export const MATCHING_ASSIGNERS = [
  { id: "blue-1", team: "blue", playerIndex: 0, label: "Spieler 1 · Team Blau" },
  { id: "red-1", team: "red", playerIndex: 0, label: "Spieler 1 · Team Rot" },
  { id: "blue-2", team: "blue", playerIndex: 1, label: "Spieler 2 · Team Blau" },
  { id: "red-2", team: "red", playerIndex: 1, label: "Spieler 2 · Team Rot" }
];

export const MATCHING_TURNS = [
  { playerIndex: 0, assignerIndexes: { blue: 0, red: 1 }, label: "Spieler 1" },
  { playerIndex: 1, assignerIndexes: { blue: 2, red: 3 }, label: "Spieler 2" }
];

const IMAGE_ROOT = "./assets/images/matching%20game";

export const MATCHING_GAME_ROUNDS = [
  {
    id: "valowaffen",
    title: "Valorant-Waffen",
    images: [
      { id: "judge", label: "Judge", src: `${IMAGE_ROOT}/valowaffen/Judge.webp` },
      { id: "operator", label: "Operator", src: `${IMAGE_ROOT}/valowaffen/operator.webp` },
      { id: "sheriff", label: "Sheriff", src: `${IMAGE_ROOT}/valowaffen/Sheriff.webp` },
      { id: "vandal", label: "Vandal", src: `${IMAGE_ROOT}/valowaffen/vandal.webp` }
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
      { id: "rgb", label: "RGB", src: `${IMAGE_ROOT}/setups/rgb.webp` },
      { id: "pink", label: "Pink", src: `${IMAGE_ROOT}/setups/pink.webp` },
      { id: "work", label: "Work", src: `${IMAGE_ROOT}/setups/work.webp` }
    ]
  }
];

function emptyScores() {
  return { blue: 0, red: 0 };
}

function emptyTeamFlags() {
  return { blue: false, red: false };
}

function emptyRevealedAssignments() {
  return { blue: null, red: null };
}

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("de");
}

export function areMatchingValuesUnique(values) {
  const selected = (values || []).map(normalizeName).filter(Boolean);
  return new Set(selected).size === selected.length;
}

export function getPrivateMatchingAssignments(roundAssignments, team) {
  const indexes = team === "blue" ? [0, 2] : team === "red" ? [1, 3] : [];
  return (roundAssignments || []).map((imageAssignments) =>
    indexes.map((index) => String(imageAssignments?.[index] || ""))
  );
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
      activeTurnIndex: 0,
      submittedTeams: emptyTeamFlags(),
      revealedTeams: emptyTeamFlags(),
      revealedAssignments: emptyRevealedAssignments(),
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
    state.game.activeTurnIndex = Math.min(
      Math.max(Number(state.game.activeTurnIndex) ||
        Math.floor((Number(state.game.activeAssignerIndex) || 0) / 2), 0),
      MATCHING_TURNS.length - 1
    );
    delete state.game.activeAssignerIndex;
    state.game.submittedTeams = {
      blue: Boolean(state.game.submittedTeams?.blue),
      red: Boolean(state.game.submittedTeams?.red)
    };
    state.game.revealedTeams = {
      blue: Boolean(state.game.revealedTeams?.blue),
      red: Boolean(state.game.revealedTeams?.red)
    };
    state.game.revealedAssignments = {
      blue: Array.isArray(state.game.revealedAssignments?.blue)
        ? state.game.revealedAssignments.blue : null,
      red: Array.isArray(state.game.revealedAssignments?.red)
        ? state.game.revealedAssignments.red : null
    };
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

  submitTeam(state, team) {
    if (state.game.id !== this.id || state.game.status !== "assigning") return false;
    if (!["blue", "red"].includes(team) || state.game.submittedTeams[team]) return false;

    state.game.submittedTeams[team] = true;
    return true;
  },

  completeTurn(state) {
    if (state.game.id !== this.id || state.game.status !== "assigning") return false;
    if (!state.game.submittedTeams.blue || !state.game.submittedTeams.red) return false;

    if (state.game.activeTurnIndex < MATCHING_TURNS.length - 1) {
      state.game.activeTurnIndex += 1;
      state.game.submittedTeams = emptyTeamFlags();
      return true;
    }

    state.game.status = "ready-to-reveal";
    state.game.submittedTeams = emptyTeamFlags();
    return true;
  },

  revealTeam(state, team, teamAssignments) {
    if (state.game.id !== this.id ||
        !["ready-to-reveal", "revealing"].includes(state.game.status)) return false;
    if (!["blue", "red"].includes(team) || state.game.revealedTeams[team]) return false;
    if (!Array.isArray(teamAssignments) || teamAssignments.length !== 4 ||
        teamAssignments.some((pair) => !Array.isArray(pair) || pair.length !== 2 ||
          pair.some((value) => !String(value || "").trim()))) return false;

    state.game.revealedAssignments[team] = teamAssignments.map((pair) =>
      pair.map((value) => String(value).trim())
    );
    state.game.revealedTeams[team] = true;

    if (!state.game.revealedTeams.blue || !state.game.revealedTeams.red) {
      state.game.status = "revealing";
      return true;
    }

    const roundScores = {
      blue: state.game.revealedAssignments.blue.filter(([first, second]) =>
        normalizeName(first) === normalizeName(second)
      ).length,
      red: state.game.revealedAssignments.red.filter(([first, second]) =>
        normalizeName(first) === normalizeName(second)
      ).length
    };

    state.game.scores.blue += roundScores.blue;
    state.game.scores.red += roundScores.red;
    state.game.roundResults[state.game.roundIndex] = roundScores;

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

  revealAll(state, assignments) {
    if (state.game.id !== this.id ||
        !["ready-to-reveal", "revealing"].includes(state.game.status)) return false;

    const validTeamAssignments = (teamAssignments) =>
      Array.isArray(teamAssignments) && teamAssignments.length === 4 &&
      teamAssignments.every((pair) => Array.isArray(pair) && pair.length === 2 &&
        pair.every((value) => String(value || "").trim()));

    if (!validTeamAssignments(assignments?.blue) ||
        !validTeamAssignments(assignments?.red)) return false;

    let changed = false;
    for (const team of ["blue", "red"]) {
      if (state.game.revealedTeams[team]) continue;
      if (!this.revealTeam(state, team, assignments[team])) return false;
      changed = true;
    }
    return changed;
  },

  startNextRound(state) {
    if (state.game.id !== this.id || state.game.status !== "round-finished") return false;
    if (state.game.roundIndex >= MATCHING_GAME_ROUNDS.length - 1) return false;

    state.game.roundIndex += 1;
    state.game.activeTurnIndex = 0;
    state.game.submittedTeams = emptyTeamFlags();
    state.game.revealedTeams = emptyTeamFlags();
    state.game.revealedAssignments = emptyRevealedAssignments();
    state.game.status = "assigning";
    return true;
  }
};
