export const GERMANY_MAP_ROUNDS_TO_WIN = 4;

export const GERMANY_MAP_QUESTIONS = [
  {
    prompt: "Wo findet jährlich das nach Besucherzahlen größte Volksfest Deutschlands statt?",
    answer: "Oktoberfest · München",
    target: { lat: 48.1315, lng: 11.5497 }
  },
  {
    prompt: "Hannover",
    answer: "Hannover",
    target: { lat: 52.3759, lng: 9.7320 }
  },
  {
    prompt: "Wo wurde Ludwig van Beethoven geboren?",
    answer: "Bonn",
    target: { lat: 50.7374, lng: 7.0982 }
  },
  {
    prompt: "Wo befindet sich Schloss Neuschwanstein?",
    answer: "Schloss Neuschwanstein · Schwangau",
    target: { lat: 47.5576, lng: 10.7498 }
  },
  {
    prompt: "Wo befindet sich Deutschlands älteste Universität, gegründet 1386?",
    answer: "Heidelberg",
    target: { lat: 49.4094, lng: 8.6947 }
  },
  {
    prompt: "Wo steht das Brandenburger Tor?",
    answer: "Berlin",
    target: { lat: 52.5163, lng: 13.3777 }
  },
  {
    prompt: "Wo liegt laut der Deutschen Zentrale für Tourismus die beliebteste deutsche Sehenswürdigkeit?",
    answer: "Miniatur Wunderland · Hamburg",
    target: { lat: 53.5439, lng: 9.9890 }
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
    if (lat < 47 || lat > 55.2 || lng < 5.5 || lng > 15.6) return false;

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
