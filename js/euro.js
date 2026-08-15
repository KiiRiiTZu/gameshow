function validAmount(value) {
  return Number.isFinite(value) && value >= 0 && value <= 10_000_000;
}

function cents(value) {
  return Math.round(Number(value) * 100) / 100;
}

export function parseEuroAmount(value) {
  let normalized = String(value ?? "")
    .trim()
    .replace(/[€\s]/g, "")
    .replace(/[^\d,.-]/g, "");

  if (!normalized || normalized === "-" || normalized.startsWith("-")) return null;

  if (normalized.includes(",")) {
    normalized = normalized.replaceAll(".", "").replace(",", ".");
  } else {
    const dotParts = normalized.split(".");
    if (dotParts.length > 2 || (dotParts.length === 2 && dotParts[1].length === 3)) {
      normalized = dotParts.join("");
    }
  }

  const amount = Number(normalized);
  return validAmount(amount) ? cents(amount) : null;
}

export function formatEuroAmount(value) {
  if (!validAmount(Number(value))) return "—";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value));
}

export function formatSignedEuroDifference(actualPrice, guess) {
  const difference = cents(Number(guess) - Number(actualPrice));
  if (!Number.isFinite(difference) || Math.abs(difference) > 10_000_000) return "—";
  const sign = difference >= 0 ? "+" : "−";
  return `${sign}${formatEuroAmount(Math.abs(difference))}`;
}
