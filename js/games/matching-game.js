export const MATCHING_ASSIGNERS = [
  { id: "blue-1", team: "blue", playerIndex: 0, label: "Spieler 1 · Team Blau" },
  { id: "red-1", team: "red", playerIndex: 0, label: "Spieler 1 · Team Rot" },
  { id: "blue-2", team: "blue", playerIndex: 1, label: "Spieler 2 · Team Blau" },
  { id: "red-2", team: "red", playerIndex: 1, label: "Spieler 2 · Team Rot" }
];

export const MATCHING_TURNS = [
  { playerIndex: 0, label: "Spieler 1 beider Teams", team: null, assignerIndexes: [0, 1] },
  { playerIndex: 1, label: "Spieler 2 · Team Blau", team: "blue", assignerIndexes: [2] },
  { playerIndex: 1, label: "Spieler 2 · Team Rot", team: "red", assignerIndexes: [3] }
];

export function getMatchingTurn(roundIndex, activeTurnIndex) {
  const turnIndex = Math.min(
    Math.max(Number(activeTurnIndex) || 0, 0),
    MATCHING_TURNS.length - 1
  );
  const assigningPlayerIndex = Math.abs(Number(roundIndex) || 0) % 2;
  const matchingPlayerIndex = assigningPlayerIndex === 0 ? 1 : 0;
  const playerIndex = turnIndex === 0 ? assigningPlayerIndex : matchingPlayerIndex;
  const team = turnIndex === 0 ? null : turnIndex === 1 ? "blue" : "red";
  const assignerIndexes = turnIndex === 0
    ? [playerIndex * 2, playerIndex * 2 + 1]
    : [playerIndex * 2 + (team === "red" ? 1 : 0)];
  return {
    playerIndex,
    label: turnIndex === 0
      ? `Spieler ${playerIndex + 1} beider Teams`
      : `Spieler ${playerIndex + 1} · Team ${team === "blue" ? "Blau" : "Rot"}`,
    team,
    assignerIndexes,
    assignerIndex: assignerIndexes.length === 1 ? assignerIndexes[0] : null
  };
}

const IMAGE_ROOT = "./assets/images/da%20seh%20ich%20dich";

export const MATCHING_GAME_ROUNDS = [
  {
    id: "autos",
    title: "Autos",
    images: [
      { id: "audi", label: "Audi", src: `${IMAGE_ROOT}/autos/Audi_A3_8V_1.4_TFSI_Ambiente_Misanorot.webp` },
      { id: "cybertruck", label: "Cybertruck", src: `${IMAGE_ROOT}/autos/tesla-cybertruck_02-scaled.webp` },
      { id: "peel-p50", label: "Peel P50", src: `${IMAGE_ROOT}/autos/size-matters-the-peel-p50-is-still-the-ultimate-microcar-1476934523527.webp` },
      { id: "lambo", label: "Lamborghini", src: `${IMAGE_ROOT}/autos/images.webp` }
    ]
  },
  {
    id: "laender",
    title: "Länder",
    images: [
      { id: "amerika", label: "Amerika", src: `${IMAGE_ROOT}/l%C3%A4nder/NYC_GettyImages-755656809.webp` },
      { id: "frankreich", label: "Frankreich", src: `${IMAGE_ROOT}/l%C3%A4nder/33583-Eiffelturm_copyright_Ekaterina_Belova__AdobeStock.jpeg.webp` },
      { id: "mexiko", label: "Mexiko", src: `${IMAGE_ROOT}/l%C3%A4nder/top-10-sehenswuerdigkeiten-in-mexiko-stadt_zocalo-platz-kathedrale%20(1).webp` },
      { id: "tokio", label: "Tokio", src: `${IMAGE_ROOT}/l%C3%A4nder/tokyo_tokyo_japan_ss_1_9e77fab1aa%20(1).webp` }
    ]
  },
  {
    id: "unterkunft",
    title: "Unterkunft",
    images: [
      { id: "baumhaus", label: "Baumhaus", src: `${IMAGE_ROOT}/unterkunft/wooden-walkway-to-illuminated-tree-house-2022-03-04-02-32-20-utc1-scaled.webp` },
      { id: "bunt", label: "Bunt", src: `${IMAGE_ROOT}/unterkunft/08-little-india-singapur-g-470648561-jpg--74808-.webp` },
      { id: "modern", label: "Modern", src: `${IMAGE_ROOT}/unterkunft/kern-haus-futura-bauhaus-eingangsseite-abend.webp` },
      { id: "wohnwagen", label: "Wohnwagen", src: `${IMAGE_ROOT}/unterkunft/csm_DSC_1617_c8fe9e3891.webp` }
    ]
  },
  {
    id: "valo-maps",
    title: "Valorant-Maps",
    images: [
      { id: "abyss", label: "Abyss", src: `${IMAGE_ROOT}/valo%20maps/Loading_Screen_Abyss.webp` },
      { id: "breeze", label: "Breeze", src: `${IMAGE_ROOT}/valo%20maps/181545_Valorant%20breeze.webp` },
      { id: "fracture", label: "Fracture", src: `${IMAGE_ROOT}/valo%20maps/Loading_Screen_Fracture.webp` },
      { id: "icebox", label: "Icebox", src: `${IMAGE_ROOT}/valo%20maps/Loading_Screen_Icebox.webp` }
    ]
  }
];

