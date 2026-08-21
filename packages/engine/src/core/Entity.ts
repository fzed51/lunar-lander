import type { Vector2 } from "../math/Vector2.ts";
import type { InputSnapshot } from "../input/InputSnapshot.ts";

/** Champs communs à toute entité gérée par le moteur. Tout est en lecture seule. */
export interface EntityBase {
  readonly id: number;
  /** Discriminant : le jeu définit ses propres valeurs (`'lander'`, `'particle'`, …). */
  readonly kind: string;
  readonly position: Vector2;
  readonly velocity: Vector2;
  /** Rayon de collision (cercle-cercle). */
  readonly radius: number;
}

/**
 * Comportement de la phase `move` : intègre le mouvement pour un pas de temps
 * et retourne une NOUVELLE entité. Aucune mutation en place.
 *
 * `E` est l'union des entités du jeu ; `step` est F-borné pour que le type de
 * retour reste précis (une entité renvoie une entité de son propre type).
 */
export interface Steppable<E, C extends string> {
  step(dt: number, input: InputSnapshot<C>): E;
}
