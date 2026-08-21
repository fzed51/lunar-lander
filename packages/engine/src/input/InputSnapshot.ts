/**
 * Vue en lecture seule de l'état des commandes pour un tick.
 * `C` est l'union des noms de commandes du jeu.
 */
export interface InputSnapshot<C extends string> {
  /** La commande est maintenue active (touche enfoncée). */
  isActive(c: C): boolean;
  /** Front montant : pressée depuis le dernier `poll()` (survit aux frames skippées). */
  justPressed(c: C): boolean;
}
