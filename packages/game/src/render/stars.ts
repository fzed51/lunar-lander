/**
 * Champ d'étoiles d'une manche.
 *
 * ## Tiré une fois, jamais pendant le rendu
 *
 * Les étoiles sont tirées **à la création de la manche**, depuis le générateur à
 * graine de cette manche, et le champ ne bouge plus ensuite. Un tirage refait à
 * chaque image ferait scintiller le ciel au hasard, et surtout consommerait des
 * tirages au rendu : la suite dépendrait alors du nombre d'images affichées, et
 * ni le relief ni les particules ne seraient plus reproductibles à graine égale.
 *
 * ## Étendue du champ, et pourquoi elle n'est pas celle du monde
 *
 * Les étoiles se dessinent en **parallaxe** : leur position écran ne suit que
 * `ETOILES_PARALLAXE` du déplacement de la caméra (voir `dessineEtoiles` dans
 * `draw.ts`). Une caméra qui balaie tout le monde ne promène donc son point de
 * référence que sur `ETOILES_PARALLAXE × MONDE`. Le champ est calé sur cette
 * étendue atteignable, plus une demi-vue de débord : au-delà, une étoile ne
 * serait **jamais** à l'écran, et les 90 étoiles se répartiraient sur un domaine
 * dont on ne verrait qu'un sixième — un ciel presque vide.
 *
 * L'étendue reste comprise dans les bornes du monde, elle n'invente pas d'espace
 * en dehors.
 */

import type { Rng } from "@lem/engine";
import {
  ETOILES_NOMBRE,
  ETOILES_PARALLAXE,
  MONDE,
  PIXEL,
  TERRAIN_Y_MIN,
} from "../constants.ts";
import type { CouleurLem } from "../design/palette.ts";

/** Une étoile : une position monde et une teinte de la palette. */
export interface Etoile {
  readonly x: number;
  readonly y: number;
  /** Nom d'une couleur de la palette — jamais une valeur littérale. */
  readonly teinte: CouleurLem;
}

/**
 * Les trois teintes d'étoile, du plus vif au plus discret. Le ciel gagne un peu
 * de profondeur sans qu'aucune étoile ne crie plus fort que le LEM.
 */
const TEINTES: readonly CouleurLem[] = ["blanc", "grisPale", "grisClair"];

/**
 * Étendue du champ d'étoiles (unités monde), déduite de la parallaxe : la part du
 * monde que le point de référence des étoiles parcourt, plus une demi-vue de
 * débord de chaque côté. `TERRAIN_Y_MIN` borne la verticale, puisqu'une étoile
 * plus basse tomberait de toute façon derrière le relief.
 */
export const ETOILES_ETENDUE = {
  largeur: MONDE.largeur * ETOILES_PARALLAXE + PIXEL.width / 2,
  hauteur: TERRAIN_Y_MIN * ETOILES_PARALLAXE + PIXEL.height / 2,
} as const;

/**
 * Tire le champ d'étoiles d'une manche. Pur et déterministe : deux générateurs
 * de même graine rendent exactement le même ciel.
 */
export function genereEtoiles(rng: Rng): readonly Etoile[] {
  const etoiles: Etoile[] = [];
  for (let i = 0; i < ETOILES_NOMBRE; i++) {
    etoiles.push({
      x: rng.range(0, ETOILES_ETENDUE.largeur),
      y: rng.range(0, ETOILES_ETENDUE.hauteur),
      teinte: rng.pick(TEINTES),
    });
  }
  return etoiles;
}
