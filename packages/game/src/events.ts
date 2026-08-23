/**
 * Événements du jeu : ce que les règles de tick émettent en phase interact, et
 * que les reducers appliquent en phase état final.
 *
 * Une **seule union discriminée** par `type`, comme le veut le moteur : le nom de
 * l'événement et sa charge utile voyagent ensemble, jamais dans deux champs
 * séparés qu'il faudrait recroiser à la main.
 *
 * Les deux fins de manche sont **deux événements distincts** et non un seul
 * paramétré : un contact porte un verdict à ranger dans le score, une sortie du
 * monde n'a rien à porter. Elles sont aussi **exclusives** dans un tick donné —
 * `Scene.tick` replie tous les événements produits, et appliquer les deux
 * reducers sur le même état sortirait un état incohérent (une manche réussie de
 * plus **et** une vie de moins).
 */

import type { Verdict } from "./landing.ts";

/**
 * Union discriminée des événements du jeu.
 *
 * - `contact` — le LEM a touché le sol ; le verdict dit s'il est posé ou détruit
 *   et, pour un posé, l'écart au drapeau qui fait les points de la manche ;
 * - `hors-limites` — le LEM a quitté le monde ; la manche est perdue sans qu'il
 *   y ait de verdict de contact à rendre ;
 * - `particle-died` — une particule a épuisé sa durée de vie ;
 * - `gaz-moteur` — le moteur tourne : une bouffée de gaz à cracher sous la
 *   tuyère, pour le `dt` écoulé ;
 * - `temps-vol` — un pas de temps de vol de plus à porter au chrono ;
 * - `manche-suivante` — le bandeau de fin de manche a tenu son délai.
 *
 * Les trois derniers ne viennent pas d'une rencontre entre entités mais du
 * déroulement de la manche, et ils existent parce qu'une `TickRule` du moteur
 * **émet** sans jamais écrire l'état : seul un reducer écrit les globals. Un
 * chrono, un enchaînement de manche ou une gerbe de particules calculés dans la
 * règle elle-même n'auraient nulle part où se ranger.
 */
export type LemEvent =
  | { readonly type: "contact"; readonly verdict: Verdict }
  | { readonly type: "hors-limites" }
  | { readonly type: "particle-died"; readonly particleId: number }
  | { readonly type: "gaz-moteur"; readonly dt: number }
  | { readonly type: "temps-vol"; readonly dt: number }
  | { readonly type: "manche-suivante" };
