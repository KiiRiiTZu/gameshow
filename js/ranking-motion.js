// Flug-Animation für "Einordnen": ein Begriff bewegt sich zwischen Begriffs-Box und Liste.
//
// Zwei Eigenheiten der Aufrufer bestimmen das Design:
// 1. runModeratorAction rendert zweimal (einmal nach dem Persistieren, einmal im finally).
//    Der zweite Render ersetzt Board und Pool per innerHTML, also auch das Zielelement,
//    auf das ein laufender Flug zeigt. Deshalb wird das Ziel bei jedem Zugriff neu über
//    die Item-Id aufgelöst und der Hold-Zustand in einer Modul-Registry gehalten.
// 2. Quelle und Ziel haben stark unterschiedliche Breiten (Pool-Chip ~275px,
//    Listenzeile 660px). Eine FLIP-Skalierung auf die Zielbreite verzerrt den Text,
//    darum fliegt der Token in Quellgröße und wird nur uniform leicht skaliert.

const FLIGHT_DURATION = 560;
const RETURN_DURATION = 900;
const HANDOFF_DURATION = 160;
const SHAKE_PORTION = 0.34;

// itemId -> { direction, cancel }. Hält fest, welche Begriffe gerade unterwegs sind,
// damit ein zwischenzeitlicher Re-Render sie weiterhin versteckt und nicht neu startet.
const inFlight = new Map();

