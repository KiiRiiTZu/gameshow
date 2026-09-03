export const RANKING_LISTS = [
  {
    id: "valorant-usage",
    title: "Valorant Agents nach Usage in Competitive",
    highLabel: "viel gespielt",
    lowLabel: "wenig gespielt",
    anchorId: "iso",
    entries: [
      { id: "jett", label: "Jett", value: "9,9 %" },
      { id: "reyna", label: "Reyna", value: "9,4 %" },
      { id: "clove", label: "Clove", value: "8,7 %" },
      { id: "chamber", label: "Chamber", value: "7,2 %" },
      { id: "sova", label: "Sova", value: "5,3 %" },
      { id: "cypher", label: "Cypher", value: "4,1 %" },
      { id: "miks", label: "Miks", value: "3,7 %" },
      { id: "neon", label: "Neon", value: "3,3 %" },
      { id: "gekko", label: "Gekko", value: "2,2 %" },
      { id: "iso", label: "Iso", value: "1,8 %" },
      { id: "tejo", label: "Tejo", value: "1,6 %" },
      { id: "breach", label: "Breach", value: "1,5 %" },
      { id: "yoru", label: "Yoru", value: "1,4 %" },
      { id: "veto", label: "Veto", value: "0,7 %" },
      { id: "harbor", label: "Harbor", value: "0,5 %" }
    ]
  },
  {
    id: "sugar-content",
    title: "Lebensmittel nach Zuckergehalt",
    highLabel: "viel Zucker",
    lowLabel: "wenig Zucker",
    anchorId: "banana",
    entries: [
      { id: "raisins", label: "Rosinen", value: "65 g" },
      { id: "nutella", label: "Nutella", value: "56,3 g" },
      { id: "strawberry-jam", label: "Mövenpick Erdbeermarmelade", value: "52,3 g" },
      { id: "corny", label: "Corny Schoko-Banane", value: "35,9 g" },
      { id: "ketchup", label: "Heinz Tomatenketchup", value: "22,8 g" },
      { id: "ice-cream", label: "Cremissimo Bourbon Vanilleeis", value: "19 g" },
      { id: "banana", label: "Banane", value: "15,8 g" },
      { id: "coke", label: "Coca-Cola", value: "10,6 g" },
      { id: "apple", label: "Apfel", value: "10 g" },
      { id: "strawberries", label: "Erdbeeren", value: "4,9 g" },
      { id: "wholegrain-bread", label: "Vollkornbrot", value: "2 g" },
      { id: "gouda", label: "Gouda Käse", value: "0 g" }
    ]
  },
  {
    id: "animal-lifespan",
    title: "Tiere nach Lebenserwartung",
    highLabel: "lange Lebenserwartung",
    lowLabel: "kurze Lebenserwartung",
    anchorId: "man-germany",
    entries: [
      { id: "giant-tortoise", label: "Riesenschildkröte", value: "150 Jahre" },
      { id: "blue-whale", label: "Blauwal", value: "90 Jahre" },
      { id: "woman-germany", label: "Frau in Deutschland", value: "83,6 Jahre" },
      { id: "man-germany", label: "Mann in Deutschland", value: "79,1 Jahre" },
      { id: "african-elephant", label: "Afrikanischer Elefant", value: "65 Jahre" },
      { id: "king-penguin", label: "Königspinguin", value: "20 Jahre" },
      { id: "house-cat", label: "Hauskatze", value: "13 Jahre" },
      { id: "guinea-pig", label: "Meerschweinchen", value: "7 Jahre" },
      { id: "chaffinch", label: "Buchfink", value: "5 Jahre" },
      { id: "queen-bee", label: "Bienenkönigin", value: "4 Jahre" },
      { id: "golden-hamster", label: "Goldhamster", value: "2,5 Jahre" },
      { id: "praying-mantis", label: "Gottesanbeterin", value: "1 Jahr" },
      { id: "fruit-fly", label: "Fruchtfliege", value: "45 Tage" },
      { id: "mayfly", label: "Eintagsfliege", value: "1 Tag" }
    ]
  }
];

export function getRankingList(index) {
  return RANKING_LISTS[index] || RANKING_LISTS[0];
}

export function getRankingEntry(list, id) {
  return list.entries.find((entry) => entry.id === id) || null;
}
