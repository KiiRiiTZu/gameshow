import test from "node:test";
import assert from "node:assert/strict";

import {
  CONFETTI_PARTICLE_COUNT,
  advanceConfetti,
  createConfettiParticles,
  getConfettiPalette
} from "../js/confetti.js";
import {
  GAME_SEQUENCE,
  getGamePresentation,
  getOverviewGameView,
  getTeamLabel
} from "../js/game-effects.js";

const VIEWPORT = { width: 1280, height: 720 };

function newParticles(team = "blue") {
  return createConfettiParticles(VIEWPORT.width, VIEWPORT.height, getConfettiPalette(team));
}

test("uses a distinct confetti palette per team", () => {
  const blue = getConfettiPalette("blue");
  const red = getConfettiPalette("red");

  assert.ok(blue.includes("#5a72f6"), "Blau enthält die Teamfarbe");
  assert.ok(red.includes("#e14c65"), "Rot enthält die Teamfarbe");
  assert.notDeepEqual(blue, red);
  // Unbekannte oder fehlende Teams bekommen eine neutrale Palette statt zu scheitern.
  assert.ok(getConfettiPalette(null).length > 0);
  assert.ok(getConfettiPalette("gruen").length > 0);
});

test("fires confetti from both lower corners toward the middle", () => {
  const particles = newParticles();

  assert.equal(particles.length, CONFETTI_PARTICLE_COUNT);
  assert.ok(particles.every((item) => item.y > VIEWPORT.height * 0.9), "startet am unteren Rand");
  assert.ok(particles.every((item) => item.vy < 0), "fliegt zuerst nach oben");

  const fromLeft = particles.filter((item) => item.x < VIEWPORT.width / 2);
  const fromRight = particles.filter((item) => item.x > VIEWPORT.width / 2);
  assert.equal(fromLeft.length, CONFETTI_PARTICLE_COUNT / 2);
  assert.equal(fromRight.length, CONFETTI_PARTICLE_COUNT / 2);
  assert.ok(fromLeft.every((item) => item.vx > 0), "linke Kanone schießt nach rechts");
  assert.ok(fromRight.every((item) => item.vx < 0), "rechte Kanone schießt nach links");
});

test("lets confetti rise before gravity pulls it down again", () => {
  const particles = newParticles();
  const startY = particles.map((item) => item.y);
  // Der Scheitelpunkt liegt je nach Startgeschwindigkeit bei rund 55 Schritten,
  // deshalb wird er über den ganzen Lauf gemessen statt zu einem festen Zeitpunkt.
  const peakY = [...startY];

  for (let step = 0; step < 400; step += 1) {
    advanceConfetti(particles, VIEWPORT.height);
    particles.forEach((item, index) => {
      peakY[index] = Math.min(peakY[index], item.y);
    });
  }

  // Die Schwelle richtet sich nach der langsamsten möglichen Flocke: Startspeed 13
  // im flachsten Winkel steigt rund 85 Pixel. Ein engerer Wert macht den Test flaky,
  // weil die Startwerte zufällig sind.
  const rise = peakY.map((value, index) => startY[index] - value);
  assert.ok(Math.min(...rise) > 40, `jede Flocke steigt (kleinster Anstieg: ${Math.round(Math.min(...rise))}px)`);
  assert.ok(Math.max(...rise) > 400, "die schnellsten Flocken fliegen weit nach oben");
  assert.ok(
    particles.every((item, index) => item.y > peakY[index]),
    "und jede fällt anschließend wieder unter ihren Scheitelpunkt"
  );
});

test("ends the confetti run once every flake left the viewport", () => {
  const particles = newParticles();

  let visible = CONFETTI_PARTICLE_COUNT;
  let steps = 0;
  while (visible > 0 && steps < 2000) {
    visible = advanceConfetti(particles, VIEWPORT.height);
    steps += 1;
  }

  assert.equal(visible, 0, "der Lauf endet von selbst");
  assert.ok(steps < 2000, `braucht ${steps} Schritte und läuft nicht endlos`);
});

test("names every game of the active sequence for the transition card", () => {
  const sequence = [
    ["estimation-game", 1, "Mittelwert"],
    ["guess-the-price", 2, "Thrifty"],
    ["germany-map", 3, "Kartenwissen"],
    ["word-match-game", 4, "Begriffsmatch"],
    ["ranking-game", 5, "Einordnen"],
    ["matching-game", 6, "Da seh ich dich"],
    ["buzzer", 7, "Buzzer Quiz"]
  ];

  for (const [gameId, number, name] of sequence) {
    assert.deepEqual(getGamePresentation(gameId), { number, name }, gameId);
  }
  // Unbekannte Spiele dürfen die Karte nicht sprengen.
  assert.deepEqual(getGamePresentation("gibt-es-nicht"), { number: "?", name: "Nächstes Spiel" });
});

test("labels both teams and falls back on a draw", () => {
  assert.equal(getTeamLabel("blue"), "Team Blau");
  assert.equal(getTeamLabel("red"), "Team Rot");
  assert.equal(getTeamLabel(null), "Kein Team");
});

test("lists the seven active games in playing order", () => {
  assert.deepEqual(GAME_SEQUENCE, [
    "estimation-game",
    "guess-the-price",
    "germany-map",
    "word-match-game",
    "ranking-game",
    "matching-game",
    "buzzer"
  ]);
  // Das Bankspiel Top 20 gehört nicht zur aktiven Reihenfolge.
  assert.ok(!GAME_SEQUENCE.includes("spotify-top-artists"));
  assert.equal(new Set(GAME_SEQUENCE).size, GAME_SEQUENCE.length, "keine Dopplungen");
});

test("keeps the name of an unplayed game hidden from the overview", () => {
  const results = [{ gameId: "estimation-game", team: "blue" }];

  const gespielt = getOverviewGameView("estimation-game", 0, results);
  assert.equal(gespielt.played, true);
  assert.equal(gespielt.name, "Mittelwert", "gespielte Spiele zeigen ihren Namen");

  // Kein Feld der noch offenen Spiele darf den Namen preisgeben.
  const offen = GAME_SEQUENCE.slice(1).map((gameId, index) =>
    getOverviewGameView(gameId, index + 1, results));
  assert.ok(offen.every((view) => view.played === false));
  assert.ok(offen.every((view) => view.name === null), "offene Spiele bleiben namenlos");
  assert.ok(offen.every((view) => view.winner === null));
});

test("shows the name of a drawn game even though no team won it", () => {
  const view = getOverviewGameView("guess-the-price", 1, [
    { gameId: "guess-the-price", team: null }
  ]);

  assert.equal(view.played, true, "ein Unentschieden ist gespielt");
  assert.equal(view.name, "Thrifty");
  assert.equal(view.winner, null, "bleibt aber ohne Teamfarbe");
  assert.equal(view.highlighted, false);
});

test("highlights only the game that was just won", () => {
  const results = [
    { gameId: "estimation-game", team: "blue" },
    { gameId: "guess-the-price", team: "red" }
  ];

  assert.equal(getOverviewGameView("guess-the-price", 1, results, "guess-the-price").highlighted, true);
  assert.equal(getOverviewGameView("estimation-game", 0, results, "guess-the-price").highlighted, false);
  // Ein noch nicht gespieltes Spiel blinkt nicht, auch wenn es benannt wird.
  assert.equal(getOverviewGameView("buzzer", 6, results, "buzzer").highlighted, false);
});
