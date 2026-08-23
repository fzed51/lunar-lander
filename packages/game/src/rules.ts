/**
 * Règles de tick de la manche : elles **émettent** des événements et n'écrivent
 * jamais l'état, ce sont les reducers qui l'écrivent.
 *
 * Il y en a **cinq**, et il n'y a **aucune règle de pause**. Une `TickRule` est
 * évaluée à l'intérieur de `Scene.tick`, et l'écran de jeu ne ticke plus la scène
 * dès que le statut vaut `"pause"` (T10) : l'entrée de pause et sa sortie se
 * retrouveraient de part et d'autre de la frontière, la seule fonction capable de
 * lire `confirm` / `back` ne tournerait plus, et le voile « ENTREE REPRENDRE /
 * ECHAP ABANDONNER » ne répondrait à rien. Le front montant n'est même pas
 * récupérable plus tard : `GestionnaireEcrans.tick` sonde le clavier à chaque
 * image et `KeyboardInput.poll()` vide le tampon des fronts montants, donc chaque
 * appui est consommé puis jeté. L'entrée et la sortie de pause vivent donc du
 * même côté de la frontière : ce sont les reducers `surPause`, `surReprise` et
 * `surAbandon`, appliqués par l'écran.
 */

import { byKind, type TickRule } from "@lem/engine";
import { DELAI_ENCHAINEMENT } from "./constants.ts";
import { sansCarburant } from "./entities/Lander.ts";
import { evalueContact, horsLimites, toucheLeSol } from "./landing.ts";
import type { EtatPartie } from "./state.ts";
import type { Command, LemEvent } from "./types.ts";

/** Règle de tick de la manche. Alias : la signature revient cinq fois. */
export type RegleManche = TickRule<EtatPartie, LemEvent, Command>;

/**
 * Fin de manche : sortie du monde ou contact avec le sol.
 *
 * N'émet **rien** hors du vol, ni si la fin de manche a déjà été signalée. Ces
 * deux gardes sont indispensables : `toucheLeSol` et `horsLimites` restent vrais
 * indéfiniment après le verdict, donc sans elles cinq images au sol coûteraient
 * cinq décomptes et une sortie de carte coûterait la partie en trois images.
 *
 * **Au plus un** événement de fin de manche par tick, et la sortie du monde
 * **prime** : les deux conditions peuvent tomber dans le même tick, et
 * `Scene.tick` replie tous les événements produits — les deux reducers
 * s'appliqueraient et l'état sortirait incohérent, une manche réussie de plus
 * **et** une vie de moins.
 */
export const regleContact: RegleManche = (etat) => {
  const g = etat.globals;
  if (g.statut !== "vol" || g.contactEmisPourManche) return [];

  const lem = byKind(etat, "lander")[0];
  if (!lem) return [];

  if (horsLimites(lem)) return [{ type: "hors-limites" }];
  if (toucheLeSol(g.terrain, lem)) {
    return [{ type: "contact", verdict: evalueContact(g.terrain, lem) }];
  }
  return [];
};

/**
 * Chrono : un pas de temps de vol de plus, **et seulement en vol**. Rien ne
 * tourne en pause, ni sur le bandeau de fin de manche, ni après la partie.
 */
export const regleTempsDeVol: RegleManche = (etat, ctx) => {
  if (etat.globals.statut !== "vol") return [];
  return [{ type: "temps-vol", dt: ctx.dt }];
};

/**
 * Enchaînement : le bandeau de posé ou de crash a tenu `DELAI_ENCHAINEMENT`.
 *
 * Le délai se mesure sur `state.time` et `instantStatut`, **pas** sur
 * `tempsDeVol` ni `tempsManche` : ces deux-là sont gelés hors du vol, le seuil ne
 * serait jamais franchi et la partie resterait coincée sur le bandeau.
 *
 * Cela suppose que la scène **continue de ticker** en `"pose"` et en `"crash"` —
 * c'est le cas, seule la `pause` la suspend (T10). Si un jour la scène était
 * suspendue là aussi, l'enchaînement s'arrêterait avec elle. Corollaire de cette
 * scène qui tourne : elle appelle `step` sur toutes les entités à chaque tick,
 * donc le LEM **doit** avoir été figé par le reducer du verdict.
 */
export const regleEnchainement: RegleManche = (etat) => {
  const g = etat.globals;
  if (g.statut !== "pose" && g.statut !== "crash") return [];
  if (etat.time - g.instantStatut < DELAI_ENCHAINEMENT) return [];
  return [{ type: "manche-suivante" }];
};

/**
 * Gaz du moteur : une bouffée par image, **en vol seulement**, moteur allumé et
 * réservoir non vide.
 *
 * La règle n'émet que l'événement et son `dt` : c'est `surGaz` qui fabrique la
 * gerbe, parce qu'elle a besoin d'écrire trois globals — le prochain id, le reste
 * fractionnaire du débit et le compteur de tirages — et qu'une règle de tick
 * n'écrit jamais l'état.
 *
 * Elle est enregistrée **après** `regleContact` : les deux peuvent tomber dans le
 * même tick, et `Scene.tick` replie les événements dans l'ordre où ils sont
 * produits. Le contact passe donc d'abord, met le statut hors du vol, et la
 * bouffée de gaz est ignorée par la garde de statut de son propre reducer — pas
 * de panache sous un LEM déjà jugé.
 */
export const regleGaz: RegleManche = (etat, ctx) => {
  if (etat.globals.statut !== "vol") return [];
  const lem = byKind(etat, "lander")[0];
  if (!lem || lem.inerte || lem.cran <= 0 || sansCarburant(lem)) return [];
  return [{ type: "gaz-moteur", dt: ctx.dt }];
};

/**
 * Mort des particules : une par particule dont l'âge a atteint sa durée de vie.
 *
 * **Sans cette règle, aucune particule ne quitte jamais la scène** : `Scene.tick`
 * fait vieillir les entités mais ne retire rien, et `surParticuleMorte` n'a aucun
 * émetteur. Le plafond `PARTICULES_MAX` deviendrait alors un interrupteur
 * définitif — 30 particules par seconde au cran 5, donc 400 atteintes en 13 s de
 * poussée — après quoi plus aucune particule, gaz, explosion ou poussière,
 * n'apparaîtrait jusqu'à la manche suivante.
 *
 * Aucune garde de statut : les particules doivent finir de mourir pendant le
 * bandeau de fin de manche, où la scène tourne toujours.
 */
export const regleParticules: RegleManche = (etat) => {
  const morts: LemEvent[] = [];
  for (const entite of etat.entities) {
    if (entite.kind === "particle" && entite.age >= entite.life) {
      morts.push({ type: "particle-died", particleId: entite.id });
    }
  }
  return morts;
};
