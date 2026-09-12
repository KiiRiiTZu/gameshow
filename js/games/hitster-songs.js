const ROOT = "./assets/hitster songs/";

// Releasejahre gegen die Erstveröffentlichungen geprüft. Korrekturen zur
// Dateibenennung: Kate Bush 1985 (nicht 2007), Dr. Alban 1992, Amy Winehouse 2006.
const FILES = [
  "01 Michael Jackson - Billie Jean (1982).mp3", "02 Dr.Alban - It's My Life (1993).mp3", "03 Fleetwood Mac - Go Your Own Way (1977).mp3", "04 Drafi Detuscher - Marmor, Stein und Eisen bricht (1965).mp3", "05 Eminem - Lose Yourself (2002).mp3", "06 Robin Thicke & Pharrell Williams - Blurred Lines (2013).mp3", "07 Fairground Attraction - Perfect (1988).mp3", "08 Fools Garden - Lemon Tree (1995).mp3", "09 Taio Cruz & Flo Rida - Hangover (2011).mp3", "10 Kate Bush - Running Up That Hill (2007).mp3", "11 The Beatles - I Want To Hold your Hand (1963).mp3", "12 Imany - Don't Be So Shy (2016).mp3", "13 Eiffel 65 - Blue (1999).mp3", "14 Katy Perry - I Kissed A Girl (2008).mp3", "15 Luis Fonsi & Daddy Yankee - Despacito (2017).mp3", "16 The Buggles - Clean, Clean (1980).mp3", "17 US3  - Cantaloop (1993).mp3", "18 Glass Animals - Heat Waves (2020).mp3", "19 ABBA - Waterloo (1974).mp3", "20 Amy Winehouse - Rehab (2007).mp3"
];
export const HITSTER_SONGS = [
  ["Michael Jackson", "Billie Jean", 1982], ["Dr. Alban", "It's My Life", 1992],
  ["Fleetwood Mac", "Go Your Own Way", 1977], ["Drafi Deutscher", "Marmor, Stein und Eisen bricht", 1965],
  ["Eminem", "Lose Yourself", 2002], ["Robin Thicke & Pharrell Williams", "Blurred Lines", 2013],
  ["Fairground Attraction", "Perfect", 1988], ["Fools Garden", "Lemon Tree", 1995],
  ["Taio Cruz & Flo Rida", "Hangover", 2011], ["Kate Bush", "Running Up That Hill", 1985],
  ["The Beatles", "I Want To Hold Your Hand", 1963], ["Imany", "Don't Be So Shy", 2014],
  ["Eiffel 65", "Blue", 1999], ["Katy Perry", "I Kissed A Girl", 2008],
  ["Luis Fonsi & Daddy Yankee", "Despacito", 2017], ["The Buggles", "Clean, Clean", 1980],
  ["US3", "Cantaloop", 1993], ["Glass Animals", "Heat Waves", 2020],
  ["ABBA", "Waterloo", 1974], ["Amy Winehouse", "Rehab", 2006]
].map(([artist, title, year], index) => ({
  id: `song-${index + 1}`,
  artist, title, year,
  src: `${ROOT}${FILES[index]}`
}));

export function getHitsterSong(index) { return HITSTER_SONGS[index] || null; }
