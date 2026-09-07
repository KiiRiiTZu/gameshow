// Konfetti für die Siegerehrung eines Spiels.
// Bewusst ohne Bibliothek: ein Canvas, ein rAF-Loop, danach räumt sich alles selbst ab.

const GRAVITY = 0.34;
const DRAG = 0.991;
const FLUTTER = 0.14;
const PARTICLES_PER_CANNON = 46;
const MAX_LIFETIME = 3400;

const TEAM_PALETTES = {
  blue: ["#5a72f6", "#8ca2ff", "#c7d2ff", "#ffffff", "#f4c451"],
  red: ["#e14c65", "#ef8095", "#ffc9d3", "#ffffff", "#f4c451"]
};

const NEUTRAL_PALETTE = ["#8ca2ff", "#e14c65", "#f4c451", "#ffffff", "#35d08a"];

let activeRun = null;

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function createParticle(originX, originY, angle, palette) {
  const speed = randomBetween(13, 26);
  const spread = randomBetween(-0.42, 0.42);
  return {
    x: originX,
    y: originY,
    vx: Math.cos(angle + spread) * speed,
    vy: Math.sin(angle + spread) * speed,
    width: randomBetween(7, 13),
    height: randomBetween(9, 16),
    rotation: randomBetween(0, Math.PI * 2),
    rotationSpeed: randomBetween(-0.24, 0.24),
    // Eigene Phase, damit die Flocken nicht im Gleichtakt flattern.
    wobble: randomBetween(0, Math.PI * 2),
    wobbleSpeed: randomBetween(0.08, 0.19),
    color: palette[Math.floor(Math.random() * palette.length)],
    bornAt: 0
  };
}

export const CONFETTI_PARTICLE_COUNT = PARTICLES_PER_CANNON * 2;

export function getConfettiPalette(team) {
  return TEAM_PALETTES[team] || NEUTRAL_PALETTE;
}

export function createConfettiParticles(width, height, palette) {
  const particles = [];
  // Zwei Bühnenkanonen, die von unten nach innen schießen — das liest sich mehr
  // als Feier als von oben herabrieselndes Konfetti.
  const cannons = [
    { x: width * 0.08, y: height * 0.96, angle: -Math.PI / 2.9 },
    { x: width * 0.92, y: height * 0.96, angle: -Math.PI + Math.PI / 2.9 }
  ];
  for (const cannon of cannons) {
    for (let index = 0; index < PARTICLES_PER_CANNON; index += 1) {
      particles.push(createParticle(cannon.x, cannon.y, cannon.angle, palette));
    }
  }
  return particles;
}

/**
 * Bewegt jede Flocke einen Schritt weiter und meldet, wie viele noch im Bild sind.
 * Bewusst frei von DOM und Canvas, damit die Physik ohne Browser testbar bleibt.
 */
export function advanceConfetti(particles, height) {
  let visible = 0;
  for (const particle of particles) {
    particle.vx *= DRAG;
    particle.vy = particle.vy * DRAG + GRAVITY;
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.rotation += particle.rotationSpeed;
    particle.wobble += particle.wobbleSpeed;
    // Seitliches Taumeln wie bei echtem Papier.
    particle.x += Math.cos(particle.wobble) * FLUTTER;
    if (particle.y - particle.height <= height) visible += 1;
  }
  return visible;
}

function createCanvas() {
  const canvas = document.createElement("canvas");
  canvas.className = "confetti-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.append(canvas);
  return canvas;
}

function sizeCanvas(canvas) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * ratio);
  canvas.height = Math.floor(window.innerHeight * ratio);
  return ratio;
}

export function stopConfetti() {
  if (!activeRun) return;
  cancelAnimationFrame(activeRun.frame);
  window.removeEventListener("resize", activeRun.onResize);
  activeRun.canvas.remove();
  activeRun = null;
}

/**
 * Kurzer Konfetti-Ausbruch in den Farben des Siegerteams.
 * Ein laufender Ausbruch wird ersetzt, damit sich keine Canvas-Elemente stapeln.
 */
export function burstConfetti(team = null) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  stopConfetti();

  const palette = getConfettiPalette(team);
  const canvas = createCanvas();
  const context = canvas.getContext("2d");
  let ratio = sizeCanvas(canvas);
  const particles = createConfettiParticles(window.innerWidth, window.innerHeight, palette);

  const onResize = () => {
    ratio = sizeCanvas(canvas);
  };
  window.addEventListener("resize", onResize);

  const startedAt = performance.now();
  const run = { canvas, onResize, frame: 0 };
  activeRun = run;

  const step = (now) => {
    if (activeRun !== run) return;

    const elapsed = now - startedAt;
    const height = canvas.height / ratio;
    const width = canvas.width / ratio;

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const visible = advanceConfetti(particles, height);
    const fade = Math.max(0, 1 - Math.max(0, elapsed - MAX_LIFETIME * 0.62) / (MAX_LIFETIME * 0.38));

    for (const particle of particles) {
      if (particle.y - particle.height > height || fade <= 0) continue;

      context.save();
      context.globalAlpha = fade;
      context.translate(particle.x, particle.y);
      context.rotate(particle.rotation);
      // Die Breite pulsiert mit dem Taumeln: so wirkt die Flocke wie ein
      // dünnes Blatt, das sich zur Kamera dreht.
      context.scale(Math.cos(particle.wobble) * 0.7 + 0.3, 1);
      context.fillStyle = particle.color;
      context.fillRect(-particle.width / 2, -particle.height / 2, particle.width, particle.height);
      context.restore();
    }

    if (!visible || elapsed > MAX_LIFETIME) {
      stopConfetti();
      return;
    }
    run.frame = requestAnimationFrame(step);
  };

  run.frame = requestAnimationFrame(step);
}
