import { HITSTER_SONGS } from "./hitster-songs.js";

export const HITSTER_SECONDS = 120;
export const HITSTER_MAX_MISTAKES = 2;
const otherTeam = (team) => team === "blue" ? "red" : "blue";

function finish(state, loser) {
  state.game.status = "finished";
  state.game.phaseEndsAt = null;
  state.game.winningTeam = otherTeam(loser);
  state.scores[state.game.winningTeam] += 1;
}

export const hitsterGame = {
  id: "hitster", name: "Hitster",
  start(state) {
    state.game = { id: this.id, status: "not-started", roundIndex: 0, phaseEndsAt: null,
      timelines: { blue: [{ songIndex: 0 }], red: [{ songIndex: 0 }] },
      submissions: { blue: null, red: null }, mistakes: { blue: 0, red: 0 },
      revealedTeams: [], winningTeam: null, scoreSystemVersion: 1 };
    return true;
  },
  startRound(state, now = Date.now()) {
    if (state.game.id !== this.id || !["not-started", "round-finished"].includes(state.game.status)) return false;
    if (state.game.status === "round-finished") state.game.roundIndex += 1;
    if (!HITSTER_SONGS[state.game.roundIndex + 1]) return false;
    state.game.status = "playing"; state.game.phaseEndsAt = now + HITSTER_SECONDS * 1000;
    state.game.submissions = { blue: null, red: null }; state.game.revealedTeams = [];
    return true;
  },
  submit(state, team, position) {
    if (state.game.id !== this.id || state.game.status !== "playing" || !["blue", "red"].includes(team)) return false;
    const max = state.game.timelines[team].length;
    if (!Number.isInteger(position) || position < 0 || position > max) return false;
    state.game.submissions[team] = position;
    return true;
  },
  closeRound(state) {
    if (state.game.id !== this.id || state.game.status !== "playing") return false;
    state.game.status = "review"; state.game.phaseEndsAt = null; return true;
  },
  revealTeam(state, team) {
    if (state.game.id !== this.id || state.game.status !== "review" || state.game.revealedTeams.includes(team)) return false;
    const position = state.game.submissions[team];
    const timeline = state.game.timelines[team]; const songIndex = state.game.roundIndex + 1;
    const year = HITSTER_SONGS[songIndex].year;
    const ordered = timeline.map((item) => HITSTER_SONGS[item.songIndex].year);
    const correct = Number.isInteger(position) && (position === 0 || ordered[position - 1] <= year) && (position === ordered.length || year <= ordered[position]);
    if (correct) timeline.splice(position, 0, { songIndex }); else state.game.mistakes[team] += 1;
    state.game.revealedTeams.push(team);
    if (state.game.mistakes[team] >= HITSTER_MAX_MISTAKES) finish(state, team);
    else if (state.game.revealedTeams.length === 2) state.game.status = "round-finished";
    return true;
  },
  normalize(state) { return state.game.id === this.id; }
};
