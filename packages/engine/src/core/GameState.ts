import type { EntityBase } from "./Entity.ts";

/**
 * Instantané immuable du monde à un tick donné.
 * Aucun helper ne mute l'état reçu : ils retournent tous un nouvel objet.
 */
export interface GameState<E extends EntityBase, G> {
  readonly entities: readonly E[];
  readonly globals: G;
  /** Temps de jeu cumulé (secondes). Sert aux timers purs (cooldown, respawn). */
  readonly time: number;
}

export function withEntities<E extends EntityBase, G>(
  s: GameState<E, G>,
  entities: readonly E[],
): GameState<E, G> {
  return { ...s, entities };
}

export function withGlobals<E extends EntityBase, G>(
  s: GameState<E, G>,
  globals: G,
): GameState<E, G> {
  return { ...s, globals };
}

export function addEntities<E extends EntityBase, G>(
  s: GameState<E, G>,
  added: readonly E[],
): GameState<E, G> {
  return added.length === 0 ? s : { ...s, entities: [...s.entities, ...added] };
}

export function removeEntities<E extends EntityBase, G>(
  s: GameState<E, G>,
  ids: ReadonlySet<number>,
): GameState<E, G> {
  return ids.size === 0
    ? s
    : { ...s, entities: s.entities.filter((e) => !ids.has(e.id)) };
}

export function byKind<E extends EntityBase, G, K extends E["kind"]>(
  s: GameState<E, G>,
  kind: K,
): readonly Extract<E, { kind: K }>[] {
  return s.entities.filter((e) => e.kind === kind) as unknown as readonly Extract<
    E,
    { kind: K }
  >[];
}

export function findById<E extends EntityBase, G>(
  s: GameState<E, G>,
  id: number,
): E | undefined {
  return s.entities.find((e) => e.id === id);
}
