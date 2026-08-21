/**
 * Contact du LEM avec le sol, et verdict « posé ou détruit ».
 *
 * ## Ce que ce module est
 *
 * Trois **prédicats purs et sans mémoire** — `toucheLeSol`, `horsLimites`,
 * `evalueContact` — qui répondent sur l'état qu'on leur donne. Rien ici ne sait
 * si le contact a déjà été signalé, ni ne cherche à le savoir : les deux
 * conditions de fin de manche restent vraies indéfiniment (un LEM enfoncé dans
 * le sol y reste, un LEM sorti du monde continue de s'en éloigner), et c'est la
 * **règle de tick** de la manche, avec le drapeau qu'elle porte dans les
 * globals, qui n'émet l'événement qu'une fois. Un drapeau en variable de module
 * survivrait à la manche : après le premier contact de la session, plus aucune
 * manche ne se terminerait.
 *
 * ## Convention de repère — à lire avant d'écrire une comparaison
 *
 * `y` croît **vers le bas**, comme dans le `Heightfield` du moteur. Un point est
 * donc **sous le sol** quand son `y` est supérieur ou égal à celui de la
 * surface, une vitesse verticale **positive** est une descente, et le plafond du
 * monde est le `y` le plus **petit**.
 *
 * ## Géométrie de la coque
 *
 * Le contact ne se juge pas sous les pieds seulement. Le train est plus large
 * que le fuselage, et le fuselage monte au-dessus du centre : un LEM qui file
 * dans une paroi de canyon ou contre le flanc d'une aiguille a les pieds en
 * l'air, de part et d'autre de l'obstacle, et la coque dans la roche. Sans les
 * épaules, il traverse la falaise sans rien heurter.
 *
 * Tous les points de la coque sont **tournés de l'assiette** : c'est cette
 * rotation qui fait qu'un LEM penché touche par un seul pied, et qu'il touche
 * plus tôt qu'un LEM debout à la même altitude.
 */

import { souLeSol, Vector2 } from "@lem/engine";
import type { Lander } from "./entities/Lander.ts";
import {
  COQUE_LARGEUR_EPAULES,
  LEM,
  MONDE,
  PLAFOND_Y,
  SEUIL_ASSIETTE,
  SEUIL_VX,
  SEUIL_VY,
} from "./constants.ts";
import { estPosable, type Terrain } from "./terrain.ts";

/**
 * Point de la coque, donné par son décalage dans le repère **propre** du LEM
 * (`dx` vers la droite, `dy` vers le bas), ramené dans le repère du monde par la
 * rotation d'assiette puis la translation au centre.
 */
function pointDeCoque(lem: Lander, dx: number, dy: number): Vector2 {
  return lem.position.add(new Vector2(dx, dy).rotate(lem.assiette));
}

/**
 * Les deux pieds du train d'atterrissage : à une demi-largeur de train de part
 * et d'autre du centre, une demi-hauteur en dessous, le tout tourné de
 * l'assiette. Gauche d'abord, droite ensuite, dans le repère propre du LEM.
 */
export function piedsDuLem(lem: Lander): readonly [Vector2, Vector2] {
  const demiTrain = LEM.largeurTrain / 2;
  const bas = LEM.hauteur / 2;
  return [pointDeCoque(lem, -demiTrain, bas), pointDeCoque(lem, demiTrain, bas)];
}

/**
 * Les points hauts de la coque : les deux **épaules** et le **centre**.
 *
 * Les épaules sont plus rapprochées que les pieds (`COQUE_LARGEUR_EPAULES` de la
 * demi-largeur du train) et une demi-hauteur **au-dessus** du centre. Toucher
 * par l'un de ces trois points n'est jamais un atterrissage : on ne se pose pas
 * sur le côté ni sur le toit.
 */
function hautDeCoque(lem: Lander): readonly Vector2[] {
  const demiEpaules = (LEM.largeurTrain / 2) * COQUE_LARGEUR_EPAULES;
  const haut = -LEM.hauteur / 2;
  return [
    pointDeCoque(lem, -demiEpaules, haut),
    pointDeCoque(lem, demiEpaules, haut),
    lem.position,
  ];
}

/**
 * Tous les points de collision du LEM : les deux pieds, puis les deux épaules et
 * le centre. Cinq points, dans cet ordre.
 */
export function pointsDeCoque(lem: Lander): readonly Vector2[] {
  return [...piedsDuLem(lem), ...hautDeCoque(lem)];
}

/**
 * Vrai dès qu'**un** point de la coque est au niveau du sol ou dessous. Un point
 * exactement sur la surface compte comme touché, comme `souLeSol` du moteur.
 */
export function toucheLeSol(terrain: Terrain, lem: Lander): boolean {
  return pointsDeCoque(lem).some((point) => souLeSol(terrain.hf, point));
}

/** Vrai si la coque est entrée dans le sol ailleurs que par les pieds. */
function coqueHeurtee(terrain: Terrain, lem: Lander): boolean {
  return hautDeCoque(lem).some((point) => souLeSol(terrain.hf, point));
}

