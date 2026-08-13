export const TOP_20_LISTS = [
  {
    id: "spotify",
    title: "Spotify-Stars",
    description: "Die 20 meistgestreamten Künstler auf Spotify 2026",
    answerLabel: "Künstler",
    valueLabel: "Streams",
    entries: [
      { answer: "Taylor Swift", value: "~129,0" },
      { answer: "Drake", value: "~139,2 (inkl. Feature-Tracks) / ~95,9 (Lead)" },
      { answer: "Bad Bunny", value: "~127,3" },
      { answer: "The Weeknd", value: "~96,7" },
      { answer: "Justin Bieber", value: "~79,0" },
      { answer: "Ariana Grande", value: "~69,4" },
      { answer: "Travis Scott", value: "~65,8" },
      { answer: "Kanye West", value: "~65,7" },
      { answer: "Ed Sheeran", value: "~65,1" },
      { answer: "Eminem", value: "~65,0" },
      { answer: "Rihanna", value: "~61,4" },
      { answer: "Billie Eilish", value: "~58,5" },
      { answer: "Bruno Mars", value: "~57,5" },
      { answer: "Kendrick Lamar", value: "~56,9" },
      { answer: "Post Malone", value: "~55,4" },
      { answer: "J Balvin", value: "~55,1" },
      { answer: "Future", value: "~54,6" },
      { answer: "BTS", value: "~54,1" },
      { answer: "Ozuna", value: "~48,1" },
      { answer: "Coldplay", value: "~47,2" }
    ]
  },
  {
    id: "population",
    title: "Bevölkerungsreichste Länder",
    description: "Die 20 Länder mit den meisten Einwohnern",
    answerLabel: "Land",
    valueLabel: "Einwohner · Anteil Weltbevölkerung",
    entries: [
      { answer: "Indien", value: "1,48 Milliarden · ~17,8 %" },
      { answer: "China", value: "1,41 Milliarden · ~17,0 %" },
      { answer: "USA", value: "349 Millionen · ~4,2 %" },
      { answer: "Indonesien", value: "288 Millionen · ~3,5 %" },
      { answer: "Pakistan", value: "259 Millionen · ~3,1 %" },
      { answer: "Nigeria", value: "242 Millionen · ~2,9 %" },
      { answer: "Brasilien", value: "214 Millionen · ~2,6 %" },
      { answer: "Bangladesch", value: "178 Millionen · ~2,1 %" },
      { answer: "Russland", value: "143 Millionen · ~1,7 %" },
      { answer: "Äthiopien", value: "139 Millionen · ~1,7 %" },
      { answer: "Mexiko", value: "133 Millionen · ~1,6 %" },
      { answer: "Japan", value: "122 Millionen · ~1,5 %" },
      { answer: "Ägypten", value: "120 Millionen · ~1,4 %" },
      { answer: "Philippinen", value: "118 Millionen · ~1,4 %" },
      { answer: "DR Kongo", value: "116 Millionen · ~1,4 %" },
      { answer: "Vietnam", value: "102 Millionen · ~1,2 %" },
      { answer: "Iran", value: "93 Millionen · ~1,1 %" },
      { answer: "Türkei", value: "88 Millionen · ~1,1 %" },
      { answer: "Deutschland", value: "84 Millionen · ~1,0 %" },
      { answer: "Tansania", value: "73 Millionen · ~0,9 %" }
    ]
  },
  {
    id: "german-companies",
    title: "Umsatzstärkste deutsche Unternehmen",
    description: "Die 20 deutschen Unternehmen mit dem höchsten Umsatz",
    answerLabel: "Unternehmen",
    valueLabel: "Umsatz",
    entries: [
      { answer: "Volkswagen AG", value: "~324,6 Mrd. €" },
      { answer: "Schwarz-Gruppe (Lidl & Kaufland)", value: "~175,4 Mrd. €" },
      { answer: "Allianz SE", value: "~161,7 Mrd. €" },
      { answer: "Mercedes-Benz Group AG", value: "~145,6 Mrd. €" },
      { answer: "BMW Group", value: "~142,4 Mrd. €" },
      { answer: "Deutsche Telekom AG", value: "~115,8 Mrd. €" },
      { answer: "Aldi-Gruppe (Nord & Süd)", value: "110,0 Mrd. €" },
      { answer: "Uniper SE", value: "~107,9 Mrd. €" },
      { answer: "E.ON SE", value: "~93,7 Mrd. €" },
      { answer: "REWE Group", value: "~92,3 Mrd. €" },
      { answer: "Robert Bosch GmbH", value: "~91,6 Mrd. €" },
      { answer: "DHL Group (Deutsche Post)", value: "~81,8 Mrd. €" },
      { answer: "Siemens AG", value: "~78,0 Mrd. €" },
      { answer: "EDEKA-Zentrale", value: "~70,7 Mrd. €" },
      { answer: "Münchener Rück", value: "~69,3 Mrd. €" },
      { answer: "Deutsche Bank AG", value: "~63,9 Mrd. €" },
      { answer: "BASF SE", value: "~59,7 Mrd. €" },
      { answer: "Talanx", value: "~57,3 Mrd. €" },
      { answer: "PHOENIX Pharmahandel", value: "~57,0 Mrd. €" },
      { answer: "Continental AG", value: "~41,4 Mrd. €" }
    ]
  }
];

export const TOP_20_SLOT_COUNT = 20;

export function getTop20List(roundIndex = 0) {
  return TOP_20_LISTS[roundIndex] || TOP_20_LISTS[0];
}
