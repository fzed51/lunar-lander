/**
 * Tableau de bord de la manche : les valeurs qui permettent de décider, et la
 * couleur qui signale ce qui sort des seuils d'atterrissage.
 *
 * ## Formatage d'un côté, dessin de l'autre
 *
 * Tout ce qui transforme un nombre en texte est une **fonction pure** —
 * `formateAltitude`, `formateVitesse`, `formateTemps`, `formateCarburant` — et se
 * teste sans canvas. Le dessin, lui, ne fait que poser ces textes déjà composés :
 * il ne calcule aucune règle et ne touche pas à l'état.
 *
 * ## Largeur fixe, colonnes immobiles
 *
 * Les nombres sont écrits à largeur constante, zéros de tête compris, et les blocs
 * de droite sont alignés à droite. Un tableau de bord dont les colonnes sautent
 * d'un pixel dès qu'une valeur change de dizaine est illisible en vol, et c'est
 * précisément en vol qu'on le lit.
 *
 * ## Aucun code de couleur écrit ici
 *
 * `couleurSeuil` rend une **clé** de la palette, jamais un code hexadécimal :
 * c'est le dessin qui la convertit par `PALETTE[cle]`. La palette reste l'unique
 * source de vérité visuelle, et une couleur littérale n'a aucun endroit où se
 * cacher.
 *
 * ## Les valeurs affichées sont celles qui décident
 *
 * L'altitude est la hauteur au-dessus du sol **sous le LEM**, pas une hauteur de
 * monde : c'est cette valeur-là qui décide du contact. La distance à la cible est
 * l'écart **horizontal** au drapeau, exactement celui que `evalueContact` compte
 * en points. Un tableau de bord qui affiche 12 m quand le verdict compte 13 points
 * ferait passer la règle du score pour un bug.
 */

import { byKind, surfaceEn, Vector2, type Renderer } from "@lem/engine";
import { CRANS_MAX, SEUIL_VX, SEUIL_VY } from "../constants.ts";
import { dessineTexte, HAUTEUR_GLYPHE, mesureTexte } from "../design/font.ts";
import { PALETTE, type CouleurLem } from "../design/palette.ts";
import { difficulteDe } from "../difficulty.ts";
import type { Lander } from "../entities/Lander.ts";
import type { CauseCrash, Verdict } from "../landing.ts";
import type { EtatPartie, Globals } from "../state.ts";
import type { Terrain } from "../terrain.ts";

// --- Réglages de mise en page ---
//
// Ce sont des dimensions de dessin, en pixels d'écran : elles ne pilotent aucune
// règle de jeu et ne sont donc pas dans `constants.ts`. Le tableau de bord n'est
// jamais mis à l'échelle du zoom : il vit dans le plan de l'écran, pas dans le
// monde.

/** Marge (px) entre le tableau de bord et les bords de l'écran. */
export const MARGE_HUD = 4;

/** Pas vertical (px) entre deux lignes de texte d'un même bloc. */
const LIGNE = HAUTEUR_GLYPHE + 2;

/** Espace (px) entre une jauge et le texte qui la commente. */
const ESPACE_LEGENDE = 3;

/** Cadre de la jauge de carburant (px), posé en bas à gauche. */
export const JAUGE_CARBURANT = { largeur: 62, hauteur: 7 } as const;

/**
 * Nombre de lignes du bloc haut droit (`CIBLE`/`TPS`/`MANCHE`/`DIFF`, dessiné
 * par `dessineBlocManche`) : le plus long des deux blocs du haut de l'écran, à
 * garder synchronisé avec le nombre de lignes qu'il passe à `dessineLignes`.
 */
const LIGNES_BLOC_SUP_MAX = 4;

/**
 * Bas (px) du plus long des deux blocs de texte du haut de l'écran. Exportée
 * pour que `dessineIndicateurCible` (render/draw.ts) sache jusqu'où ne pas
 * remonter : la flèche ne doit jamais se peindre sous ce texte, sans quoi elle
 * y devient illisible ou invisible selon l'ordre de dessin.
 */
export const BAS_BLOC_SUPERIEUR =
  MARGE_HUD + (LIGNES_BLOC_SUP_MAX - 1) * LIGNE + HAUTEUR_GLYPHE;

/**
 * Hauteur (px), comptée depuis le bas de l'écran, de la bande occupée par les
 * jauges de carburant et de puissance — les deux ont la même hauteur totale.
 * Exportée pour que `dessineIndicateurCible` sache jusqu'où ne pas descendre.
 */
