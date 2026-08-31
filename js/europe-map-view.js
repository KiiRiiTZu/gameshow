const MAP_BOUNDS = {
  minLng: -26,
  maxLng: 46,
  minLat: 33,
  maxLat: 72.5
};

const VIEWBOX = { width: 760, height: 650, padding: 24 };
const CENTER_LATITUDE_RADIANS =
  (MAP_BOUNDS.minLat + MAP_BOUNDS.maxLat) / 2 * Math.PI / 180;
const LONGITUDE_SCALE = Math.cos(CENTER_LATITUDE_RADIANS);
const PROJECTED_WIDTH =
  (MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng) * LONGITUDE_SCALE;
const PROJECTED_HEIGHT = MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat;
const MAP_SCALE = Math.min(
  (VIEWBOX.width - VIEWBOX.padding * 2) / PROJECTED_WIDTH,
  (VIEWBOX.height - VIEWBOX.padding * 2) / PROJECTED_HEIGHT
);
const MAP_OFFSET_X = (VIEWBOX.width - PROJECTED_WIDTH * MAP_SCALE) / 2;
const MAP_OFFSET_Y = (VIEWBOX.height - PROJECTED_HEIGHT * MAP_SCALE) / 2;
const MAP_DATA_URL = new URL("../assets/maps/europe-countries-50m.geojson", import.meta.url);

let europeFeaturesPromise;

function loadEuropeFeatures() {
  europeFeaturesPromise ||= fetch(MAP_DATA_URL)
    .then((response) => {
      if (!response.ok) throw new Error(`Europe map could not be loaded (${response.status}).`);
      return response.json();
    })
    .then((collection) => Array.isArray(collection.features) ? collection.features : []);
  return europeFeaturesPromise;
}

function project(position) {
  return {
    x: MAP_OFFSET_X +
      (position.lng - MAP_BOUNDS.minLng) * LONGITUDE_SCALE * MAP_SCALE,
    y: MAP_OFFSET_Y + (MAP_BOUNDS.maxLat - position.lat) * MAP_SCALE
  };
}

function unproject(point) {
  return {
    lat: MAP_BOUNDS.maxLat - (point.y - MAP_OFFSET_Y) / MAP_SCALE,
    lng: MAP_BOUNDS.minLng +
      (point.x - MAP_OFFSET_X) / MAP_SCALE / LONGITUDE_SCALE
  };
}

