export const GERMANY_MAP_ROUNDS_TO_WIN = 4;

export const GERMANY_MAP_QUESTIONS = [
  {
    prompt: "Wo befindet sich die Sagrada Família?",
    answer: "Sagrada Família · Barcelona, Spanien",
    location: "Barcelona, Spanien",
    target: { lat: 41.4036, lng: 2.1744 }
  },
  {
    prompt: "Wo steht das Kolosseum?",
    answer: "Kolosseum · Rom, Italien",
    location: "Rom, Italien",
    target: { lat: 41.8902, lng: 12.4922 }
  },
  {
    prompt: "Wo befindet sich die Hauptstadt Polens?",
    answer: "Warschau · Polen",
    location: "Warschau, Polen",
    target: { lat: 52.2297, lng: 21.0122 }
  },
  {
    prompt: "Wo liegt die historische Altstadt von Dubrovnik, die auch als Kulisse für Game of Thrones diente?",
    answer: "Altstadt von Dubrovnik · Kroatien",
    location: "Dubrovnik, Kroatien",
    target: { lat: 42.6407, lng: 18.1083 }
  },
  {
    prompt: "Wo steht die Hagia Sophia, eine der historisch bedeutendsten Moscheen der Welt?",
    answer: "Hagia Sophia · Istanbul, Türkei",
    location: "Istanbul, Türkei",
    target: { lat: 41.0086, lng: 28.9802 }
  },
  {
    prompt: "Wo befindet sich Stonehenge?",
    answer: "Stonehenge · nahe Amesbury/Salisbury, England",
    location: "Amesbury/Salisbury, England",
    target: { lat: 51.1789, lng: -1.8262 }
  },
  {
    prompt: "Wo liegt das Atomium?",
    answer: "Atomium · Brüssel, Belgien",
    location: "Brüssel, Belgien",
    target: { lat: 50.8949, lng: 4.3416 }
  }
];

function emptyPins() {
  return { blue: null, red: null };
}

function emptyDistances() {
  return { blue: null, red: null };
}

function toRadians(value) {
  return value * Math.PI / 180;
}

export function distanceInKilometers(first, second) {
  const earthRadius = 6371;
  const latitudeDelta = toRadians(second.lat - first.lat);
  const longitudeDelta = toRadians(second.lng - first.lng);
  const firstLatitude = toRadians(first.lat);
  const secondLatitude = toRadians(second.lat);
  const haversine = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) * Math.cos(secondLatitude) *
    Math.sin(longitudeDelta / 2) ** 2;

  return earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export const germanyMapGame = {
  id: "germany-map",
  name: "Kartenwissen",

  start(state) {
    state.game = {
      id: this.id,
      status: "placing",
      roundIndex: 0,
      roundScores: { blue: 0, red: 0 },
      pins: emptyPins(),
      lockedTeams: { blue: false, red: false },
      distances: emptyDistances(),
      roundWinner: null,
      winningTeam: null,
      scoreSystemVersion: 2
    };
    return true;
  },

  normalize(state) {
    if (state.game.id !== this.id) return false;
    state.game.roundIndex = Math.min(
      Math.max(Number(state.game.roundIndex) || 0, 0),
      GERMANY_MAP_QUESTIONS.length - 1
    );
    state.game.roundScores = {
      blue: Number(state.game.roundScores?.blue) || 0,
      red: Number(state.game.roundScores?.red) || 0
    };
    state.game.pins ||= emptyPins();
    state.game.lockedTeams = {
      blue: Boolean(state.game.lockedTeams?.blue),
      red: Boolean(state.game.lockedTeams?.red)
    };
    state.game.distances ||= emptyDistances();
    state.game.roundWinner ||= null;
    state.game.winningTeam ||= null;
    state.game.scoreSystemVersion = 2;
    return true;
  },

  placePin(state, team, position) {
    if (state.game.id !== this.id || state.game.status !== "placing") return false;
    if (!["blue", "red"].includes(team) || state.game.lockedTeams?.[team]) return false;

    const lat = Number(position?.lat);
    const lng = Number(position?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    if (lat < 33 || lat > 72.5 || lng < -26 || lng > 46) return false;

    state.game.pins[team] = { lat, lng };
    return true;
  },

  lockTeam(state, team) {
    if (state.game.id !== this.id || state.game.status !== "placing") return false;
    if (!["blue", "red"].includes(team) || state.game.lockedTeams?.[team]) return false;
    if (!state.game.pins?.[team]) return false;
    state.game.lockedTeams[team] = true;
    return true;
  },

  revealRound(state) {
    if (state.game.id !== this.id || state.game.status !== "placing") return false;
    if (!state.game.pins.blue || !state.game.pins.red ||
        !state.game.lockedTeams.blue || !state.game.lockedTeams.red) return false;

    const question = GERMANY_MAP_QUESTIONS[state.game.roundIndex];
    const blueDistance = distanceInKilometers(state.game.pins.blue, question.target);
    const redDistance = distanceInKilometers(state.game.pins.red, question.target);
    const winner = blueDistance <= redDistance ? "blue" : "red";

    state.game.distances = { blue: blueDistance, red: redDistance };
    state.game.roundWinner = winner;
    state.game.roundScores[winner] += 1;
    state.game.status = "revealed";
    return true;
  },

  startNextRound(state) {
    if (state.game.id !== this.id || state.game.status !== "revealed") return false;

    const winner = ["blue", "red"].find(
      (team) => state.game.roundScores[team] >= GERMANY_MAP_ROUNDS_TO_WIN
    );
    const lastQuestionPlayed = state.game.roundIndex >= GERMANY_MAP_QUESTIONS.length - 1;

    if (winner || lastQuestionPlayed) {
      state.game.status = "finished";
      state.game.winningTeam = winner ||
        (state.game.roundScores.blue > state.game.roundScores.red ? "blue" : "red");
      state.scores[state.game.winningTeam] += 1;
      return true;
    }

    state.game.roundIndex += 1;
    state.game.status = "placing";
    state.game.pins = emptyPins();
    state.game.lockedTeams = { blue: false, red: false };
    state.game.distances = emptyDistances();
    state.game.roundWinner = null;
    return true;
  }
};