/** Ce qui a détruit le LEM. Un contact raté peut en cumuler plusieurs. */
export type CauseCrash =
  | "trop-vite-vertical"
  | "trop-vite-lateral"
  | "trop-penche"
  | "sol-accidente"
  | "coque-heurtee"
  | "hors-limites";

/**
 * Verdict d'un contact. Un posé porte son `ecart` — les points de la manche ; un
 * crash porte **toutes** ses causes, parce qu'un verdict qui n'en rendrait
 * qu'une masquerait au joueur ce qu'il a raté.
 */
export type Verdict =
  | { readonly pose: true; readonly ecart: number }
  | { readonly pose: false; readonly causes: readonly CauseCrash[] };

/**
 * Vrai si le LEM a quitté le monde : sorti latéralement, ou passé au-dessus du
 * plafond (`y` plus petit que `PLAFOND_Y`, `y` croissant vers le bas).
 *
 * La sortie se juge sur le **centre** du LEM, pas sur sa coque : c'est la
 * position que le HUD affiche et que la caméra suit, et une sortie mesurée à la
 * demi-largeur de train près ne changerait rien au jeu.
 *
 * Déclarée avant `evalueContact`, qui l'appelle.
 */
export function horsLimites(lem: Lander): boolean {
  return (
    lem.position.x < 0 ||
    lem.position.x > MONDE.largeur ||
    lem.position.y < PLAFOND_Y
  );
}

/**
 * Verdict du contact : les quatre conditions du §4.1 du cahier des charges, plus
 * la coque et la sortie du monde.
 *
 * **La sortie du monde est jugée d'abord, et elle interdit le posé.** Hors des
 * bornes du champ, `surfaceEn` prolonge la valeur du bord et `penteEn` rend 0 :
 * le dénivelé y vaut 0 et la platitude est parfaite partout. Sans cette garde,
 * un LEM dérivant hors du monde à basse vitesse serait déclaré **posé** sur un
 * sol qui n'existe pas, et le score de golf crédité d'un écart mesuré dans le
 * vide.
 *
 * Les deux critères qui interrogent le relief — platitude et coque — ne sont
 * donc pas évalués hors du monde : ils y mesureraient cette même fiction. Les
 * critères de vol, eux, restent mesurables partout et s'accumulent normalement.
 *
 * L'`ecart` d'un posé est l'écart **horizontal** entre le centre du LEM et le
 * mât du drapeau, arrondi au mètre :
 *
 * - le **centre**, et non le pied qui touche, sinon l'assiette décalerait le
 *   score d'un demi-train ;
 * - **horizontal**, et non une distance euclidienne : au contact sur du plat le
 *   centre est à `LEM.hauteur / 2` = 3,5 m au-dessus de la surface, alors que
 *   `cible.y` **est** la surface. Une distance euclidienne vaudrait toujours au
 *   moins 3,5 m, `Math.round` en ferait 4, et le « score parfait de 0 point »
 *   du cahier des charges (§5 et §7) serait inatteignable : chaque manche
 *   réussie porterait un malus plancher de 4 points. C'est aussi le sens de
 *   « distance au drapeau » pour un score de golf — on mesure l'écart au trou
 *   sur le terrain, pas l'altitude de la balle.
 *
 * `Math.abs` avant `Math.round` : l'écart est une valeur absolue, jamais
 * négative et jamais `-0`, et le score de la partie en est la somme.
 */
export function evalueContact(terrain: Terrain, lem: Lander): Verdict {
  const causes: CauseCrash[] = [];
  const dehors = horsLimites(lem);
  if (dehors) causes.push("hors-limites");

  // Critères de vol : ils ne dépendent pas du relief.
  // `SEUIL_VY` ne s'applique qu'à la **descente** : un LEM qui remonte en
  // frôlant le sol ne peut pas se détruire par excès de vitesse verticale.
  if (lem.velocity.y > SEUIL_VY) causes.push("trop-vite-vertical");
  if (Math.abs(lem.velocity.x) > SEUIL_VX) causes.push("trop-vite-lateral");
  if (Math.abs(lem.assiette) > SEUIL_ASSIETTE) causes.push("trop-penche");

  // Critères de sol : ils n'ont de sens que dans le monde (voir plus haut). La
  // platitude est mesurée par `estPosable`, donc sur `LEM.largeurTrain` centrée
  // sur l'abscisse du **centre**. Près d'un bord du monde l'intervalle est
  // tronqué et le comportement de bord plat de `surfaceEn` s'applique.
  if (!dehors) {
    if (!estPosable(terrain, lem.position.x)) causes.push("sol-accidente");
    if (coqueHeurtee(terrain, lem)) causes.push("coque-heurtee");
  }

  if (causes.length > 0) return { pose: false, causes };
  return {
    pose: true,
    ecart: Math.round(Math.abs(lem.position.x - terrain.cible.x)),
  };
}
