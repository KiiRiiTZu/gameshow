export const ESTIMATION_QUESTIONS = [
  {
    prompt: "Bei wie vielen Stunden liegt der Weltrekord im Wachbleiben?",
    answer: 264.2,
    answerDisplay: "264 Stunden 12 Minuten",
    moderatorHint: ""
  },
  {
    prompt: "Wie hoch ist der Eiffelturm?",
    answer: 330,
    answerDisplay: "330 m",
    moderatorHint: "Vor März 2022 war er noch kürzer; die neue Antenne erhöhte ihn um 6 Meter."
  },
  {
    prompt: "Wie viele Liter Kunstblut wurden für Kill Bill 1 und 2 verwendet?",
    answer: 1700,
    answerDisplay: "1.700 Liter",
    moderatorHint: ""
  },
  {
    prompt: "Wie viele Tage verbringt ein Deutscher in seinem Leben durchschnittlich auf dem Klo?",
    answer: 230,
    answerDisplay: "230 Tage",
    moderatorHint: "Berechnet mit einer Lebenserwartung von 81 Jahren."
  },
  {
    prompt: "Wie viele Zähne hat ein Eisbär?",
    answer: 42,
    answerDisplay: "42 Zähne",
    moderatorHint: ""
  },
  {
    prompt: "Wie oft entsperren wir am Tag unser Handy?",
    answer: 53,
    answerDisplay: "53-mal",
    moderatorHint: "Studie mit 60.000 Personen mithilfe der App Menthal der Universität Bonn."
  },
  {
    prompt: "Wie viele Einkerbungen hat ein Golfball?",
    answer: 336,
    answerDisplay: "336 Einkerbungen",
    moderatorHint: ""
  },
  {
    prompt: "Welcher Breitengrad läuft durch Berlin?",
    answer: 52,
    answerDisplay: "52. Breitengrad",
    moderatorHint: ""
  },
  {
    prompt: "Wie viel darf ein Boxer der Fliegengewichtsklasse maximal wiegen?",
    answer: 51,
    answerDisplay: "51 kg",
    moderatorHint: ""
  },
  {
    prompt: "Wie viele Kilometer misst der Äquator?",
    answer: 40075,
    answerDisplay: "40.075 km",
    moderatorHint: ""
  },
  {
    prompt: "Wie viele Zeitzonen hat Russland?",
    answer: 11,
    answerDisplay: "11 Zeitzonen",
    moderatorHint: ""
  },
  {
    prompt: "Wie lange dauerte der Bau des Kölner Doms?",
    answer: 632,
    answerDisplay: "632 Jahre",
    moderatorHint: ""
  },
  {
    prompt: "Wie lang war der längste nach wissenschaftlichen Methoden vermessene Blauwal?",
    answer: 33.58,
    answerDisplay: "33,58 m",
    moderatorHint: ""
  },
  {
    prompt: "Auf welcher Höhe hängt ein Basketballkorb?",
    answer: 3.05,
    answerDisplay: "3,05 m",
    moderatorHint: ""
  },
  {
    prompt: "In welchem Jahr wurde das erste Automobil erfunden?",
    answer: 1886,
    answerDisplay: "1886",
    moderatorHint: ""
  }
];

export function getEstimationQuestion(index) {
  return ESTIMATION_QUESTIONS[Math.min(
    Math.max(Number(index) || 0, 0),
    ESTIMATION_QUESTIONS.length - 1
  )];
}
