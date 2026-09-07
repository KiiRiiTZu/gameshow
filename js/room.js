export const TEAM_CAPACITY = 2;
export const SCORE_SYSTEM_VERSION = 2;
export const SHOW_WINNING_SCORE = 4;

/**
 * Frühere Spiel-Ids, die noch in rooms.current_game und in gespeicherten
 * Spielzuständen stehen können. Die Namen wurden angeglichen, weil sie nicht
 * mehr zum Inhalt passten: "germany-map" fragt längst nach Barcelona, Rom und
 * Istanbul, und "spotify-top-artists" spielt drei Listen, von denen nur eine
 * von Spotify kommt.
 */
const LEGACY_GAME_IDS = {
  "germany-map": "europe-map",
  "spotify-top-artists": "top-20"
};

export function normalizeGameId(gameId) {
  return LEGACY_GAME_IDS[gameId] || gameId;
}

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
    gameResults: [],
    game: createInitialGame()
  };
}

/**
 * Hält fest, welches Team welches Spiel gewonnen hat. Die Gesamtwertung in
 * state.scores zählt nur, sie weiss nicht welches Spiel — für die Punkteübersicht
 * wird aber genau diese Zuordnung gebraucht.
 * Ein bereits erfasstes Spiel wird überschrieben, damit eine Korrektur des
 * Moderators keinen zweiten Eintrag erzeugt.
 */
export function recordGameResult(state, gameId, team) {
  if (!state || !gameId) return false;
  state.gameResults ||= [];

  const winner = ["blue", "red"].includes(team) ? team : null;
  const existing = state.gameResults.find((entry) => entry.gameId === gameId);

  if (existing) {
    if (existing.team === winner) return false;
    existing.team = winner;
    return true;
  }

  state.gameResults.push({ gameId, team: winner });
  return true;
}

export function normalizeGameResults(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const results = [];
  for (const entry of value) {
    // Historien aus der Zeit vor der Umbenennung tragen noch die alten Ids.
    const gameId = normalizeGameId(String(entry?.gameId || ""));
    if (!gameId || seen.has(gameId)) continue;
    seen.add(gameId);
    results.push({
      gameId,
      team: ["blue", "red"].includes(entry?.team) ? entry.team : null
    });
  }
  return results;
}

export function createRoomStateFromRecords(roomCode, room, playerRecords = []) {
  // Räume aus der Zeit vor der Umbenennung tragen noch die alten Spiel-Ids.
  const currentGame = normalizeGameId(room.current_game);
  const persistedGame = room.game_state &&
    typeof room.game_state === "object" &&
    normalizeGameId(room.game_state.id) === currentGame
    ? { ...room.game_state, id: currentGame }
    : null;

  const legacyScores = normalizeTeamScores({
    blue: room.blue_score,
    red: room.red_score
  });
  const fallbackGame = currentGame === "estimation-game" || !currentGame
    ? { ...createInitialGame(), status: room.game_status || "not-started" }
    : {
    id: currentGame,
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
    gameResults: normalizeGameResults(room.game_results),
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

function comparablePlayerName(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * Sucht den Platz, den ein zurückkehrender Spieler wieder einnehmen darf.
 *
 * Verliert jemand seine Spieler-Id — anderes Gerät, gelöschte Browserdaten,
 * privates Fenster —, bekäme er sonst entweder "Dieses Team ist bereits voll"
 * oder, wenn im Team noch Platz ist, einen zweiten Eintrag unter demselben
 * Namen neben seiner eigenen Karteileiche. Name und Team identifizieren den
 * Platz; Namen sind ohnehin schon eindeutig, weil "Da seh ich dich" sie zur
 * Zuordnung benutzt.
 */
export function findReclaimableSeat(state, incomingPlayer) {
  const name = comparablePlayerName(incomingPlayer?.name);
  if (!name || !["blue", "red"].includes(incomingPlayer?.team)) return null;

  return state.players.find((player) =>
    player.id !== incomingPlayer.id &&
    player.team === incomingPlayer.team &&
    comparablePlayerName(player.name) === name
  ) || null;
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
