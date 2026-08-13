const MAP_BOUNDS = {
  minLng: 5.5,
  maxLng: 15.6,
  minLat: 47.0,
  maxLat: 55.2
};

// Simplified mainland outline for a lightweight, dependency-free game map.
const GERMANY_OUTLINE = [
  [8.42, 54.91], [8.93, 54.83], [9.43, 54.84], [9.97, 54.75], [10.46, 54.46],
  [11.12, 54.40], [11.50, 54.15], [12.12, 54.35], [12.78, 54.47], [13.46, 54.17],
  [14.22, 53.94], [14.42, 53.33], [14.17, 52.83], [14.70, 52.57], [14.61, 51.91],
  [14.98, 51.10], [14.73, 50.83], [14.96, 50.40], [14.49, 50.13], [13.83, 50.72],
  [13.30, 50.57], [12.55, 50.41], [12.18, 50.22], [12.10, 49.46], [12.52, 49.08],
  [13.18, 48.77], [13.48, 48.57], [13.01, 48.31], [12.74, 47.72], [12.19, 47.62],
  [11.38, 47.50], [10.45, 47.56], [9.55, 47.54], [8.57, 47.62], [7.62, 47.59],
  [7.58, 48.13], [7.95, 48.57], [8.20, 48.96], [7.67, 49.17], [6.84, 49.12], [6.36, 49.47], [7.37, 49.64],
  [6.74, 49.54], [6.38, 49.83], [6.14, 50.15], [6.03, 50.76], [6.22, 51.13],
  [5.86, 51.48], [6.15, 51.89], [6.71, 51.95], [7.05, 52.24], [7.00, 52.64],
  [7.21, 53.28], [7.09, 53.69], [7.52, 53.68], [7.88, 53.92], [8.28, 54.30]
];

const VIEWBOX = { width: 620, height: 620, padding: 28 };

function project(position) {
  const usableWidth = VIEWBOX.width - VIEWBOX.padding * 2;
  const usableHeight = VIEWBOX.height - VIEWBOX.padding * 2;
  return {
    x: VIEWBOX.padding + (position.lng - MAP_BOUNDS.minLng) /
      (MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng) * usableWidth,
    y: VIEWBOX.padding + (MAP_BOUNDS.maxLat - position.lat) /
      (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat) * usableHeight
  };
}

function unproject(point) {
  const usableWidth = VIEWBOX.width - VIEWBOX.padding * 2;
  const usableHeight = VIEWBOX.height - VIEWBOX.padding * 2;
  return {
    lat: MAP_BOUNDS.maxLat - (point.y - VIEWBOX.padding) / usableHeight *
      (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat),
    lng: MAP_BOUNDS.minLng + (point.x - VIEWBOX.padding) / usableWidth *
      (MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng)
  };
}

function outlinePoints() {
  return GERMANY_OUTLINE.map(([lng, lat]) => {
    const point = project({ lat, lng });
    return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
  }).join(" ");
}

function isInsideGermany(position) {
  let inside = false;

  for (let current = 0, previous = GERMANY_OUTLINE.length - 1;
       current < GERMANY_OUTLINE.length;
       previous = current++) {
    const [currentLng, currentLat] = GERMANY_OUTLINE[current];
    const [previousLng, previousLat] = GERMANY_OUTLINE[previous];
    const crossesLatitude = (currentLat > position.lat) !== (previousLat > position.lat);
    const borderLng = (previousLng - currentLng) * (position.lat - currentLat) /
      (previousLat - currentLat) + currentLng;

    if (crossesLatitude && position.lng < borderLng) inside = !inside;
  }

  return inside;
}

function marker(position, type, label) {
  if (!position) return "";
  const point = project(position);
  return `
    <g class="map-marker ${type}" transform="translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})">
      <circle r="12"></circle>
      <circle r="4" class="marker-center"></circle>
      <text y="-18" text-anchor="middle">${label}</text>
    </g>
  `;
}

function connectingLine(pin, target, team) {
  if (!pin || !target) return "";
  const start = project(pin);
  const end = project(target);
  return `<line class="distance-line ${team}" x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}"></line>`;
}

export function createGermanyMap(container, options = {}) {
  let currentState = {};

  function render(nextState = {}) {
    currentState = nextState;
    const target = nextState.revealed ? nextState.target : null;
    const interactiveClass = options.onPlacePin && !nextState.locked ? " interactive" : "";

    container.innerHTML = `
      <svg class="germany-map-svg${interactiveClass}" viewBox="0 0 ${VIEWBOX.width} ${VIEWBOX.height}"
        role="img" aria-label="Deutschlandkarte">
        <defs>
          <filter id="map-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="8" stdDeviation="10" flood-opacity=".28" />
          </filter>
        </defs>
        <polygon class="germany-outline" points="${outlinePoints()}" filter="url(#map-shadow)"></polygon>
        ${connectingLine(nextState.pins?.blue, target, "blue")}
        ${connectingLine(nextState.pins?.red, target, "red")}
        ${marker(nextState.pins?.blue, "blue", "B")}
        ${marker(nextState.pins?.red, "red", "R")}
        ${marker(target, "target", "Ziel")}
      </svg>
    `;
  }

  container.addEventListener("click", (event) => {
    if (!options.onPlacePin || currentState.locked) return;
    const svg = event.target.closest("svg");
    if (!svg) return;

    const bounds = svg.getBoundingClientRect();
    const point = {
      x: (event.clientX - bounds.left) / bounds.width * VIEWBOX.width,
      y: (event.clientY - bounds.top) / bounds.height * VIEWBOX.height
    };
    const position = unproject(point);

    if (!isInsideGermany(position)) return;

    options.onPlacePin(position);
  });

  return { render };
}