export const BANDE_JAUGES = MARGE_HUD + JAUGE_CARBURANT.hauteur;

/**
 * Jauge de puissance : `CRANS_MAX` barres verticales de hauteur croissante,
 * posées en bas à droite. La hauteur de la barre `i` vaut
 * `hauteurBase + i` pixels.
 */
export const JAUGE_PUISSANCE = {
  largeurBarre: 3,
  ecart: 1,
  hauteurBase: 3,
} as const;

/** Silhouette de vie : 5 × 4 pixels, `#` allumé, dessinée en bas au centre. */
const SILHOUETTE_VIE: readonly string[] = [
  " ### ",
  "#####",
  " # # ",
  "#   #",
];

/** Écart (px) entre deux silhouettes de vie. */
const ECART_VIE = 2;

/**
 * Au-delà de ce nombre de vies, on écrit `X n` au lieu d'aligner les
 * silhouettes. Trois vies suffisent aujourd'hui ; l'affichage ne doit pas
 * déborder si la règle change.
 */
const VIES_SILHOUETTES_MAX = 5;

/** Ordonnées (px) des deux lignes du bandeau de fin de manche. */
const BANDEAU = { verdict: 70, causes: 92 } as const;

/** Largeur (chiffres) des valeurs en mètres, zéros de tête compris. */
const CHIFFRES_METRES = 4;

/** Plus grande valeur en mètres affichable à largeur fixe. */
const METRES_MAX = 9999;

/** Plus grande vitesse (m/s) affichable à largeur fixe. */
const VITESSE_MAX = 99.9;

/**
 * Facteur du seuil au-delà duquel une valeur passe de l'avertissement à
 * l'alerte. Trois paliers plutôt que deux, pour que le joueur voie venir la
 * sortie des clous au lieu de la découvrir au contact.
 */
const FACTEUR_ALERTE = 1.5;

/** Fraction du réservoir sous laquelle la jauge de carburant passe en alerte. */
const SEUIL_CARBURANT_BAS = 0.2;

/** Séparateur entre deux causes de crash, et marque de troncature. */
const SEPARATEUR_CAUSES = " / ";
const MARQUE_TRONCATURE = " ...";

/** Ce qu'une cause de crash dit au joueur, en clair. */
const LIBELLE_CAUSE: Readonly<Record<CauseCrash, string>> = {
  "trop-vite-vertical": "TROP VITE",
  "trop-vite-lateral": "DERIVE LATERALE",
  "trop-penche": "TROP PENCHE",
  "sol-accidente": "SOL ACCIDENTE",
  "coque-heurtee": "COQUE HEURTEE",
  "hors-limites": "HORS LIMITES",
};

/** Une ligne de texte du tableau de bord, avec sa clé de palette. */
interface LigneHud {
  readonly texte: string;
  readonly couleur: CouleurLem;
}

