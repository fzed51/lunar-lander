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
  // La remise à zéro du classement, depuis le hall of fame et lui seul.
  // `Ctrl+R` et `Cmd+R` rechargent la page sans jamais produire cette commande :
  // `KeyboardInput` écarte tout `keydown` porteur d'un modificateur, et c'est
  // là — une fois pour toutes — que le filtre est posé, pas dans l'écran.
  KeyR: "raz",
};
