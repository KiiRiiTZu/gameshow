import { burstConfetti, stopConfetti } from "./confetti.js";

const GAME_PRESENTATIONS = {
  "estimation-game": { number: 1, name: "Mittelwert" },
  "matching-game": { number: 6, name: "Da seh ich dich" },
  "germany-map": { number: 3, name: "Kartenwissen" },
  "word-match-game": { number: 4, name: "Begriffsmatch" },
  "ranking-game": { number: 5, name: "Einordnen" },
  "spotify-top-artists": { number: 5, name: "Top 20" },
  "guess-the-price": { number: 2, name: "Thrifty" },
  buzzer: { number: 7, name: "Buzzer Quiz" }
};

// Ablauf der Übergangskarte. Die Werte werden als CSS-Variablen gesetzt,
// damit Timing in JS und Animation im Stylesheet nicht auseinanderlaufen.
const TRANSITION_DURATION = 2900;
const TRANSITION_FADE_OUT = 450;

const WINNER_DURATION = 3200;
const WINNER_FADE_OUT = 480;

const TEAM_LABELS = { blue: "Team Blau", red: "Team Rot" };

function removeEffect(selector) {
  document.querySelector(selector)?.remove();
}

function scheduleTeardown(overlay, holdMs, fadeMs) {
  const leave = setTimeout(() => overlay.classList.add("leaving"), holdMs);
  const remove = setTimeout(() => overlay.remove(), holdMs + fadeMs);
  // Wird das Overlay vorher ersetzt, dürfen die Timer nicht am neuen weiterarbeiten.
  overlay.addEventListener("effect-cancelled", () => {
    clearTimeout(leave);
    clearTimeout(remove);
  }, { once: true });
}

function replaceOverlay(selector) {
  const existing = document.querySelector(selector);
  if (!existing) return;
  existing.dispatchEvent(new Event("effect-cancelled"));
  existing.remove();
}

export function getGamePresentation(gameId) {
  return GAME_PRESENTATIONS[gameId] || { number: "?", name: "Nächstes Spiel" };
}

export function getTeamLabel(team) {
  return TEAM_LABELS[team] || "Kein Team";
}

export function showGameTransition(gameId) {
  const presentation = getGamePresentation(gameId);
  replaceOverlay(".game-transition-overlay");
  // Eine noch laufende Siegerehrung des Vorspiels darf nicht in die Karte hineinlaufen.
  replaceOverlay(".game-winner-overlay");
  stopConfetti();

  const overlay = document.createElement("div");
  overlay.className = "game-transition-overlay";
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-label", `Spiel ${presentation.number}: ${presentation.name}`);
  overlay.style.setProperty("--transition-duration", `${TRANSITION_DURATION}ms`);
  overlay.style.setProperty("--transition-fade-out", `${TRANSITION_FADE_OUT}ms`);
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
  scheduleTeardown(overlay, TRANSITION_DURATION - TRANSITION_FADE_OUT, TRANSITION_FADE_OUT);
}

/**
 * Siegerehrung nach einem beendeten Spiel: Banner in Teamfarbe plus Konfetti.
 * Bei einem Unentschieden (team === null) bleibt es beim Banner ohne Konfetti.
 */
export function showGameWinner(gameId, team, detail = "") {
  const presentation = getGamePresentation(gameId);
  replaceOverlay(".game-winner-overlay");

  const isDraw = !["blue", "red"].includes(team);
  const headline = isDraw
    ? "Unentschieden"
    : `${getTeamLabel(team)} gewinnt!`;

  const overlay = document.createElement("div");
  overlay.className = `game-winner-overlay${isDraw ? " draw" : ` ${team}`}`;
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-label", `${headline} ${presentation.name}`);
  overlay.style.setProperty("--winner-duration", `${WINNER_DURATION}ms`);
  overlay.style.setProperty("--winner-fade-out", `${WINNER_FADE_OUT}ms`);
  overlay.innerHTML = `
    <div class="game-winner-card">
      <span class="game-winner-trophy">${isDraw ? "🤝" : "🏆"}</span>
      <strong class="game-winner-headline">${headline}</strong>
      <span class="game-winner-game">Spiel ${presentation.number} · ${presentation.name}</span>
      ${detail ? `<span class="game-winner-detail">${detail}</span>` : ""}
    </div>
  `;
  document.body.append(overlay);
  if (!isDraw) burstConfetti(team);
  scheduleTeardown(overlay, WINNER_DURATION - WINNER_FADE_OUT, WINNER_FADE_OUT);
}

/** Räumt laufende Effekte ab, z. B. wenn ein Spiel neu geladen wird. */
export function clearGameEffects() {
  stopConfetti();
  replaceOverlay(".game-winner-overlay");
  removeEffect(".game-transition-overlay");
}
