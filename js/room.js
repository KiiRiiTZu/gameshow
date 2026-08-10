export const TEAM_CAPACITY = 2;

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
    scores: { blue: 0, red: 0 },
    players: [],
    game: {
      id: "buzzer",
      status: "waiting",
      winner: null
    }
  };
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
    state.players[existingIndex] = { ...state.players[existingIndex], ...incomingPlayer };
    return true;
  }

  if (!teamHasSpace(state, incomingPlayer.team)) return false;

  state.players.push(incomingPlayer);
  return true;
}
