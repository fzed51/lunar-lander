import type { Lander } from "./entities/Lander.ts";
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
export type LemEntity = Lander | Particle;

/**
 * Union discriminée des événements émis en phase interact, appliqués par les
 * reducers en phase état final. Elle vit dans `events.ts`, avec les charges
 * utiles de chaque variante, et n'est reprise ici que pour rester importable
 * d'un seul endroit.
 */
export type { LemEvent } from "./events.ts";

/**
 * Données globales de la partie et de sa manche en cours. Elles vivent dans
 * `state.ts`, avec la création de partie et de manche qui les fabrique, et ne
 * sont reprises ici que pour rester importables d'un seul endroit — comme
 * `LemEvent`.
 */
export type { Globals, Statut, EtatPartie } from "./state.ts";