/** Ramène `v` dans `[min, max]`. */
function pince(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

// --- Formatage ---

/**
 * Une valeur en mètres, à largeur fixe : `CHIFFRES_METRES` chiffres avec zéros de
 * tête, puis le suffixe. Jamais de valeur négative — un signe volerait une
 * colonne et ferait bouger tout le reste de la ligne.
 */
function formateMetres(m: number): string {
  const entier = Math.round(pince(m, 0, METRES_MAX));
  return `${String(entier).padStart(CHIFFRES_METRES, "0")} M`;
}

/**
 * Altitude au-dessus du sol, en mètres. **Écrêtée à 0** : un LEM enfoncé dans la
 * roche après un crash n'a pas d'altitude négative à montrer.
 */
export function formateAltitude(m: number): string {
  return formateMetres(m);
}

/**
 * Une vitesse (m/s) : signe explicite, deux chiffres entiers, une décimale. Cinq
 * caractères, toujours.
 *
 * Le signe est calculé sur la valeur **arrondie**, pas sur la valeur brute : sans
 * cela, une vitesse de -0,04 m/s s'afficherait `-00.0`, un moins qui ne veut rien
 * dire.
 */
export function formateVitesse(v: number): string {
  const arrondi = Math.round(pince(v, -VITESSE_MAX, VITESSE_MAX) * 10) / 10;
  const signe = arrondi < 0 ? "-" : "+";
  return `${signe}${Math.abs(arrondi).toFixed(1).padStart(4, "0")}`;
}

/**
 * Un temps de vol, en `M:SS`. Les minutes ne sont **pas** ramenées dans 0–59 :
 * une partie de plus d'une heure affiche `60:00`, pas `0:00`.
 */
export function formateTemps(s: number): string {
  const total = Math.floor(Math.max(0, s));
  const minutes = Math.floor(total / 60);
  const secondes = total % 60;
  return `${minutes}:${String(secondes).padStart(2, "0")}`;
}

/**
 * Le carburant restant en pourcentage entier de la dotation de la manche.
 *
 * `max` est la dotation **réellement embarquée** — `globals.carburantInitial` —
 * et jamais `CARBURANT_BASE` : la dotation dépend de la difficulté de la manche,
 * donc un réservoir plein en difficile s'afficherait à 69 % et l'alerte de bas
 * niveau se déclencherait sur un réservoir qui n'est pas celui du LEM.
 */
export function formateCarburant(u: number, max: number): string {
  const part = max > 0 ? pince(u / max, 0, 1) : 0;
  return `${Math.round(part * 100)} %`;
}

/** La difficulté de la manche, à deux décimales. */
export function formateDifficulte(d: number): string {
  return Math.max(0, d).toFixed(2);
}

/**
 * Clé de palette d'une valeur jugée sur un seuil : dans les clous, en
 * avertissement, ou en alerte.
 *
 * La valeur est comparée **signée**. C'est ce qui fait qu'une vitesse verticale
 * montante — négative, `y` croissant vers le bas — ne s'allume jamais en alerte,
 * cohérent avec `evalueContact` qui ne sanctionne que la descente. Une grandeur
 * dont seule la norme compte, comme la vitesse horizontale, est passée en valeur
 * absolue par l'appelant.
 */
export function couleurSeuil(valeur: number, seuil: number): CouleurLem {
  if (valeur <= seuil) return "accent";
  if (valeur <= seuil * FACTEUR_ALERTE) return "flammeChaude";
  return "alerte";
}

/**
 * Écart **horizontal** au drapeau, arrondi au mètre : exactement la valeur dont
 * `evalueContact` fait les points de la manche. Pas de distance euclidienne — le
 * centre du LEM posé est à `LEM.hauteur / 2` au-dessus de la surface, et un écart
 * mesuré en oblique ne tomberait jamais à zéro.
 */
export function distanceCible(lem: Lander, terrain: Terrain): number {
  return Math.round(Math.abs(lem.position.x - terrain.cible.x));
}

/**
 * Les causes d'un crash, en clair, sur une ligne d'au plus `largeurMax` pixels.
 *
 * Toutes les causes sont dites quand elles tiennent. Sinon on en retire par la
 * fin, entières, et on marque la troncature : couper un libellé au milieu d'un mot
 * dirait moins que de le taire.
 */
export function texteCauses(
  causes: readonly CauseCrash[],
  largeurMax: number,
): string {
  const libelles = causes.map((cause) => LIBELLE_CAUSE[cause]);
  if (libelles.length === 0) return "";
  const complet = libelles.join(SEPARATEUR_CAUSES);
  if (mesureTexte(complet) <= largeurMax) return complet;
  for (let garde = libelles.length - 1; garde >= 1; garde--) {
    const tronque =
      libelles.slice(0, garde).join(SEPARATEUR_CAUSES) + MARQUE_TRONCATURE;
    if (mesureTexte(tronque) <= largeurMax) return tronque;
  }
  return MARQUE_TRONCATURE.trim();
}

/** Le verdict de la manche, en une ligne. */
function texteVerdict(verdict: Verdict): string {
  return verdict.pose
    ? `POSE - ECART ${formateMetres(verdict.ecart)}`
    : "CRASH";
}

// --- Dessin ---

/** Pose une pile de lignes de texte, alignée à gauche ou à droite. */
function dessineLignes(
  r: Renderer,
  lignes: readonly LigneHud[],
  x: number,
  align: "left" | "right",
): void {
  for (let i = 0; i < lignes.length; i++) {
    const ligne = lignes[i];
    if (!ligne) continue;
    dessineTexte(
      r,
      ligne.texte,
      new Vector2(x, MARGE_HUD + i * LIGNE),
      PALETTE[ligne.couleur],
      { align },
    );
  }
}

/**
 * Bloc haut gauche : altitude au-dessus du sol sous le LEM, vitesse verticale,
 * vitesse horizontale. Les deux vitesses portent leur couleur de seuil ;
 * l'altitude n'a pas de seuil d'atterrissage à signaler.
 */
function dessineBlocVol(r: Renderer, lem: Lander, terrain: Terrain): void {
  const altitude = surfaceEn(terrain.hf, lem.position.x) - lem.position.y;
  dessineLignes(
    r,
    [
      { texte: `ALT ${formateAltitude(altitude)}`, couleur: "blanc" },
      {
        texte: `VY ${formateVitesse(lem.velocity.y)}`,
        couleur: couleurSeuil(lem.velocity.y, SEUIL_VY),
      },
      {
        texte: `VX ${formateVitesse(lem.velocity.x)}`,
        couleur: couleurSeuil(Math.abs(lem.velocity.x), SEUIL_VX),
      },
    ],
    MARGE_HUD,
    "left",
  );
}

/**
 * Bloc haut droit : distance à la cible, temps de vol, numéro de manche,
 * difficulté. Aligné à droite, donc les chiffres restent en colonne quel que soit
 * leur ordre de grandeur.
 */
function dessineBlocManche(r: Renderer, lem: Lander, g: Globals): void {
  const difficulte = difficulteDe(g.niveauDepart, g.manchesReussies);
  dessineLignes(
    r,
    [
      {
        texte: `CIBLE ${formateMetres(distanceCible(lem, g.terrain))}`,
        couleur: "accent",
      },
      { texte: `TPS ${formateTemps(g.tempsDeVol)}`, couleur: "grisPale" },
      {
        texte: `MANCHE ${String(g.numeroManche).padStart(2, "0")}`,
        couleur: "grisPale",
      },
      { texte: `DIFF ${formateDifficulte(difficulte)}`, couleur: "grisPale" },
    ],
    r.width - MARGE_HUD,
    "right",
  );
}

/**
 * Jauge de carburant et son pourcentage, en bas à gauche. Le dénominateur est la
 * dotation de la manche, jamais une constante.
 *
 * Réservoir vide : aucun rectangle de remplissage n'est posé du tout. Une barre
 * résiduelle d'un pixel laisserait croire qu'il reste une goutte.
 */
function dessineJaugeCarburant(
  r: Renderer,
  lem: Lander,
  dotation: number,
): void {
  const x = MARGE_HUD;
  const y = r.height - MARGE_HUD - JAUGE_CARBURANT.hauteur;
  const part = dotation > 0 ? pince(lem.carburant / dotation, 0, 1) : 0;
  const couleur: CouleurLem =
    part < SEUIL_CARBURANT_BAS ? "alerte" : "flammeClaire";

  r.strokeRect(
    new Vector2(x, y),
    JAUGE_CARBURANT.largeur,
    JAUGE_CARBURANT.hauteur,
    { fill: PALETTE.ombre, stroke: PALETTE.grisPale },
  );

  const interieur = JAUGE_CARBURANT.largeur - 2;
  const remplie = Math.round(part * interieur);
  if (remplie > 0) {
    r.fillRect(
      new Vector2(x + 1, y + 1),
      remplie,
      JAUGE_CARBURANT.hauteur - 2,
      PALETTE[couleur],
    );
  }

  dessineTexte(
    r,
    formateCarburant(lem.carburant, dotation),
    new Vector2(x + JAUGE_CARBURANT.largeur + ESPACE_LEGENDE, y),
    PALETTE[couleur],
  );
}

/**
 * Jauge de puissance, en bas à droite : `CRANS_MAX` barres de hauteur croissante,
 * allumées jusqu'au cran choisi. Les barres éteintes restent dessinées, sinon la
 * jauge n'aurait plus d'échelle à lire.
 */
function dessineJaugePuissance(r: Renderer, lem: Lander): void {
  const pas = JAUGE_PUISSANCE.largeurBarre + JAUGE_PUISSANCE.ecart;
  const largeur = CRANS_MAX * pas - JAUGE_PUISSANCE.ecart;
  const x0 = r.width - MARGE_HUD - largeur;
  const bas = r.height - MARGE_HUD;

  for (let i = 0; i < CRANS_MAX; i++) {
    const hauteur = JAUGE_PUISSANCE.hauteurBase + i;
    const couleur: CouleurLem = i < lem.cran ? "flammeClaire" : "reliefMoyen";
    r.fillRect(
      new Vector2(x0 + i * pas, bas - hauteur),
      JAUGE_PUISSANCE.largeurBarre,
      hauteur,
      PALETTE[couleur],
    );
  }

  dessineTexte(
    r,
    "MOT",
    new Vector2(x0 - ESPACE_LEGENDE, bas - HAUTEUR_GLYPHE),
    PALETTE.grisPale,
    { align: "right" },
  );
}

/** Une silhouette de vie, coin haut-gauche en `(x, y)`. */
function dessineSilhouette(r: Renderer, x: number, y: number): void {
  for (let ligne = 0; ligne < SILHOUETTE_VIE.length; ligne++) {
    const motif = SILHOUETTE_VIE[ligne];
    if (motif === undefined) continue;
    for (let col = 0; col < motif.length; col++) {
      if (motif[col] !== "#") continue;
      r.fillRect(new Vector2(x + col, y + ligne), 1, 1, PALETTE.grisPale);
    }
  }
}

/** Largeur (px) d'une silhouette de vie. */
const LARGEUR_VIE = SILHOUETTE_VIE[0]?.length ?? 0;

/**
 * Vies restantes, en bas au centre : autant de petites silhouettes de LEM.
 * Au-delà de `VIES_SILHOUETTES_MAX`, une silhouette et un compte — un rang de
 * silhouettes qui s'allonge finirait par recouvrir les deux jauges.
 */
function dessineVies(r: Renderer, vies: number): void {
  if (vies <= 0) return;
  const centre = Math.round(r.width / 2);
  const y = r.height - MARGE_HUD - SILHOUETTE_VIE.length;

  if (vies > VIES_SILHOUETTES_MAX) {
    const texte = `X ${vies}`;
    const largeur = LARGEUR_VIE + ECART_VIE + mesureTexte(texte);
    const x0 = centre - Math.round(largeur / 2);
    dessineSilhouette(r, x0, y);
    dessineTexte(
      r,
      texte,
      new Vector2(
        x0 + LARGEUR_VIE + ECART_VIE,
        r.height - MARGE_HUD - HAUTEUR_GLYPHE,
      ),
      PALETTE.grisPale,
    );
    return;
  }

  const pas = LARGEUR_VIE + ECART_VIE;
  const largeur = vies * pas - ECART_VIE;
  const x0 = centre - Math.round(largeur / 2);
  for (let i = 0; i < vies; i++) dessineSilhouette(r, x0 + i * pas, y);
}

/**
 * Bandeau central de fin de manche : le verdict, et les causes s'il y a crash.
 *
 * Rien tant que la manche n'est pas jugée, et rien en pause — le voile de pause a
 * son propre message. Un abandon depuis la pause finit la partie **sans** verdict :
 * il n'y a alors rien à annoncer.
 *
 * Le posé est en `accent`, le crash en `alerte` : la couleur d'alerte sur un
 * atterrissage réussi se lirait comme un échec.
 */
function dessineBandeau(r: Renderer, g: Globals): void {
  const verdict = g.dernierVerdict;
  if (verdict === null) return;
  if (g.statut === "vol" || g.statut === "pause") return;

  const centre = Math.round(r.width / 2);
  dessineTexte(
    r,
    texteVerdict(verdict),
    new Vector2(centre, BANDEAU.verdict),
    verdict.pose ? PALETTE.accent : PALETTE.alerte,
    { align: "center", echelle: 2 },
  );
  if (verdict.pose) return;

  dessineTexte(
    r,
    texteCauses(verdict.causes, r.width - 2 * MARGE_HUD),
    new Vector2(centre, BANDEAU.causes),
    PALETTE.alerte,
    { align: "center" },
  );
}

/**
 * Le tableau de bord complet. Se dessine **par-dessus** la manche et **sous** le
 * voile de pause : la pause suspend la partie, elle ne masque pas ses chiffres.
 */
export function dessineHud(r: Renderer, etat: EtatPartie): void {
  const g = etat.globals;
  const lem = byKind(etat, "lander")[0];
  if (lem) {
    dessineBlocVol(r, lem, g.terrain);
    dessineBlocManche(r, lem, g);
    dessineJaugeCarburant(r, lem, g.carburantInitial);
    dessineJaugePuissance(r, lem);
  }
  dessineVies(r, g.vies);
  dessineBandeau(r, g);
}
