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

export function createRoomStateFromRecords(roomCode, room, playerRecords = []) {
  const persistedGame = room.game_state &&
    typeof room.game_state === "object" &&
    room.game_state.id === room.current_game
    ? room.game_state
    : null;

  const state = {
    roomCode,
    scores: {
      blue: room.blue_score ?? 0,
      red: room.red_score ?? 0
    },
    players: [],
    game: persistedGame || {
      id: room.current_game || "buzzer",
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
        : null
    }
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
