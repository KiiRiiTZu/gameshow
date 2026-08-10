// Small registry so later games can be plugged into the same room/lobby layer.
const registry = new Map();

export function registerGame(gameDefinition) {
  if (!gameDefinition?.id) throw new Error("Game definition needs an id.");
  registry.set(gameDefinition.id, gameDefinition);
}

export function getGame(id) {
  return registry.get(id);
}

export function listGames() {
  return [...registry.values()];
}