function findByItemId(container, attribute, itemId) {
  return [...(container?.querySelectorAll(`[${attribute}]`) || [])]
    .find((element) => element.getAttribute(attribute) === itemId) || null;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function centerOf(rect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function destinationFinder(direction, itemId) {
  if (direction === "into-list") {
    return (pool, board) => findByItemId(board, "data-ranking-proposal", itemId);
  }
  if (direction === "wrong-back-to-pool") {
    return (pool) => findByItemId(pool, "data-ranking-item", itemId);
  }
  return (pool, board) => findByItemId(board, "data-ranking-placed", itemId);
}

/**
 * Soll dieses Element beim Rendern noch versteckt bleiben, weil ein Flug dorthin läuft?
 * Berücksichtigt sowohl den gerade erfassten Move als auch bereits laufende Flüge,
 * damit der zweite Render einer Moderatoraktion das Ziel nicht vorzeitig aufdeckt.
 */
export function isRankingMotionPending(itemId, direction, capturedMove = null) {
  if (!itemId) return false;
  if (capturedMove?.itemId === itemId && capturedMove.direction === direction) return true;
  return inFlight.get(itemId)?.direction === direction;
}

export function captureRankingMove(game, pool, board) {
  const movingIntoList = Boolean(game.proposal?.itemId);
  const result = game.lastResult;
  const movingAfterReveal = Boolean(result?.itemId);
  if (!movingIntoList && !movingAfterReveal) return null;

  const itemId = movingIntoList ? game.proposal.itemId : result.itemId;
  // Läuft für diesen Begriff bereits ein Flug, darf der zweite Render ihn nicht neu starten.
  if (inFlight.has(itemId)) return null;

  const direction = movingIntoList
    ? "into-list"
    : result.cleanupReveal ? "cleanup-into-list" : result.correct ? "correct-feedback" : "wrong-back-to-pool";
  const source = direction === "into-list" || direction === "cleanup-into-list"
    ? findByItemId(pool, "data-ranking-item", itemId)
    : findByItemId(board, "data-ranking-proposal", itemId);
  if (!source) return null;

  const rect = source.getBoundingClientRect();
  return {
    itemId,
    direction,
    team: movingIntoList ? game.proposal.team : result.team,
    label: source.querySelector("strong")?.textContent || source.textContent.trim(),
    rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
  };
}

function flash(element, outcome) {
  if (!element) return;
  const className = `ranking-feedback-${outcome}`;
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  element.addEventListener(
    "animationend",
    () => element.classList.remove(className),
    { once: true }
  );
}

function createToken(move, uniformScale, isWrong) {
  const token = document.createElement("div");
  token.className = `ranking-moving-token${move.team ? ` ${move.team}` : ""}` +
    (isWrong ? " returning" : "");
  // Der Text liegt in einem eigenen Element, damit die Zeilenhöhe beim Skalieren
  // nicht springt und lange Begriffe sauber gekürzt werden.
  const label = document.createElement("span");
  label.className = "ranking-moving-token-label";
  label.textContent = move.label;
  token.append(label);
  Object.assign(token.style, {
    left: `${move.rect.left}px`,
    top: `${move.rect.top}px`,
    width: `${move.rect.width}px`,
    height: `${move.rect.height}px`,
    // Mittelpunkt als Bezug: der Token fliegt als Objekt, statt sich aufzublähen.
    transformOrigin: "center center",
    "--ranking-token-scale": uniformScale
  });
  return token;
}

function buildFlightKeyframes(deltaX, deltaY, endScale) {
  // Leichter Bogen: der Token hebt kurz ab und rastet dann mit einem Mini-Überschwinger ein.
  const lift = Math.min(34, Math.max(14, Math.abs(deltaY) * 0.14));
  const midScale = 1 + (endScale - 1) * 0.35;
  return [
    { transform: "translate(0px, 0px) scale(1)", opacity: 1, offset: 0 },
    {
      transform: `translate(${deltaX * 0.52}px, ${deltaY * 0.48 - lift}px) scale(${(midScale * 1.06).toFixed(4)})`,
      opacity: 1,
      offset: 0.55
    },
    {
      transform: `translate(${deltaX}px, ${deltaY}px) scale(${endScale.toFixed(4)})`,
      opacity: 1,
      offset: 1
    }
  ];
}

function buildReturnKeyframes(deltaX, deltaY, endScale) {
  // Falsche Einordnung: erst ein kurzes Zittern an Ort und Stelle, dann zurück in den Pool.
  const shake = (offset, x, extra = {}) => ({
    transform: `translate(${x}px, 0px) scale(1)`,
    offset,
    ...extra
  });
  return [
    shake(0, 0, { opacity: 1 }),
    shake(SHAKE_PORTION * 0.22, -9),
    shake(SHAKE_PORTION * 0.46, 9),
    shake(SHAKE_PORTION * 0.7, -6),
    shake(SHAKE_PORTION, 0),
    {
      transform: `translate(${deltaX * 0.5}px, ${deltaY * 0.46 - 20}px) scale(${(1 + (endScale - 1) * 0.4).toFixed(4)})`,
      opacity: 1,
      offset: SHAKE_PORTION + (1 - SHAKE_PORTION) * 0.55
    },
    {
      transform: `translate(${deltaX}px, ${deltaY}px) scale(${endScale.toFixed(4)})`,
      opacity: 1,
      offset: 1
    }
  ];
}

export function playRankingMove(move, pool, board) {
  if (!move) return;

  const findDestination = destinationFinder(move.direction, move.itemId);
  const destination = findDestination(pool, board);
  if (!destination) return;

  // Richtige Einordnung: der Begriff steht bereits an der vorgemerkten Stelle,
  // hier gibt es nur die Bestätigung, keinen Ortswechsel.
  if (move.direction === "correct-feedback") {
    destination.classList.remove("ranking-awaiting-motion");
    flash(destination, "correct");
    return;
  }

  const isWrong = move.direction === "wrong-back-to-pool";

  if (prefersReducedMotion()) {
    destination.classList.remove("ranking-awaiting-motion");
    if (isWrong) flash(destination, "wrong");
    return;
  }

  const target = destination.getBoundingClientRect();
  const from = centerOf(move.rect);
  const to = centerOf(target);
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  // Nur uniform skalieren (an der Höhe orientiert) — eine getrennte X/Y-Skalierung
  // würde den Begriff auf die Zielbreite ziehen und den Text verzerren.
  const endScale = move.rect.height ? Math.min(1.6, Math.max(0.6, target.height / move.rect.height)) : 1;

  const token = createToken(move, endScale, isWrong);
  document.body.append(token);
  destination.classList.add("ranking-awaiting-motion");

  const animation = token.animate(
    isWrong
      ? buildReturnKeyframes(deltaX, deltaY, endScale)
      : buildFlightKeyframes(deltaX, deltaY, endScale),
    {
      duration: isWrong ? RETURN_DURATION : FLIGHT_DURATION,
      easing: isWrong ? "cubic-bezier(.32,.72,.28,1)" : "cubic-bezier(.31,.86,.36,1)",
      fill: "forwards"
    }
  );

  const finish = () => {
    if (inFlight.get(move.itemId)?.animation !== animation) return;
    inFlight.delete(move.itemId);
    // Das Ziel wird neu aufgelöst: ein zwischenzeitlicher Re-Render hat das
    // ursprüngliche Element womöglich längst durch ein neues ersetzt.
    const landing = findDestination(pool, board) || destination;
    landing.classList.remove("ranking-awaiting-motion");
    flash(landing, isWrong ? "wrong" : "land");

    // Der Token ist schmaler als die Listenzeile. Statt hart umzuschalten,
    // blendet er über der einrastenden Zeile aus.
    const handoff = token.animate(
      [
        { opacity: 1, transform: `translate(${deltaX}px, ${deltaY}px) scale(${endScale.toFixed(4)})` },
        {
          opacity: 0,
          transform: `translate(${deltaX}px, ${deltaY}px) scale(${(endScale * 1.04).toFixed(4)})`
        }
      ],
      { duration: HANDOFF_DURATION, easing: "ease-out", fill: "forwards" }
    );
    handoff.finished.then(() => token.remove(), () => token.remove());
  };

  inFlight.set(move.itemId, { direction: move.direction, animation });
  animation.finished.then(finish, finish);
}

/** Bricht alle laufenden Flüge ab, z. B. beim Rundenwechsel. */
export function resetRankingMotion(pool, board) {
  for (const [itemId, entry] of inFlight) {
    entry.animation?.cancel();
    const landing = destinationFinder(entry.direction, itemId)(pool, board);
    landing?.classList.remove("ranking-awaiting-motion");
  }
  inFlight.clear();
  for (const token of document.querySelectorAll(".ranking-moving-token")) token.remove();
}
