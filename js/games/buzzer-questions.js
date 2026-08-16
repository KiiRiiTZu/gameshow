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
  { question: "Was ist ein Ornithologe?", answer: "Ein Vogelkundler" },
  { question: "Wofür steht die Abkürzung USB?", answer: "Universal Serial Bus" },
  { question: "Wie heißt der kleinste Planet in unserem Sonnensystem?", answer: "Merkur" },
  { question: "Wie hieß das Luftschiff, das 1937 explodierte?", answer: "Hindenburg" },
  { question: "Warum hat die Freiheitsstatue sieben Zacken in der Krone?", answer: "Für die sieben Weltmeere" },
  { question: "Wie nannte sich die japanische Selbstmord-Spezialtruppe im Zweiten Weltkrieg?", answer: "Kamikaze" },
  { question: "Wo ist der Austragungsort der internationalen Tennismeisterschaften von England?", answer: "Wimbledon" },
  { question: "Wie viele deutsche Weltmeister gab es bisher in der Formel 1?", answer: "Drei · Nico Rosberg, Michael Schumacher und Sebastian Vettel" },
  { question: "Wie nennt man ein Unentschieden im Schach?", answer: "Remis" },
  { question: "Welcher Musiker hat die meisten Nummer-eins-Hits weltweit?", answer: "Elvis Presley · 21" },
  { question: "Welche Filme haben die meisten Oscar-Auszeichnungen erhalten?", answer: "Ben-Hur, Titanic und Der Herr der Ringe: Die Rückkehr des Königs · jeweils 11" },
  { question: "Wie heißt die medizinische Fachrichtung, die sich mit der Haut beschäftigt?", answer: "Dermatologie" },
  { question: "Wo im Körper befindet sich der Hammer?", answer: "Im Ohr" },
  { question: "Welches DIN-Format hat eine gewöhnliche Postkarte?", answer: "DIN A6" }
];

export function getBuzzerQuestion(index = 0) {
  const normalizedIndex = Math.max(0, Number(index) || 0) % BUZZER_QUESTIONS.length;
  return BUZZER_QUESTIONS[normalizedIndex];
}
