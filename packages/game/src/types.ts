import type { Particle } from "./entities/Particle.ts";

/**
 * Commandes du jeu. Tout se joue aux quatre flèches ; `confirm` et `back`
 * servent la navigation entre écrans.
 */
export type Command =
  | "tilt-left"
  | "tilt-right"
  | "throttle-up"
  | "throttle-down"
  | "confirm"
  | "back";

/** Union discriminée des entités du jeu. */
export type LemEntity = Particle;

/**
 * Union discriminée des événements émis en phase interact, appliqués par les
 * reducers en phase état final.
 */
export type LemEvent = { type: "particle-died"; particleId: number };

/**
 * Données globales de la manche. Portent ce qui ne meurt pas avec une entité.
 * Générateur d'ids PUR : incrémenté par les reducers qui spawnent.
 */
export interface Globals {
  readonly nextId: number;
}
