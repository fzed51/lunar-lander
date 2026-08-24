/**
 * Invariants de réglage : ce que les constantes doivent vérifier **entre elles**
 * pour que le jeu reste jouable.
 *
 * Les autres suites vérifient qu'une fonction fait ce qu'elle annonce ; celle-ci
 * vérifie que les nombres du jeu forment un ensemble cohérent. Un réglage futur
 * qui casse l'un de ces invariants rend le jeu injouable sans casser aucune
 * autre suite : c'est exactement ce qu'on veut voir rougir tout de suite.
 *
 * ## Les coûts s'écrivent avec les constantes, jamais avec leur simplification
 *
 * Annuler une dérive `v` au cran maximal sous l'assiette `θ` coûte
 * `v * (CONSO_PAR_CRAN * CRANS_MAX) / (POUSSEE_MAX * sin θ)` unités. Comme
 * `CONSO_PAR_CRAN * CRANS_MAX` vaut aujourd'hui exactement `POUSSEE_MAX`, cette
 * formule **se lit** `v / sin θ` — une coïncidence des valeurs du jour, pas une
 * identité. Un invariant écrit sous la forme simplifiée resterait vert après un
 * changement de `POUSSEE_MAX` ou de `CONSO_PAR_CRAN` alors même que le plafond de
 * difficulté serait devenu injouable. On écrit donc les formules complètes.
 *
 * ## La fenêtre aveugle du largage n'est pas un invariant
 *
 * Au largage, le sol est sous le bord bas de la vue et le reste quelques
 * secondes : c'est un **arbitrage** tranché en T17 — garder `BIAIS_CAMERA_Y` à 60
 * et compter sur l'indicateur de cible —, pas une propriété à tenir. Il est
 * chiffré au §6 du cahier des charges, avec les mesures qui le justifient, et il
 * n'a rien à faire ici : un test qui fige une durée d'attente confortable
 * interdirait de la réduire un jour.
 */

import { describe, expect, it } from "vitest";
import {
  CONSO_PAR_CRAN,
  CRANS_MAX,
  DEPART_Y,
  DIFFICULTE_MAX,
  LEM,
  MOON_GRAVITY,
  PIXEL,
  POUSSEE_MAX,
  RUGOSITE_ACCIDENTEE,
  RUGOSITE_DOUCE,
  SEUILS_ZOOM,
  TERRAIN_PAS,
  TERRAIN_Y_MAX,
} from "./constants.ts";
import { carburantInitial, vitesseHorizontaleInitiale } from "./difficulty.ts";
import { genereTerrain } from "./terrain.ts";

/** Carburant brûlé par seconde au cran maximal (u/s). */
const DEBIT_MAX = CONSO_PAR_CRAN * CRANS_MAX;

/** Assiette de référence des calculs de dérive : 45°, le meilleur compromis. */
const ASSIETTE_REFERENCE = Math.PI / 4;

/** Marge exigée du réservoir sur le besoin du pire cas. */
const MARGE_MINIMALE = 0.15;

/**
 * Coût (u) de l'annulation d'une dérive `v` (m/s) au cran maximal, sous
 * l'assiette `theta`. Seule la composante horizontale de la poussée travaille,
 * d'où le `sin`.
 */
function coutDerive(v: number, theta: number): number {
  return (v * DEBIT_MAX) / (POUSSEE_MAX * Math.sin(theta));
}

/**
 * Coût (u) de l'annulation d'une vitesse de chute `v` (m/s) au cran maximal. La
 * gravité tire pendant tout le freinage : c'est l'accélération **nette** qui
 * décide de la durée, donc de la dépense.
 */
function coutFreinage(v: number): number {
  return (v * DEBIT_MAX) / (POUSSEE_MAX - MOON_GRAVITY);
}

/** Vitesse (m/s) atteinte en tombant `hauteur` mètres, moteur coupé. */
function vitesseDeChute(hauteur: number): number {
  return Math.sqrt(2 * MOON_GRAVITY * hauteur);
}

/** Demi-hauteur de vue (m) au zoom donné : la caméra est centrée sur le LEM. */
function demiVue(zoom: number): number {
  return PIXEL.height / (2 * zoom);
}

