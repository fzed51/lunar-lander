/**
 * Montée de la difficulté et dotations d'une manche.
 *
 * Trois fonctions pures, sans mémoire et sans tirage aléatoire : la difficulté
 * d'une manche se **calcule** depuis le niveau choisi à l'accueil et le nombre
 * de manches réussies, jamais depuis un compteur caché.
 *
 * La difficulté est une grandeur continue plafonnée à `DIFFICULTE_MAX`, qui est
 * un plafond **gagnable** : au-delà, cent manches de plus ne durcissent plus
 * rien.
 */

import {
  CARBURANT_BASE,
  CARBURANT_MIN,
  CARBURANT_PENTE,
  DIFFICULTE_MAX,
  PALIER_DIFFICULTE,
  VH_BASE,
  VH_MAX,
  VH_PENTE,
} from "./constants.ts";

/**
 * Difficulté d'une manche : le niveau de départ, plus un palier par manche
 * **réussie**, plafonné.
 *
 * Le palier est doux à dessein — 0,08 — donc il faut treize manches réussies
 * pour franchir un cran entier. Une partie qui dure ne devient pas injouable
 * d'un coup.
 */
export function difficulteDe(
  niveauDepart: number,
  manchesReussies: number,
): number {
  return Math.min(
    DIFFICULTE_MAX,
    niveauDepart + PALIER_DIFFICULTE * manchesReussies,
  );
}

/**
 * Vitesse horizontale (m/s) du LEM au largage.
 *
 * La **norme** monte avec la difficulté jusqu'à `VH_MAX` ; le **signe** est
 * imposé par le terrain — `terrain.depart.sens`, qui pointe vers la cible — et
 * n'est jamais tiré au hasard. Une manche sur deux commencerait sinon en
 * s'éloignant du drapeau, ce qui n'est pas une difficulté mais une loterie.
 */
export function vitesseHorizontaleInitiale(
  difficulte: number,
  sens: 1 | -1,
): number {
  return sens * Math.min(VH_MAX, VH_BASE + VH_PENTE * difficulte);
}

/**
 * Carburant (unités) embarqué au largage : la dotation de base moins la pente en
 * difficulté, sans jamais descendre sous `CARBURANT_MIN`.
 */
export function carburantInitial(difficulte: number): number {
  return Math.max(
    CARBURANT_MIN,
    CARBURANT_BASE - CARBURANT_PENTE * difficulte,
  );
}
