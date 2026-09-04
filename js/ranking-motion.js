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

export function playRankingMove(move, pool, board) {
  if (!move) return;
  const destination = move.direction === "into-list"
    ? findByItemId(board, "data-ranking-proposal", move.itemId)
    : move.direction === "wrong-back-to-pool"
      ? findByItemId(pool, "data-ranking-item", move.itemId)
      : findByItemId(board, "data-ranking-placed", move.itemId);
  if (!destination) return;

  const flashResult = (outcome) => {
    const className = `ranking-feedback-${outcome}`;
    destination.classList.remove(className);
    void destination.offsetWidth;
    destination.classList.add(className);
    destination.addEventListener("animationend", () => destination.classList.remove(className), { once: true });
  };
  if (move.direction === "correct-feedback") {
    destination.classList.remove("ranking-awaiting-motion");
    flashResult("correct");
    return;
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    destination.classList.remove("ranking-awaiting-motion");
    if (move.direction === "wrong-back-to-pool") flashResult("wrong");
    return;
  }

  const target = destination.getBoundingClientRect();
  const translateX = target.left - move.rect.left;
  const translateY = target.top - move.rect.top;
  const scaleX = move.rect.width ? target.width / move.rect.width : 1;
  const scaleY = move.rect.height ? target.height / move.rect.height : 1;
  const token = document.createElement("div");
  token.className = `ranking-moving-token${move.team ? ` ${move.team}` : ""}`;
  token.textContent = move.label;
  Object.assign(token.style, {
    left: `${move.rect.left}px`,
    top: `${move.rect.top}px`,
    width: `${move.rect.width}px`,
    height: `${move.rect.height}px`,
    transformOrigin: "top left"
  });
  document.body.append(token);
  destination.classList.add("ranking-awaiting-motion");

  const finalTransform = `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`;
  const isWrong = move.direction === "wrong-back-to-pool";
  const keyframes = isWrong
    ? [
        { transform: "translate(0, 0) scale(1)", borderColor: "#ef536b", background: "rgba(210,55,80,.28)", offset: 0 },
        { transform: "translate(0, 0) scale(1)", borderColor: "#ef536b", background: "rgba(210,55,80,.5)", offset: .42 },
        { transform: finalTransform, borderColor: "#ef536b", background: "rgba(210,55,80,.3)", offset: 1 }
      ]
    : [
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
        { transform: finalTransform, opacity: 1 }
      ];
  const animation = token.animate(keyframes, {
    duration: isWrong ? 1100 : 620,
    easing: "cubic-bezier(.22,.8,.28,1)",
    fill: "forwards"
  });
  const finish = () => {
    destination.classList.remove("ranking-awaiting-motion");
    token.remove();
  };
  animation.finished.then(finish, finish);
}
