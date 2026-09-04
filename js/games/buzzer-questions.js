export const BUZZER_QUESTIONS = [
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
  { question: "Welches DIN-Format hat eine gewöhnliche Postkarte?", answer: "DIN A6" },
  { question: "Michael Jackson war mit seinem erfolgreichsten Song 24 Wochen in den Charts und davon sieben Wochen auf Platz eins. Wie heißt der Song?", answer: "Billie Jean" },
  { question: "Wie hieß das erste Video, das 2005 auf YouTube hochgeladen wurde?", answer: "Me at the Zoo" },
  { question: "Mit wie vielen Karten wird Poker gespielt?", answer: "52" },
  { question: "Welche drei Staatsgewalten gibt es?", answer: "Legislative, Judikative und Exekutive" },
  { question: "Wie viele verschiedene Spielsteine gibt es im Videospiel Tetris?", answer: "7" },
  { question: "Die Freiheitsstatue war ein Geschenk welcher Nation?", answer: "Frankreich" },
  { question: "Im Karate wird der schwarze Gurt als höchste Stufe verliehen. Welche Gurtfarbe hat die erste Stufe?", answer: "Weiß" },
  { question: "Welches ist das bisher umsatzstärkste Musical?", answer: "Der König der Löwen" },
  { question: "Welcher Fluss in Europa fließt durch zehn Länder?", answer: "Donau" },
  { question: "Wer war der zweite Mensch auf dem Mond?", answer: "Buzz Aldrin" },
  { question: "Welches metallische Element ist bei Raumtemperatur flüssig?", answer: "Quecksilber" },
  { question: "Welcher Planet in unserem Sonnensystem ist der heißeste?", answer: "Venus" },
  { question: "Wie hieß New York, bevor es in New York umbenannt wurde?", answer: "New Amsterdam" },
  { question: "Wer war der Erfinder des modernen Buchdrucks?", answer: "Johannes Gutenberg" },
  { question: "Der Gepard ist das schnellste Landtier der Erde. Was ist das schnellste Tier der Erde?", answer: "Wanderfalke" },
  { question: "Welcher Fisch kann bei Bedarf sein Geschlecht ändern?", answer: "Anemonenfisch" },
  { question: "Wie hieß in der römischen Mythologie der Gott des Meeres?", answer: "Neptun" },
  { question: "Welcher Zelltyp in der Netzhaut des Auges nimmt Hell-Dunkel-Kontraste wahr?", answer: "Stäbchen" }
];

export function getBuzzerQuestion(index = 0) {
  const normalizedIndex = Math.max(0, Number(index) || 0) % BUZZER_QUESTIONS.length;
  return BUZZER_QUESTIONS[normalizedIndex];
}
