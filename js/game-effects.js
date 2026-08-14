const GAME_PRESENTATIONS = {
  buzzer: { number: 1, name: "Buzzer Quiz" },
  "spotify-top-artists": { number: 2, name: "Top 20" },
  "germany-map": { number: 3, name: "Deutschlandkarte" },
  "matching-game": { number: 4, name: "Wer passt zu wem?" },
  "guess-the-price": { number: 5, name: "Was kostet das?" }
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
  removeEffect(".winner-celebration");

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

export function showWinnerCelebration(team, players, gameId) {
  if (!["blue", "red"].includes(team)) return;
  removeEffect(".winner-celebration");

  const presentation = getGamePresentation(gameId);
  const teamName = team === "blue" ? "Team Blau" : "Team Rot";
  const playerNames = players.filter((player) => player.team === team).map((player) => player.name);
  const overlay = document.createElement("div");
  overlay.className = `winner-celebration ${team}`;
  overlay.setAttribute("role", "status");

  const confetti = document.createElement("div");
  confetti.className = "confetti-field";
  const colors = team === "blue"
    ? ["#5a72f6", "#8ca2ff", "#ffffff", "#f5c451"]
    : ["#d23750", "#ff8b9b", "#ffffff", "#f5c451"];
  for (let index = 0; index < 72; index += 1) {
    const piece = document.createElement("i");
    piece.style.setProperty("--x", `${Math.random() * 100}vw`);
    piece.style.setProperty("--delay", `${Math.random() * .8}s`);
    piece.style.setProperty("--duration", `${2.2 + Math.random() * 1.8}s`);
    piece.style.setProperty("--drift", `${-80 + Math.random() * 160}px`);
    piece.style.background = colors[index % colors.length];
    confetti.append(piece);
  }

  const panel = document.createElement("div");
  panel.className = "winner-celebration-panel";
  const eyebrow = document.createElement("span");
  eyebrow.textContent = `${presentation.name} · GEWONNEN`;
  const title = document.createElement("strong");
  title.textContent = teamName;
  const names = document.createElement("p");
  names.textContent = playerNames.length ? playerNames.join(" & ") : "Gewinnerteam";
  panel.append(eyebrow, title, names);
  overlay.append(confetti, panel);
  document.body.append(overlay);

  setTimeout(() => overlay.classList.add("leaving"), 4200);
  setTimeout(() => overlay.remove(), 4700);
}