describe("réglages — le vol est possible", () => {
  it("laisse le stationnaire à portée : la poussée maximale dépasse la gravité", () => {
    // Sans cet écart, aucun cran ne compense la chute et le LEM ne fait que
    // tomber moins vite. Le stationnaire demande
    // MOON_GRAVITY / POUSSEE_MAX * CRANS_MAX ≈ 2,03 crans, soit ≈ 1,62 u/s.
    expect(POUSSEE_MAX).toBeGreaterThan(MOON_GRAVITY);
    expect((MOON_GRAVITY / POUSSEE_MAX) * CRANS_MAX).toBeLessThan(CRANS_MAX);
  });

  it("laisse du carburant au plafond de difficulté", () => {
    expect(carburantInitial(DIFFICULTE_MAX)).toBeGreaterThan(0);
  });
});

describe("réglages — le plafond de difficulté reste gagnable au pire cas", () => {
  it("couvre le freinage et la dérive avec au moins 15 % de marge", () => {
    // Le pire cas de terrain, et non le meilleur : la plateforme peut être tirée
    // jusqu'à TERRAIN_Y_MAX, donc la chute vaut TERRAIN_Y_MAX - DEPART_Y et non
    // TERRAIN_Y_MIN - DEPART_Y. Certifier le plafond sur la chute minimale
    // reviendrait à le certifier sur le seul terrain favorable.
    const chuteMax = TERRAIN_Y_MAX - DEPART_Y;
    const freinage = coutFreinage(vitesseDeChute(chuteMax));
    const derive = coutDerive(
      Math.abs(vitesseHorizontaleInitiale(DIFFICULTE_MAX, 1)),
      ASSIETTE_REFERENCE,
    );
    const besoin = freinage + derive;
    const reservoir = carburantInitial(DIFFICULTE_MAX);

    expect(
      reservoir,
      `réservoir ${reservoir.toFixed(1)} u contre ${besoin.toFixed(1)} u de ` +
        `besoin (freinage ${freinage.toFixed(1)} u + dérive ${derive.toFixed(1)} u)`,
    ).toBeGreaterThanOrEqual(besoin * (1 + MARGE_MINIMALE));
  });

  it("garde une plateforme cible plus large que le train, marge d'un pas comprise", () => {
    // `denivele` sous la largeur du train interpole vers les échantillons
    // voisins : comparer à `LEM.largeurTrain` seul ne couvrirait rien, il faut un
    // pas entier de marge de chaque côté.
    const minimum = LEM.largeurTrain + 2 * TERRAIN_PAS;
    for (let graine = 0; graine < 20; graine++) {
      const { cible } = genereTerrain(graine, DIFFICULTE_MAX);
      expect(cible.largeur, `graine ${graine}`).toBeGreaterThanOrEqual(minimum);
    }
  });
});

describe("réglages — les seuils de zoom tiennent dans la vue", () => {
  it("ordonne les quatre seuils, hystérésis comprise", () => {
    expect(SEUILS_ZOOM.vers4).toBeLessThan(SEUILS_ZOOM.retour2);
    expect(SEUILS_ZOOM.retour2).toBeLessThan(SEUILS_ZOOM.vers2);
    expect(SEUILS_ZOOM.vers2).toBeLessThan(SEUILS_ZOOM.retour1);
  });

  it("borne les seuils d'entrée ET de retour par la demi-vue du zoom serré", () => {
    // C'est le seuil de **retour** qui décide jusqu'à quelle altitude on reste au
    // zoom serré en remontant : sans cette moitié de l'invariant, le sol peut
    // sortir de l'écran sur toute la bande d'hystérésis alors que l'ordre des
    // quatre seuils reste parfaitement vert.
    expect(SEUILS_ZOOM.vers2).toBeLessThanOrEqual(demiVue(2));
    expect(SEUILS_ZOOM.retour1).toBeLessThanOrEqual(demiVue(2));
    expect(SEUILS_ZOOM.vers4).toBeLessThanOrEqual(demiVue(4));
    expect(SEUILS_ZOOM.retour2).toBeLessThanOrEqual(demiVue(4));
  });
});

describe("réglages — le terrain contraste", () => {
  it("creuse un écart net entre secteur doux et secteur accidenté", () => {
    // Le cahier des charges promet des « zones franchement accidentées où poser
    // est impossible » : deux rugosités voisines donneraient un relief uniforme
    // et le choix du point de posé n'aurait plus de sens.
    expect(RUGOSITE_ACCIDENTEE).toBeGreaterThanOrEqual(5 * RUGOSITE_DOUCE);
  });
});
