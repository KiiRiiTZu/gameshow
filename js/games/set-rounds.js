const card = (shape, color, fill, count) => ({ shape, color, fill, count });

const example = [
  card("oval", "red", "open", 2), card("oval", "green", "open", 2), card("oval", "blue", "solid", 2),
  card("diamond", "red", "open", 1), card("rectangle", "green", "open", 2), card("oval", "blue", "open", 3),
  card("rectangle", "red", "solid", 3), card("rectangle", "blue", "striped", 2), card("diamond", "blue", "solid", 2),
  card("diamond", "green", "striped", 2), card("rectangle", "red", "striped", 1), card("rectangle", "green", "solid", 3)
];

const round2 = [
  card("rectangle", "green", "striped", 1), card("oval", "blue", "open", 1), card("rectangle", "green", "open", 2),
  card("rectangle", "green", "solid", 1), card("diamond", "blue", "open", 1), card("rectangle", "green", "striped", 2),
  card("oval", "green", "open", 3), card("diamond", "red", "solid", 3), card("oval", "green", "open", 1),
  card("diamond", "blue", "striped", 2), card("diamond", "green", "open", 2), card("oval", "blue", "striped", 2)
];

const round3 = [
  card("rectangle", "blue", "open", 1), card("oval", "green", "solid", 2), card("rectangle", "red", "striped", 1),
  card("oval", "red", "open", 3), card("oval", "blue", "striped", 2), card("oval", "blue", "striped", 3),
  card("oval", "green", "open", 2), card("diamond", "green", "striped", 2), card("rectangle", "green", "open", 2),
  card("oval", "red", "open", 2), card("diamond", "green", "open", 1), card("rectangle", "blue", "striped", 3)
];

const round5 = [
  card("rectangle", "green", "striped", 3), card("oval", "red", "solid", 2), card("diamond", "blue", "striped", 3),
  card("diamond", "blue", "open", 1), card("rectangle", "blue", "open", 2), card("oval", "red", "striped", 1),
  card("rectangle", "blue", "striped", 1), card("diamond", "red", "solid", 2), card("rectangle", "red", "striped", 2),
  card("rectangle", "blue", "open", 3), card("oval", "green", "striped", 2), card("rectangle", "red", "open", 2)
];

const round7 = [
  card("diamond", "red", "striped", 2), card("rectangle", "blue", "solid", 3), card("diamond", "green", "striped", 3),
  card("rectangle", "blue", "striped", 2), card("diamond", "green", "solid", 2), card("diamond", "blue", "striped", 2),
  card("oval", "red", "striped", 2), card("oval", "blue", "striped", 2), card("diamond", "red", "solid", 3),
  card("rectangle", "green", "open", 2), card("diamond", "red", "solid", 2), card("diamond", "green", "solid", 1)
];

const round8 = [
  card("rectangle", "green", "striped", 2), card("oval", "red", "open", 1), card("rectangle", "red", "striped", 2),
  card("oval", "red", "open", 3), card("diamond", "green", "striped", 2), card("rectangle", "red", "striped", 3),
  card("diamond", "red", "open", 3), card("oval", "green", "solid", 2), card("diamond", "red", "striped", 1),
  card("oval", "blue", "open", 2), card("oval", "green", "striped", 1), card("diamond", "blue", "striped", 2)
];

const round9 = [
  card("oval", "green", "open", 2), card("rectangle", "green", "open", 1), card("oval", "green", "solid", 1),
  card("rectangle", "blue", "striped", 3), card("rectangle", "green", "open", 2), card("oval", "blue", "solid", 2),
  card("diamond", "red", "open", 3), card("oval", "red", "open", 2), card("diamond", "red", "striped", 2),
  card("diamond", "green", "striped", 2), card("rectangle", "red", "striped", 1), card("rectangle", "green", "solid", 3)
];

const round10 = [
  card("oval", "green", "open", 1), card("oval", "blue", "open", 2), card("oval", "green", "solid", 3),
  card("rectangle", "blue", "striped", 1), card("oval", "green", "open", 3), card("diamond", "green", "solid", 3),
  card("rectangle", "red", "solid", 2), card("oval", "blue", "striped", 1), card("diamond", "red", "open", 1),
  card("diamond", "blue", "open", 1), card("oval", "blue", "open", 1), card("diamond", "green", "open", 3)
];

export const SET_ROUNDS = [
  { title: "Beispielrunde", example: true, cards: example },
  { title: "Runde 1", cards: round2 },
  { title: "Runde 2", cards: round3 },
  { title: "Runde 3", cards: round3 },
  { title: "Runde 4", cards: round5 },
  { title: "Runde 5", cards: round5 },
  { title: "Runde 6", cards: round7 },
  { title: "Runde 7", cards: round8 },
  { title: "Runde 8", cards: round9 },
  { title: "Runde 9", cards: round10 }
];

export function getSetRound(index) {
  return SET_ROUNDS[Math.min(Math.max(Number(index) || 0, 0), SET_ROUNDS.length - 1)];
}
