const GAME_PRESENTATIONS = {
  "estimation-game": { number: 1, name: "Mittelwert" },
  "matching-game": { number: 2, name: "Da seh ich dich" },
  "germany-map": { number: 3, name: "Kartenwissen" },
  "word-match-game": { number: 4, name: "Begriffsmatch" },
  "guess-the-price": { number: 5, name: "Thrifty" },
  "ranking-game": { number: 6, name: "Einordnen" },
  "spotify-top-artists": { number: 6, name: "Top 20" },
  buzzer: { number: 7, name: "Buzzer Quiz" }
};

function removeEffect(selector) {
  document.querySelector(selector)?.remove();
}

export function getGamePresentation(gameId) {
  return GAME_PRESENTATIONS[gameId] || { number: "?", name: "Nächstes Spiel" };
}

export function showGameTransition(gameId) {
  const presentation = getGamePresentation(gameId);
  removeEffect(".game-transition-overlay");

  const overlay = document.createElement("div");
  overlay.className = "game-transition-overlay";
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-label", `Spiel ${presentation.number}: ${presentation.name}`);
  overlay.innerHTML = `
    <div class="game-transition-card">
      <div class="game-transition-card-inner">
        <div class="game-transition-face game-transition-front">
          <span>SPIEL</span>
          <strong>${presentation.number}</strong>
        </div>
        <div class="game-transition-face game-transition-back">
          <span>SPIEL ${presentation.number}</span>
          <strong>${presentation.name}</strong>
        </div>
      </div>
    </div>
  `;
  document.body.append(overlay);
  setTimeout(() => overlay.classList.add("leaving"), 3300);
  setTimeout(() => overlay.remove(), 3800);
}