function ringPath(ring) {
  return ring.map(([lng, lat], index) => {
    const point = project({ lat, lng });
    return `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }).join(" ") + " Z";
}

function geometryPath(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.flatMap((polygon) => polygon.map(ringPath)).join(" ");
}

function countryPaths(features) {
  return features.map((feature) => `
    <path class="europe-country" fill-rule="evenodd"
      aria-label="${String(feature.properties?.name || "Land")}" d="${geometryPath(feature.geometry)}"></path>
  `).join("");
}

function isInsideRing(position, ring) {
  let inside = false;
  for (let current = 0, previous = ring.length - 1;
       current < ring.length;
       previous = current++) {
    const [currentLng, currentLat] = ring[current];
    const [previousLng, previousLat] = ring[previous];
    const crossesLatitude = (currentLat > position.lat) !== (previousLat > position.lat);
    const borderLng = (previousLng - currentLng) * (position.lat - currentLat) /
      (previousLat - currentLat) + currentLng;
    if (crossesLatitude && position.lng < borderLng) inside = !inside;
  }
  return inside;
}

function isInsidePolygon(position, polygon) {
  if (!isInsideRing(position, polygon[0])) return false;
  return !polygon.slice(1).some((hole) => isInsideRing(position, hole));
}

function isInsideEurope(position, features) {
  return features.some((feature) => {
    const polygons = feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;
    return polygons.some((polygon) => isInsidePolygon(position, polygon));
  });
}

function marker(position, type, label, compact = false, scale = 1) {
  if (!position) return "";
  const point = project(position);
  const radius = compact ? 3 : 6;
  const centerRadius = compact ? 1 : 2;
  const labelOffset = compact ? -6 : -10;
  return `
    <g class="map-marker ${type}${compact ? " compact" : ""}"
      data-map-x="${point.x.toFixed(1)}" data-map-y="${point.y.toFixed(1)}"
      transform="translate(${point.x.toFixed(1)} ${point.y.toFixed(1)}) scale(${scale.toFixed(4)})">
      <circle r="${radius}"></circle>
      <circle r="${centerRadius}" class="marker-center"></circle>
      <text y="${labelOffset}" text-anchor="middle">${label}</text>
    </g>
  `;
}

function connectingLine(pin, target, team) {
  if (!pin || !target) return "";
  const start = project(pin);
  const end = project(target);
  return `<line class="distance-line ${team}" x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}"></line>`;
}

export function createEuropeMap(container, options = {}) {
  let currentState = {};
  let features = [];
  let loadError = false;
  let zoom = 1;
  let center = { x: VIEWBOX.width / 2, y: VIEWBOX.height / 2 };
  let drag = null;
  let suppressNextClick = false;

  function viewport() {
    const width = VIEWBOX.width / zoom;
    const height = VIEWBOX.height / zoom;
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    center.x = Math.min(VIEWBOX.width - halfWidth, Math.max(halfWidth, center.x));
    center.y = Math.min(VIEWBOX.height - halfHeight, Math.max(halfHeight, center.y));
    return { x: center.x - halfWidth, y: center.y - halfHeight, width, height };
  }

  function viewBoxValue() {
    const view = viewport();
    return `${view.x.toFixed(2)} ${view.y.toFixed(2)} ${view.width.toFixed(2)} ${view.height.toFixed(2)}`;
  }

  function updateViewport() {
    const svg = container.querySelector(".europe-map-svg");
    if (!svg) return;
    svg.setAttribute("viewBox", viewBoxValue());
    svg.classList.toggle("zoomed", zoom > 1);
    svg.querySelectorAll(".map-marker").forEach((mapMarker) => {
      const x = mapMarker.dataset.mapX;
      const y = mapMarker.dataset.mapY;
      mapMarker.setAttribute("transform", `translate(${x} ${y}) scale(${(1 / zoom).toFixed(4)})`);
    });
    const zoomIn = container.querySelector('[data-map-zoom="in"]');
    const zoomOut = container.querySelector('[data-map-zoom="out"]');
    if (zoomIn) zoomIn.disabled = zoom >= 4;
    if (zoomOut) zoomOut.disabled = zoom <= 1;
  }

  function render(nextState = currentState) {
    currentState = nextState;
    const target = nextState.revealed ? nextState.target : null;
    const interactiveClass = options.onPlacePin && !nextState.locked && features.length
      ? " interactive" : "";
    const zoomClass = options.enableZoom ? ` zoomable${zoom > 1 ? " zoomed" : ""}` : "";
    const markerScale = options.enableZoom ? 1 / zoom : 1;

    container.innerHTML = `
      <svg class="europe-map-svg${interactiveClass}${zoomClass}" viewBox="${viewBoxValue()}"
        role="img" aria-label="Europakarte mit Ländergrenzen">
        <defs>
          <filter id="europe-map-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="7" stdDeviation="8" flood-opacity=".22" />
          </filter>
        </defs>
        <rect class="europe-sea" width="${VIEWBOX.width}" height="${VIEWBOX.height}"></rect>
        <g class="europe-countries" filter="url(#europe-map-shadow)">
          ${features.length ? countryPaths(features) : ""}
        </g>
        ${connectingLine(nextState.pins?.blue, target, "blue")}
        ${connectingLine(nextState.pins?.red, target, "red")}
        ${marker(nextState.pins?.blue, "blue", "B", options.compactMarkers, markerScale)}
        ${marker(nextState.pins?.red, "red", "R", options.compactMarkers, markerScale)}
        ${marker(target, "target", "Ziel", options.compactMarkers, markerScale)}
        ${!features.length
          ? `<text class="map-loading" x="${VIEWBOX.width / 2}" y="${VIEWBOX.height / 2}" text-anchor="middle">` +
            `${loadError ? "Europakarte konnte nicht geladen werden" : "Europakarte wird geladen…"}</text>`
          : ""}
      </svg>
      ${options.enableZoom ? `
        <div class="map-zoom-controls" aria-label="Kartenzoom">
          <button type="button" data-map-zoom="in" aria-label="Karte vergrößern"${zoom >= 4 ? " disabled" : ""}>+</button>
          <button type="button" data-map-zoom="out" aria-label="Karte verkleinern"${zoom <= 1 ? " disabled" : ""}>−</button>
        </div>
      ` : ""}
    `;
  }

  loadEuropeFeatures()
    .then((loadedFeatures) => {
      features = loadedFeatures;
      render();
    })
    .catch((error) => {
      console.error(error);
      loadError = true;
      render();
    });

  container.addEventListener("click", (event) => {
    const zoomAction = event.target.closest("[data-map-zoom]")?.dataset.mapZoom;
    if (zoomAction) {
      zoom = zoomAction === "in" ? Math.min(4, zoom * 1.5) : Math.max(1, zoom / 1.5);
      if (zoom < 1.01) zoom = 1;
      updateViewport();
      return;
    }
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    if (!options.onPlacePin || currentState.locked || !features.length) return;
    const svg = event.target.closest("svg");
    if (!svg) return;
    const bounds = svg.getBoundingClientRect();
    const view = viewport();
    const point = {
      x: view.x + (event.clientX - bounds.left) / bounds.width * view.width,
      y: view.y + (event.clientY - bounds.top) / bounds.height * view.height
    };
    const position = unproject(point);
    if (!isInsideEurope(position, features)) return;
    options.onPlacePin(position);
  });

  container.addEventListener("wheel", (event) => {
    const svg = event.target.closest(".europe-map-svg.zoomable");
    if (!svg) return;
    event.preventDefault();

    const bounds = svg.getBoundingClientRect();
    const previousView = viewport();
    const ratioX = (event.clientX - bounds.left) / bounds.width;
    const ratioY = (event.clientY - bounds.top) / bounds.height;
    const focusX = previousView.x + ratioX * previousView.width;
    const focusY = previousView.y + ratioY * previousView.height;
    const zoomFactor = Math.exp(-event.deltaY * 0.0015);
    const nextZoom = Math.min(4, Math.max(1, zoom * zoomFactor));
    if (Math.abs(nextZoom - zoom) < 0.001) return;

    zoom = nextZoom < 1.01 ? 1 : nextZoom;
    const nextWidth = VIEWBOX.width / zoom;
    const nextHeight = VIEWBOX.height / zoom;
    center.x = focusX + (0.5 - ratioX) * nextWidth;
    center.y = focusY + (0.5 - ratioY) * nextHeight;
    updateViewport();
  }, { passive: false });

  container.addEventListener("pointerdown", (event) => {
    const svg = event.target.closest(".europe-map-svg.zoomable");
    if (!svg || zoom <= 1 || event.button !== 0) return;
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      centerX: center.x,
      centerY: center.y,
      moved: false
    };
    svg.setPointerCapture(event.pointerId);
    svg.classList.add("dragging");
  });

  container.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const svg = event.target.closest(".europe-map-svg") || container.querySelector(".europe-map-svg");
    if (!svg) return;
    const bounds = svg.getBoundingClientRect();
    const view = viewport();
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.hypot(deltaX, deltaY) > 4) drag.moved = true;
    center.x = drag.centerX - deltaX / bounds.width * view.width;
    center.y = drag.centerY - deltaY / bounds.height * view.height;
    updateViewport();
  });

  function finishDrag(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressNextClick = drag.moved;
    container.querySelector(".europe-map-svg")?.classList.remove("dragging");
    drag = null;
  }

  container.addEventListener("pointerup", finishDrag);
  container.addEventListener("pointercancel", finishDrag);

  render();
  return { render };
}
