const COLORS = { red: "#ff4f0a", green: "#86be43", blue: "#2187df" };

function shapeMarkup(card, x, patternId) {
  const common = card.fill === "solid"
    ? `fill="${COLORS[card.color]}" stroke="${COLORS[card.color]}"`
    : card.fill === "striped"
      ? `fill="url(#${patternId})" stroke="${COLORS[card.color]}"`
      : `fill="none" stroke="${COLORS[card.color]}"`;
  if (card.shape === "oval") return `<ellipse cx="${x}" cy="50" rx="14" ry="35" ${common}/>`;
  if (card.shape === "diamond") return `<path d="M ${x} 13 L ${x + 17} 50 L ${x} 87 L ${x - 17} 50 Z" ${common}/>`;
  return `<rect x="${x - 13}" y="15" width="26" height="70" rx="1" ${common}/>`;
}

export function renderSetSymbol(card, uniqueId) {
  const positions = card.count === 1 ? [75] : card.count === 2 ? [49, 101] : [28, 75, 122];
  const patternId = `set-stripes-${uniqueId}`;
  return `<svg class="set-symbol" viewBox="0 0 150 100" aria-hidden="true">
    <defs><pattern id="${patternId}" width="8" height="8" patternUnits="userSpaceOnUse">
      <path d="M0 2 H8" stroke="${COLORS[card.color]}" stroke-width="3"/>
    </pattern></defs>
    <g stroke-width="5" stroke-linejoin="round">${positions.map((x) => shapeMarkup(card, x, patternId)).join("")}</g>
  </svg>`;
}

export function renderSetBoard(round, game, interactive = false, prefix = "set") {
  const faceUp = ["open", "locked", "resolved", "finished"].includes(game.status);
  const selected = new Set(game.selectedCards || []);
  const resultClass = game.result ? (game.result.correct ? " correct" : " wrong") : "";
  return round.cards.map((card, index) => {
    const number = index + 1;
    const chosen = selected.has(number);
    const tag = interactive ? "button" : "div";
    const attributes = interactive
      ? `type="button" data-set-card="${number}" aria-label="Karte ${number}" aria-pressed="${chosen}"${game.status !== "locked" ? " disabled" : ""}`
      : "";
    return `<${tag} class="set-card${faceUp ? " face-up" : ""}${chosen ? ` selected${resultClass}` : ""}" ${attributes}>
      <span class="set-card-number">${number}</span>
      <div class="set-card-inner">
        <div class="set-card-back"><span>SET</span></div>
        <div class="set-card-front">${renderSetSymbol(card, `${prefix}-${game.roundIndex}-${number}`)}</div>
      </div>
    </${tag}>`;
  }).join("");
}
