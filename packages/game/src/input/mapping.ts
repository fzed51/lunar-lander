import type { Command } from "../types.ts";

/** Table `KeyboardEvent.code` → commande. Le jeu se joue aux quatre flèches. */
export const KEY_MAP: Record<string, Command> = {
  ArrowLeft: "tilt-left",
  ArrowRight: "tilt-right",
  ArrowUp: "throttle-up",
  ArrowDown: "throttle-down",
  Enter: "confirm",
  Escape: "back",
  // Le hall of fame s'ouvre depuis l'accueil. `KeyH` est le **code** de la
  // touche, donc indépendant de la disposition du clavier.
  KeyH: "hof",
};
