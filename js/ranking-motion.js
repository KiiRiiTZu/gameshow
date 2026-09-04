function findByItemId(container, attribute, itemId) {
  return [...(container?.querySelectorAll(`[${attribute}]`) || [])]
    .find((element) => element.getAttribute(attribute) === itemId) || null;
}

export function captureRankingMove(game, pool, board) {
  const movingIntoList = Boolean(game.proposal?.itemId);
  const result = game.lastResult;
  const movingAfterReveal = Boolean(result?.itemId);
  if (!movingIntoList && !movingAfterReveal) return null;

  const itemId = movingIntoList ? game.proposal.itemId : result.itemId;
  const direction = movingIntoList
    ? "into-list"
    : result.cleanupReveal ? "cleanup-into-list" : result.correct ? "correct-in-list" : "back-to-pool";
  const source = direction === "into-list" || direction === "cleanup-into-list"
    ? findByItemId(pool, "data-ranking-item", itemId)
    : findByItemId(board, "data-ranking-proposal", itemId);
  if (!source) return null;

  const rect = source.getBoundingClientRect();
  return {
    itemId,
    direction,
    team: movingIntoList ? game.proposal.team : result.team,
    outcome: movingIntoList || result.cleanupReveal ? null : result.correct ? "correct" : "wrong",
    label: source.querySelector("strong")?.textContent || source.textContent.trim(),
    rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
  };
}

export function playRankingMove(move, pool, board) {
  if (!move) return;
  const destination = move.direction === "into-list"
    ? findByItemId(board, "data-ranking-proposal", move.itemId)
    : move.direction === "back-to-pool"
      ? findByItemId(pool, "data-ranking-item", move.itemId)
      : findByItemId(board, "data-ranking-placed", move.itemId);
  if (!destination) return;

  const flashResult = () => {
    if (!move.outcome) return;
    const className = `ranking-feedback-${move.outcome}`;
    destination.classList.remove(className);
    void destination.offsetWidth;
    destination.classList.add(className);
    destination.addEventListener("animationend", () => destination.classList.remove(className), { once: true });
  };
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    flashResult();
    return;
  }

  const target = destination.getBoundingClientRect();
  const token = document.createElement("div");
  token.className = `ranking-moving-token${move.team ? ` ${move.team}` : ""}`;
  token.textContent = move.label;
  Object.assign(token.style, {
    left: `${move.rect.left}px`,
    top: `${move.rect.top}px`,
    width: `${move.rect.width}px`,
    height: `${move.rect.height}px`
  });
  document.body.append(token);
  destination.style.visibility = "hidden";

  const animation = token.animate([
    { left: `${move.rect.left}px`, top: `${move.rect.top}px`, width: `${move.rect.width}px`, height: `${move.rect.height}px`, opacity: 1 },
    { left: `${target.left}px`, top: `${target.top}px`, width: `${target.width}px`, height: `${target.height}px`, opacity: 1 }
  ], {
    duration: 560,
    easing: "cubic-bezier(.22,.8,.28,1)",
    fill: "forwards"
  });
  const finish = () => {
    destination.style.visibility = "";
    token.remove();
    flashResult();
  };
  animation.finished.then(finish, finish);
}