function emptyScores() {
  return { blue: 0, red: 0 };
}

function emptyRevealedAssignments() {
  return { blue: null, red: null };
}

function remainingMatchingPoints(roundIndex) {
  return Math.max(MATCHING_GAME_ROUNDS.length - Number(roundIndex) - 1, 0) * 4;
}

function clinchedMatchingTeam(game) {
  const remainingPoints = remainingMatchingPoints(game.roundIndex);
  const blueMaximum = game.scores.blue + remainingPoints;
  const redMaximum = game.scores.red + remainingPoints;
  if (game.scores.blue > redMaximum) return "blue";
  if (game.scores.red > blueMaximum) return "red";
  return null;
}

function finishMatchingGame(state, winningTeam) {
  state.game.status = "finished";
  state.game.winningTeam = winningTeam;
  if (winningTeam) state.scores[winningTeam] += 1;
}

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("de");
}

export function areMatchingValuesUnique(values) {
  const selected = (values || []).map(normalizeName).filter(Boolean);
  return new Set(selected).size === selected.length;
}

export function getPrivateMatchingAssignments(roundAssignments, assignerIndex) {
  if (![0, 1, 2, 3].includes(Number(assignerIndex))) return [];
  return (roundAssignments || []).map((imageAssignments) =>
    String(imageAssignments?.[assignerIndex] || "")
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
  name: "Da seh ich dich",

  start(state, assignerOrder) {
    if (!Array.isArray(assignerOrder) || assignerOrder.length !== MATCHING_ASSIGNERS.length) {
      return false;
    }

    state.game = {
      id: this.id,
      status: "round-pending",
      roundIndex: 0,
      activeTurnIndex: 0,
      turnSubmitted: false,
      submittedTeams: { blue: false, red: false },
      revealedTeams: { blue: false, red: false },
      revealedAssignments: emptyRevealedAssignments(),
      scores: emptyScores(),
      roundResults: [],
      assignerOrder: assignerOrder.map((player) => ({
        id: player.id,
        name: player.name,
        team: player.team
      })),
      winningTeam: null,
      scoreSystemVersion: 3
    };
    return true;
  },

  startFirstRound(state) {
    if (state.game.id !== this.id || state.game.status !== "round-pending") return false;
    state.game.status = "assigning";
    return true;
  },

  normalize(state) {
    if (state.game.id !== this.id) return false;

    state.game.roundIndex = Math.min(
      Math.max(Number(state.game.roundIndex) || 0, 0),
      MATCHING_GAME_ROUNDS.length - 1
    );
    state.game.activeTurnIndex = Math.min(
      Math.max(Number(state.game.activeTurnIndex) || 0, 0),
      MATCHING_TURNS.length - 1
    );
    delete state.game.activeAssignerIndex;
    state.game.turnSubmitted = Boolean(state.game.turnSubmitted);
    state.game.submittedTeams = {
      blue: Boolean(state.game.submittedTeams?.blue),
      red: Boolean(state.game.submittedTeams?.red)
    };
    delete state.game.activeTeam;
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
    state.game.scoreSystemVersion = 3;
    return true;
  },

  submitTeam(state, team) {
    if (state.game.id !== this.id || state.game.status !== "assigning") return false;
    if (!["blue", "red"].includes(team)) return false;

    if (state.game.activeTurnIndex === 0) {
      if (state.game.submittedTeams[team]) return false;
      state.game.submittedTeams[team] = true;
      return true;
    }

    const turn = getMatchingTurn(state.game.roundIndex, state.game.activeTurnIndex);
    if (team !== turn.team || state.game.turnSubmitted) return false;

    state.game.turnSubmitted = true;
    return true;
  },

  completeTurn(state) {
    if (state.game.id !== this.id || state.game.status !== "assigning") return false;
    if (state.game.activeTurnIndex === 0) {
      if (!state.game.submittedTeams.blue || !state.game.submittedTeams.red) return false;
    } else if (!state.game.turnSubmitted) return false;

    if (state.game.activeTurnIndex < MATCHING_TURNS.length - 1) {
      state.game.activeTurnIndex += 1;
      state.game.turnSubmitted = false;
      return true;
    }

    state.game.status = "ready-to-reveal";
    state.game.turnSubmitted = false;
    return true;
  },

  revealAll(state, assignments) {
    if (state.game.id !== this.id || state.game.status !== "ready-to-reveal") return false;
    for (const team of ["blue", "red"]) {
      const teamAssignments = assignments?.[team];
      if (!Array.isArray(teamAssignments) || teamAssignments.length !== 4 ||
          teamAssignments.some((pair) => !Array.isArray(pair) || pair.length !== 2 ||
            pair.some((value) => !String(value || "").trim())) ||
          !areMatchingValuesUnique(teamAssignments.map((pair) => pair[0])) ||
          !areMatchingValuesUnique(teamAssignments.map((pair) => pair[1]))) return false;
      state.game.revealedAssignments[team] = teamAssignments.map((pair) =>
        pair.map((value) => String(value).trim())
      );
      state.game.revealedTeams[team] = true;
    }

    const roundScores = scoreMatchingAssignments(
      state.game.revealedAssignments.blue.map((bluePair, imageIndex) => [
        bluePair[0],
        state.game.revealedAssignments.red[imageIndex][0],
        bluePair[1],
        state.game.revealedAssignments.red[imageIndex][1]
      ])
    );

    state.game.scores.blue += roundScores.blue;
    state.game.scores.red += roundScores.red;
    state.game.roundResults[state.game.roundIndex] = roundScores;

    const clinchedTeam = clinchedMatchingTeam(state.game);
    if (clinchedTeam) {
      finishMatchingGame(state, clinchedTeam);
      return true;
    }

    if (state.game.roundIndex < MATCHING_GAME_ROUNDS.length - 1) {
      state.game.status = "round-finished";
      return true;
    }

    const winningTeam = state.game.scores.blue === state.game.scores.red
      ? null
      : state.game.scores.blue > state.game.scores.red ? "blue" : "red";
    finishMatchingGame(state, winningTeam);
    return true;
  },

  startNextRound(state) {
    if (state.game.id !== this.id || state.game.status !== "round-finished") return false;
    if (state.game.roundIndex >= MATCHING_GAME_ROUNDS.length - 1) return false;

    state.game.roundIndex += 1;
    state.game.activeTurnIndex = 0;
    state.game.turnSubmitted = false;
    state.game.submittedTeams = { blue: false, red: false };
    state.game.revealedTeams = { blue: false, red: false };
    state.game.revealedAssignments = emptyRevealedAssignments();
    state.game.status = "assigning";
    return true;
  }
};
