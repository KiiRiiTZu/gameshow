export const TEAM_CAPACITY = 2;
export const SCORE_SYSTEM_VERSION = 2;
export const SHOW_WINNING_SCORE = 4;

export function getShowWinner(state) {
  if ((Number(state?.scores?.blue) || 0) >= SHOW_WINNING_SCORE) return "blue";
  if ((Number(state?.scores?.red) || 0) >= SHOW_WINNING_SCORE) return "red";
  return null;
}

function emptyTeamScores() {
  return { blue: 0, red: 0 };
}

function createInitialGame() {
  return {
    id: "estimation-game",
    status: "not-started",
    roundIndex: 0,
    roundScores: emptyTeamScores(),
    participants: [],
    lockedPlayerIds: [],
    questionPrompt: "",
    averages: null,
    revealed: null,
    roundResults: [],
    winningTeam: null,
    scoreSystemVersion: SCORE_SYSTEM_VERSION
  };
}

function normalizeTeamScores(scores) {
  return {
    blue: Number(scores?.blue) || 0,
    red: Number(scores?.red) || 0
  };
}

function upgradePersistedGameScores(game, legacyScores) {
  if (!game || game.scoreSystemVersion === SCORE_SYSTEM_VERSION) return game;

  const upgradedGame = {
    ...game,
    scoreSystemVersion: SCORE_SYSTEM_VERSION
  };

  if (game.id === "buzzer") {
    upgradedGame.scores = normalizeTeamScores(legacyScores);
  }

  return upgradedGame;
}

function inferCompletedGameScores(game, legacyScores) {
  const matchScores = emptyTeamScores();

  if (game.id === "buzzer") {
    if (game.status === "finished" && game.winningTeam) matchScores[game.winningTeam] = 1;
    return matchScores;
  }

  const previousWinner = legacyScores.blue > legacyScores.red
    ? "blue"
    : legacyScores.red > legacyScores.blue
      ? "red"
      : null;

  if (previousWinner) matchScores[previousWinner] += 1;
  if (game.status === "finished" && game.winningTeam) matchScores[game.winningTeam] += 1;
  return matchScores;
}

export function generateRoomCode(length = 4) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}

export function normalizeRoomCode(value) {
  return String(value || "").trim().toUpperCase();
}

export function createInitialRoomState(roomCode) {
  return {
    roomCode,
    scores: emptyTeamScores(),
    players: [],
    game: createInitialGame()
  };
}

export function createRoomStateFromRecords(roomCode, room, playerRecords = []) {
  const persistedGame = room.game_state &&
    typeof room.game_state === "object" &&
    room.game_state.id === room.current_game
    ? room.game_state
    : null;

  const legacyScores = normalizeTeamScores({
    blue: room.blue_score,
    red: room.red_score
  });
  const fallbackGame = room.current_game === "estimation-game" || !room.current_game
    ? { ...createInitialGame(), status: room.game_status || "not-started" }
    : {
    id: room.current_game,
    status: room.game_status || "waiting",
    winner: room.buzzer_winner_id
      ? {
          playerId: room.buzzer_winner_id,
          playerName: room.buzzer_winner_name,
          team: room.buzzer_winner_team
        }
      : null,
    winningTeam: room.game_status === "finished"
      ? (room.blue_score >= room.red_score ? "blue" : "red")
      : null,
    scores: emptyTeamScores(),
    scoreSystemVersion: SCORE_SYSTEM_VERSION
  };
  const game = persistedGame || fallbackGame;
  const isLegacyPersistedGame = Boolean(persistedGame) &&
    persistedGame.scoreSystemVersion !== SCORE_SYSTEM_VERSION;

  const state = {
    roomCode,
    scores: isLegacyPersistedGame
      ? inferCompletedGameScores(game, legacyScores)
      : legacyScores,
    players: [],
    game: isLegacyPersistedGame
      ? upgradePersistedGameScores(game, legacyScores)
      : game
  };

  for (const record of playerRecords) {
    const player = {
      id: record.id,
      name: record.name,
      team: record.team
    };

    if (!player.id || !player.name || !["blue", "red"].includes(player.team)) continue;
    addOrUpdatePlayer(state, player);
  }

  return state;
}

export function countTeamPlayers(state, team) {
  return state.players.filter((player) => player.team === team).length;
}

export function teamHasSpace(state, team) {
  return countTeamPlayers(state, team) < TEAM_CAPACITY;
}

export function addOrUpdatePlayer(state, incomingPlayer) {
  const existingIndex = state.players.findIndex((player) => player.id === incomingPlayer.id);

  if (existingIndex >= 0) {
    const existingPlayer = state.players[existingIndex];
    const changesTeam = existingPlayer.team !== incomingPlayer.team;

    if (changesTeam && !teamHasSpace(state, incomingPlayer.team)) return false;

    state.players[existingIndex] = { ...state.players[existingIndex], ...incomingPlayer };
    return true;
  }

  if (!teamHasSpace(state, incomingPlayer.team)) return false;

  state.players.push(incomingPlayer);
  return true;
}
