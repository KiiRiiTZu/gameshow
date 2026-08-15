export const BUZZER_QUESTIONS = [
  { question: "Wie heißt das aktuell höchste Hochhaus der Welt?", answer: "Burj Khalifa · 828 m" },
  { question: "Was ist das leichteste bisher entdeckte Element?", answer: "Wasserstoff" },
  { question: "Wie viele unterschiedliche Euromünzen gibt es?", answer: "8 · 1, 2, 5, 10, 20 und 50 Cent sowie 1 und 2 Euro" },
  { question: "In welchem Jahr wurde der Euro als Bargeld eingeführt?", answer: "2002" },
  { question: "Wie oft wurde Deutschland Fußballweltmeister und wann zum ersten Mal?", answer: "Viermal · erstmals 1954" },
  { question: "Wer ist aktuell der reichste Mensch der Welt?", answer: "Elon Musk" },
  { question: "In welchem Jahr starb Michael Jackson?", answer: "2009" },
  { question: "Was ist das flächenmäßig größte Land der Erde?", answer: "Russland" },
  { question: "Welches chemische Symbol hat Gold im Periodensystem?", answer: "Au · Aurum" },
  { question: "Wie lautet die Maßeinheit des elektrischen Widerstands?", answer: "Ohm" },
  { question: "Welches Gerät registriert die Erschütterungen eines Erdbebens?", answer: "Seismograph" },
  { question: "Wann kam das erste iPhone auf den Markt?", answer: "2007" },
  { question: "Was ist ein Ornithologe?", answer: "Ein Vogelkundler" }
];

export function getBuzzerQuestion(index = 0) {
  const normalizedIndex = Math.max(0, Number(index) || 0) % BUZZER_QUESTIONS.length;
  return BUZZER_QUESTIONS[normalizedIndex];
}
