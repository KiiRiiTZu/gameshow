export const SPOTIFY_SLOT_COUNT = 20;
export const SPOTIFY_MAX_STRIKES = 3;
const SCORE_SYSTEM_VERSION = 2;

function otherTeam(team) {
  return team === "blue" ? "red" : "blue";
}

export const spotifyTopArtistsGame = {
  id: "spotify-top-artists",
  name: "Spotify Top 20",

  start(state, startingTeam = "blue") {
    state.game = {
      id: this.id,
      status: "playing",
      currentTeam: startingTeam,
      slots: Array.from({ length: SPOTIFY_SLOT_COUNT }, () => null),
      strikes: { blue: 0, red: 0 },
      winningTeam: null,
      scoreSystemVersion: SCORE_SYSTEM_VERSION
    };
  },

  recordHit(state, artist, rank) {
    if (state.game.id !== this.id || state.game.status !== "playing") return false;

    const normalizedArtist = String(artist || "").trim();
    const slotIndex = Number(rank) - 1;

    if (!normalizedArtist || !Number.isInteger(slotIndex)) return false;
    if (slotIndex < 0 || slotIndex >= SPOTIFY_SLOT_COUNT) return false;
    if (state.game.slots[slotIndex]) return false;

    const duplicate = state.game.slots.some(
      (slot) => slot?.artist.toLocaleLowerCase("de") === normalizedArtist.toLocaleLowerCase("de")
    );

    if (duplicate) return false;

    state.game.slots[slotIndex] = {
      artist: normalizedArtist,
      team: state.game.currentTeam
    };
    state.game.currentTeam = otherTeam(state.game.currentTeam);
    return true;
  },

  recordMiss(state) {
    if (state.game.id !== this.id || state.game.status !== "playing") return false;

    const losingTeam = state.game.currentTeam;
    state.game.strikes[losingTeam] += 1;

    if (state.game.strikes[losingTeam] >= SPOTIFY_MAX_STRIKES) {
      state.game.status = "finished";
      state.game.winningTeam = otherTeam(losingTeam);
      state.scores[state.game.winningTeam] += 1;
      return true;
    }

    state.game.currentTeam = otherTeam(losingTeam);
    return true;
  }
};
