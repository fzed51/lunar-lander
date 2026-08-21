/**
 * État d'une partie : les données globales d'une manche, la création d'une
 * partie et d'une manche, et le résultat publié quand la partie est finie.
 *
 * ## Tout l'état de simulation vit dans le `GameState`
 *
 * Aucun drapeau, aucun accumulateur, aucun horodatage en variable de module. Un
 * état caché hors du `GameState` casse la pureté des reducers, rend la partie
 * non reproductible à graine égale, et surtout **survit à la manche** : après le
 * premier contact de la session, plus aucune manche ne se terminerait.
 *
 * ## Deux compteurs de manches, pas un
 *
 * `numeroManche` compte **toutes** les manches jouées, `manchesReussies` seulement
 * celles qui ont fini par un posé. C'est `numeroManche` qui dérive la graine du
 * terrain : dériver depuis `manchesReussies`, qui ne bouge pas sur un crash,
 * ferait rejouer le même terrain à l'identique après chaque échec.
 */

import { melangeGraine, Vector2, type GameState } from "@lem/engine";
import { DEPART_Y, VIES_INITIALES } from "./constants.ts";
import {
  carburantInitial,
  difficulteDe,
  vitesseHorizontaleInitiale,
} from "./difficulty.ts";
import { Lander } from "./entities/Lander.ts";
import type { Verdict } from "./landing.ts";
import { totalPoints } from "./score.ts";
import { genereTerrain, type Terrain } from "./terrain.ts";
import type { LemEntity } from "./types.ts";

/**
 * Où en est la manche.
 *
 * - `vol` — la manche se joue : c'est le **seul** statut où le chrono tourne et
 *   où un contact peut être signalé ;
 * - `pause` — la scène est suspendue par l'écran de jeu (T10) ;
 * - `pose` / `crash` — la manche est jugée, le bandeau s'affiche, la scène
 *   continue de ticker pour que `DELAI_ENCHAINEMENT` puisse s'écouler ;
 * - `fini` — la partie est terminée : plus de vie, ou abandon.
 */
export type Statut = "vol" | "pause" | "pose" | "crash" | "fini";

/**
 * Données globales d'une partie et de sa manche en cours. Portent ce qui ne
 * meurt pas avec une entité.
 */
export interface Globals {
  /** Générateur d'ids PUR : incrémenté par ce qui crée des entités. */
  readonly nextId: number;

  /** Où en est la manche. Voir `Statut`. */
  readonly statut: Statut;

  /** Vies restantes. Un crash en coûte une ; à 0 la partie est finie. */
  readonly vies: number;

  /** Difficulté de départ, celle du niveau choisi à l'accueil. */
  readonly niveauDepart: number;

  /** Manches terminées par un posé. C'est ce compteur qui durcit la difficulté. */
  readonly manchesReussies: number;

  /**
   * Manches jouées, réussies ou non, en comptant celle en cours. La graine du
   * terrain en descend : deux manches d'une même partie n'ont jamais le même
   * relief, crash inclus.
   */
  readonly numeroManche: number;

  /** Écarts au drapeau des manches réussies, dans l'ordre. Le score en est la somme. */
  readonly ecarts: readonly number[];

  /** Temps de vol cumulé de la partie (s). Clé principale du hall of fame. */
  readonly tempsDeVol: number;

  /** Temps de vol de la manche en cours (s). Remis à 0 à chaque manche. */
  readonly tempsManche: number;

  /** Relief de la manche en cours, avec sa cible et ses replis. */
  readonly terrain: Terrain;

  /** Graine de la **partie** : la seule entropie venue de l'extérieur. */
  readonly graine: number;

  /** Verdict du dernier contact de la manche, pour le bandeau de fin de manche. */
  readonly dernierVerdict: Verdict | null;

  /** Vrai si la partie s'est arrêtée sur un abandon depuis la pause. */
  readonly abandonnee: boolean;

  /**
   * Reste fractionnaire du débit de particules de gaz (T12). Il vit ici, et pas
   * dans une variable de module : un état caché hors du `GameState` casse la
   * pureté et rend la partie non reproductible.
   */
  readonly gazAccu: number;

  /**
   * Valeur de `state.time` au **dernier changement de statut**.
   *
   * C'est le seul horodatage qui permette de mesurer le délai d'enchaînement :
   * `tempsDeVol` et `tempsManche` sont gelés dès qu'on quitte `"vol"`, donc
   * aucun des deux n'avance pendant `pose` ou `crash`. `state.time`, lui,
   * continue d'avancer parce que `Scene.tick` l'incrémente à chaque tick et que
   * l'écran de jeu ne suspend la scène qu'en `pause` (T10).
   */
  readonly instantStatut: number;

  /**
   * Garde « un seul événement de fin de manche », contact **et** sortie du monde
   * confondus.
   *
   * Elle est portée par la **manche** et remise à faux par `nouvelleManche` : le
   * statut, lui, repasse à `"vol"` en sortie de pause, ce qui rouvrirait la porte
   * et ferait recompter le même atterrissage.
   */
  readonly contactEmisPourManche: boolean;
}

