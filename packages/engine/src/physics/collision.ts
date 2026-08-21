import type { EntityBase } from "../core/Entity.ts";
import { toroidalDelta } from "../math/wrap.ts";

/** Recouvrement de deux cercles en géométrie euclidienne (par défaut du moteur). */
export function circlesOverlap(a: EntityBase, b: EntityBase): boolean {
  const r = a.radius + b.radius;
  return a.position.sub(b.position).length() <= r;
}

/**
 * Fabrique un prédicat de recouvrement pour un monde torique `w`×`h`.
 * Deux entités de part et d'autre d'un bord peuvent se toucher.
 */
export function circlesOverlapToroidal(
  w: number,
  h: number,
): (a: EntityBase, b: EntityBase) => boolean {
  return (a, b) => {
    const r = a.radius + b.radius;
    return toroidalDelta(a.position, b.position, w, h).length() <= r;
  };
}

/**
 * Toutes les paires d'entités qui se recouvrent. O(n²) naïf — largement
 * suffisant à cette échelle (< 100 entités). Chaque paire apparaît une fois.
 */
export function collisionPairs<E extends EntityBase>(
  entities: readonly E[],
  overlaps: (a: E, b: E) => boolean,
): readonly [E, E][] {
  const pairs: [E, E][] = [];
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const a = entities[i]!;
      const b = entities[j]!;
      if (overlaps(a, b)) pairs.push([a, b]);
    }
  }
  return pairs;
}
