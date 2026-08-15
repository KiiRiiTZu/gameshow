export const TOP_20_LISTS = [
  {
    id: "spotify",
    title: "Spotify-Stars",
    description: "Die 20 meistgestreamten Künstler auf Spotify 2026",
    answerLabel: "Künstler",
    valueLabel: "Streams",
    entries: [
      { answer: "Taylor Swift", value: "127,7 Mrd." },
      { answer: "Drake", value: "105,0 Mrd." },
      { answer: "Bad Bunny", value: "98,5 Mrd." },
      { answer: "The Weeknd", value: "84,8 Mrd." },
      { answer: "Ariana Grande", value: "66,6 Mrd." },
      { answer: "Ed Sheeran", value: "60,3 Mrd." },
      { answer: "Billie Eilish", value: "58,5 Mrd." },
      { answer: "Eminem", value: "57,6 Mrd." },
      { answer: "Kanye West", value: "56,2 Mrd." },
      { answer: "BTS", value: "53,2 Mrd." },
      { answer: "Justin Bieber", value: "52,7 Mrd." },
      { answer: "Bruno Mars", value: "51,0 Mrd." },
      { answer: "Post Malone", value: "50,6 Mrd." },
      { answer: "Rihanna", value: "48,3 Mrd." },
      { answer: "Coldplay", value: "47,2 Mrd." },
      { answer: "Travis Scott", value: "44,1 Mrd." },
      { answer: "Kendrick Lamar", value: "43,4 Mrd." },
      { answer: "Dua Lipa", value: "41,7 Mrd." },
      { answer: "J Balvin", value: "40,6 Mrd." },
      { answer: "Imagine Dragons", value: "40,3 Mrd." }
    ]
  },
  {
    id: "population",
    title: "Bevölkerungsreichste Länder",
    description: "Die 20 Länder mit den meisten Einwohnern",
    answerLabel: "Land",
    valueLabel: "Einwohner · Anteil Weltbevölkerung",
    entries: [
      { answer: "Indien", value: "1,48 Milliarden" },
      { answer: "China", value: "1,41 Milliarden" },
      { answer: "USA", value: "349 Millionen" },
      { answer: "Indonesien", value: "288 Millionen" },
      { answer: "Pakistan", value: "259 Millionen" },
      { answer: "Nigeria", value: "242 Millionen" },
      { answer: "Brasilien", value: "214 Millionen" },
      { answer: "Bangladesch", value: "178 Millionen" },
      { answer: "Russland", value: "143 Millionen" },
      { answer: "Äthiopien", value: "139 Millionen" },
      { answer: "Mexiko", value: "133 Millionen" },
      { answer: "Japan", value: "122 Millionen" },
      { answer: "Ägypten", value: "120 Millionen" },
      { answer: "Philippinen", value: "118 Millionen" },
      { answer: "DR Kongo", value: "116 Millionen" },
      { answer: "Vietnam", value: "102 Millionen" },
      { answer: "Iran", value: "93 Millionen" },
      { answer: "Türkei", value: "88 Millionen" },
      { answer: "Deutschland", value: "84 Millionen" },
      { answer: "Tansania", value: "73 Millionen" }
    ]
  },
  {
    id: "german-companies",
    title: "Umsatzstärkste deutsche Unternehmen",
    description: "Die 20 deutschen Unternehmen mit dem höchsten Umsatz",
    answerLabel: "Unternehmen",
    valueLabel: "Umsatz",
    entries: [
      { answer: "Volkswagen AG", value: "324,6 Mrd. €" },
      { answer: "Schwarz-Gruppe (Lidl & Kaufland)", value: "175,4 Mrd. €" },
      { answer: "Allianz SE", value: "161,7 Mrd. €" },
      { answer: "Mercedes-Benz Group AG", value: "145,6 Mrd. €" },
      { answer: "BMW Group", value: "142,4 Mrd. €" },
      { answer: "Deutsche Telekom AG", value: "115,8 Mrd. €" },
      { answer: "Aldi-Gruppe (Nord & Süd)", value: "110,0 Mrd. €" },
      { answer: "Uniper SE", value: "107,9 Mrd. €" },
      { answer: "E.ON SE", value: "93,7 Mrd. €" },
      { answer: "REWE Group", value: "92,3 Mrd. €" },
      { answer: "Robert Bosch GmbH", value: "91,6 Mrd. €" },
      { answer: "DHL Group (Deutsche Post)", value: "81,8 Mrd. €" },
      { answer: "Siemens AG", value: "78,0 Mrd. €" },
      { answer: "EDEKA-Zentrale", value: "70,7 Mrd. €" },
      { answer: "Münchener Rück", value: "69,3 Mrd. €" },
      { answer: "Deutsche Bank AG", value: "63,9 Mrd. €" },
      { answer: "BASF SE", value: "59,7 Mrd. €" },
      { answer: "Talanx", value: "57,3 Mrd. €" },
      { answer: "PHOENIX Pharmahandel", value: "57,0 Mrd. €" },
      { answer: "Continental AG", value: "41,4 Mrd. €" }
    ]
  }
];

export const TOP_20_SLOT_COUNT = 20;

export function getTop20List(roundIndex = 0) {
  return TOP_20_LISTS[roundIndex] || TOP_20_LISTS[0];
}
