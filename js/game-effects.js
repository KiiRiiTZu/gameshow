const GAME_PRESENTATIONS = {
  buzzer: { number: 1, name: "Buzzer Quiz" },
  "guess-the-price": { number: 2, name: "Thrifty" },
  "spotify-top-artists": { number: 3, name: "Top 20" },
  "germany-map": { number: 4, name: "Kartenwissen" },
  "matching-game": { number: 5, name: "Da seh ich dich" }
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
