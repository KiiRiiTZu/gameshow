import { burstConfetti, stopConfetti } from "./confetti.js";
import { SHOW_WINNING_SCORE } from "./room.js";

const GAME_PRESENTATIONS = {
  "mittelwert": { number: 1, name: "Mittelwert" },
  "da-seh-ich-dich": { number: 6, name: "Da seh ich dich" },
  "kartenwissen": { number: 3, name: "Kartenwissen" },
  "begriffsmatch": { number: 4, name: "Begriffsmatch" },
  "einordnen": { number: 5, name: "Einordnen" },
  "top-20": { number: 5, name: "Top 20" },
  "thrifty": { number: 2, name: "Thrifty" },
  "hitster": { number: 2, name: "Hitster" },
  "set": { number: 7, name: "SET" }
};

// Reihenfolge der aktiven Spiele. Die Nummer auf Übergangskarte und
// Punkteübersicht ergibt sich aus dieser Liste, nicht aus einer zweiten Tabelle.
export const GAME_SEQUENCE = [
  "mittelwert",
  "hitster",
  "kartenwissen",
  "begriffsmatch",
  "einordnen",
  "da-seh-ich-dich",
  "set"
];

// Ablauf der Übergangskarte. Die Werte werden als CSS-Variablen gesetzt,
// damit Timing in JS und Animation im Stylesheet nicht auseinanderlaufen.
const TRANSITION_DURATION = 2900;
const TRANSITION_FADE_OUT = 450;

const WINNER_DURATION = 3200;
const WINNER_FADE_OUT = 480;

// Die Übersicht wird vom Moderator geschaltet und blendet sich nicht selbst aus.
const OVERVIEW_FADE_OUT = 520;

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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * Was ein Feld der Übersicht zeigen darf.
 * Der Name eines Spiels bleibt verborgen, bis es gespielt wurde — sonst
 * verrät die Übersicht den Spielern, was noch kommt. Als gespielt gilt jedes
 * Spiel mit einem Ergebnis, auch ein unentschiedenes ohne Siegerteam.
 */
export function getOverviewGameView(gameId, index, results = [], highlightGameId = null) {
  const result = results.find((entry) => entry.gameId === gameId);
  const played = Boolean(result);
  const winner = result?.team || null;
  return {
    number: index + 1,
    played,
    winner,
    name: played ? getGamePresentation(gameId).name : null,
    // Das gerade gewonnene Spiel startet neutral und blinkt sich in seine Farbe;
    // alle übrigen sind sofort eingefärbt.
    highlighted: gameId === highlightGameId && Boolean(winner)
  };
}

function renderOverviewGame(gameId, index, results, highlightGameId) {
  const view = getOverviewGameView(gameId, index, results, highlightGameId);
  const stateClass = view.highlighted
    ? `claiming ${view.winner}`
    : view.winner ? `won ${view.winner}` : "open";
  return `<div class="score-overview-game ${stateClass}">
    <strong>Spiel ${view.number}</strong>
    ${view.name
      ? `<span>${escapeHtml(view.name)}</span>`
      : '<span class="score-overview-unrevealed" aria-label="Noch nicht gespielt">?</span>'}
  </div>`;
}

// Signatur der zuletzt gezeichneten Übersicht. Der Moderator hält sie offen,
// also läuft der Renderpfad mehrfach darüber — ohne diesen Vergleich würde die
// Blink-Animation bei jedem Render neu starten.
let renderedOverviewKey = null;

export function hideScoreOverview() {
  replaceOverlay(".score-overview-overlay");
  renderedOverviewKey = null;
}

/**
 * Punkteübersicht der ganzen Show: beide Teamstände und ein Feld je Spiel.
 * highlightGameId blinkt dreimal auf und bleibt dann in der Siegerfarbe stehen.
 * Die Übersicht blendet sich nicht selbst aus — sie wird vom Moderator geschaltet.
 */
export function showScoreOverview({
  results = [],
  scores = { blue: 0, red: 0 },
  highlightGameId = null,
  winningScore = 4,
  closable = false
} = {}) {
  const key = JSON.stringify({ results, scores, highlightGameId, winningScore, closable });
  const existing = document.querySelector(".score-overview-overlay");
  if (existing && key === renderedOverviewKey) return existing;

  replaceOverlay(".score-overview-overlay");
  renderedOverviewKey = key;

  const overlay = document.createElement("div");
  overlay.className = "score-overview-overlay";
  overlay.setAttribute("role", "status");
  overlay.setAttribute(
    "aria-label",
    `Punktestand: Team Blau ${scores.blue}, Team Rot ${scores.red}`
  );
  overlay.style.setProperty("--overview-fade-out", `${OVERVIEW_FADE_OUT}ms`);
  overlay.innerHTML = `
    ${closable ? `<button type="button" class="score-overview-close" data-close-score-overview
      aria-label="Punktestand ausblenden" title="Punktestand ausblenden (Esc)">✕</button>` : ""}
    <div class="score-overview">
      <div class="score-overview-team blue">
        <span>Team Blau</span>
        <strong>${Number(scores.blue) || 0}</strong>
      </div>
      <div class="score-overview-middle">
        <div class="score-overview-grid">
          ${GAME_SEQUENCE.map((gameId, index) =>
            renderOverviewGame(gameId, index, results, highlightGameId)).join("")}
        </div>
        <p class="score-overview-note">
          Wer zuerst ${winningScore} Spiele für sich entscheidet,<br>gewinnt den Abend.
        </p>
      </div>
      <div class="score-overview-team red">
        <span>Team Rot</span>
        <strong>${Number(scores.red) || 0}</strong>
      </div>
    </div>
  `;
  document.body.append(overlay);
  return overlay;
}

/**
 * Bringt die Übersicht mit dem Raumzustand in Deckung. Der Moderator schaltet
 * scoreOverviewVisible, der Zustand geht per room_state an alle Spieler — so
 * sehen Moderator und Spieler dieselbe Einblendung.
 */
export function renderScoreOverview(state, { closable = false } = {}) {
  if (!state?.scoreOverviewVisible) {
    hideScoreOverview();
    return;
  }

  showScoreOverview({
    results: state.gameResults || [],
    scores: state.scores || { blue: 0, red: 0 },
    // Nur ein gerade beendetes Spiel blinkt sich ein. Läuft bereits das nächste,
    // stehen alle gewonnenen Felder ruhig in ihrer Farbe.
    highlightGameId: state.game?.status === "finished" ? state.game.id : null,
    winningScore: SHOW_WINNING_SCORE,
    // Die deckende Übersicht verdeckt die Kopfzeile samt Schalter, deshalb
    // bekommt der Moderator sein Schliessen-Kreuz auf der Einblendung selbst.
    closable
  });
}

/** Räumt laufende Effekte ab, z. B. wenn ein Spiel neu geladen wird. */
export function clearGameEffects() {
  stopConfetti();
  replaceOverlay(".game-winner-overlay");
  hideScoreOverview();
  removeEffect(".game-transition-overlay");
}