/** État complet d'une partie. Alias : le type revient partout ailleurs. */
export type EtatPartie = GameState<LemEntity, Globals>;

/** Ce qu'il faut pour fabriquer la manche `numeroManche` d'une partie. */
interface ParamsManche {
  readonly graine: number;
  readonly niveauDepart: number;
  readonly manchesReussies: number;
  /** Numéro de la manche à fabriquer, celle qui va commencer. */
  readonly numeroManche: number;
  /** Id à donner au LEM. */
  readonly idLem: number;
}

/**
 * Relief et LEM d'une manche. Pur et déterministe : mêmes paramètres, même
 * terrain et même LEM au bit près.
 *
 * La graine de la manche est dérivée par `melangeGraine(graine, numeroManche)` :
 * deux manches voisines n'ont donc aucune corrélation visible, et deux parties
 * lancées sur la même graine voient exactement la même suite de terrains.
 */
function creeManche(p: ParamsManche): { terrain: Terrain; lem: Lander } {
  const difficulte = difficulteDe(p.niveauDepart, p.manchesReussies);
  const terrain = genereTerrain(
    melangeGraine(p.graine, p.numeroManche),
    difficulte,
  );
  const lem = new Lander(
    p.idLem,
    new Vector2(terrain.depart.x, DEPART_Y),
    // Le signe vient du terrain : la dérive initiale pointe vers la cible.
    new Vector2(
      vitesseHorizontaleInitiale(difficulte, terrain.depart.sens),
      0,
    ),
    0,
    0,
    carburantInitial(difficulte),
  );
  return { terrain, lem };
}

/**
 * Partie neuve, première manche prête à jouer : trois vies, aucun écart, chrono
 * à zéro.
 *
 * `graine` est la seule entropie extérieure du jeu — c'est l'écran d'accueil qui
 * la tire (T13) — et `niveauDepart` la difficulté du niveau choisi.
 */
export function nouvellePartie(
  niveauDepart: number,
  graine: number,
): EtatPartie {
  const { terrain, lem } = creeManche({
    graine,
    niveauDepart,
    manchesReussies: 0,
    numeroManche: 1,
    idLem: 0,
  });
  return {
    entities: [lem],
    time: 0,
    globals: {
      nextId: 1,
      statut: "vol",
      vies: VIES_INITIALES,
      niveauDepart,
      manchesReussies: 0,
      numeroManche: 1,
      ecarts: [],
      tempsDeVol: 0,
      tempsManche: 0,
      terrain,
      graine,
      dernierVerdict: null,
      abandonnee: false,
      gazAccu: 0,
      instantStatut: 0,
      contactEmisPourManche: false,
    },
  };
}

/**
 * Manche suivante de la partie en cours : nouveau relief, LEM largué au point de
 * départ du terrain, réservoir refait, chrono de manche et garde de contact
 * remis à zéro, statut de retour au vol.
 *
 * Les entités de la manche précédente — LEM figé, débris de l'explosion — sont
 * remplacées par le seul LEM neuf : elles n'ont rien à faire dans le relief
 * suivant.
 *
 * Ce qui **ne** bouge pas : `vies`, `manchesReussies`, `ecarts`, `tempsDeVol` et
 * `graine`, qui appartiennent à la partie et non à la manche.
 */
export function nouvelleManche(etat: EtatPartie): EtatPartie {
  const g = etat.globals;
  const numeroManche = g.numeroManche + 1;
  const { terrain, lem } = creeManche({
    graine: g.graine,
    niveauDepart: g.niveauDepart,
    manchesReussies: g.manchesReussies,
    numeroManche,
    idLem: g.nextId,
  });
  return {
    ...etat,
    entities: [lem],
    globals: {
      ...g,
      nextId: g.nextId + 1,
      statut: "vol",
      numeroManche,
      terrain,
      tempsManche: 0,
      dernierVerdict: null,
      gazAccu: 0,
      instantStatut: etat.time,
      contactEmisPourManche: false,
    },
  };
}

/**
 * Ce qu'une partie finie laisse derrière elle : de quoi afficher le bilan (T15)
 * et de quoi classer la partie au hall of fame (T14).
 */
export interface ResultatPartie {
  readonly manchesReussies: number;
  /** Total de points, la somme des écarts. Le plus petit est le meilleur. */
  readonly points: number;
  readonly tempsDeVol: number;
  readonly niveauDepart: number;
  /** Vrai si la partie s'est arrêtée sur un abandon depuis la pause. */
  readonly abandonnee: boolean;
}

/**
 * Extrait le résultat d'une partie. Ne juge pas si la partie est finie : c'est
 * l'écran de jeu qui ne publie la transition `"fin"` qu'au passage à `"fini"`
 * (T10).
 */
export function resultatPartie(etat: EtatPartie): ResultatPartie {
  const g = etat.globals;
  return {
    manchesReussies: g.manchesReussies,
    points: totalPoints(g.ecarts),
    tempsDeVol: g.tempsDeVol,
    niveauDepart: g.niveauDepart,
    abandonnee: g.abandonnee,
  };
}
