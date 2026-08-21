import { Vector2 } from "@lem/engine";

/**
 * Police bitmap 5 × 7 du jeu.
 *
 * À 320 × 180, une police vectorielle rend un texte flou et hors grille : on
 * dessine donc les caractères soi-même, pixel par pixel, sans aucun asset
 * externe.
 */

/** Largeur d'un glyphe, en pixels. */
export const LARGEUR_GLYPHE = 5;

/** Hauteur d'un glyphe, en pixels. La ligne de base est la dernière. */
export const HAUTEUR_GLYPHE = 7;

/** Espacement horizontal par défaut entre deux glyphes, en pixels. */
export const ESPACEMENT_DEFAUT = 1;

/** Glyphe de remplacement pour tout caractère absent de la table. */
export const GLYPHE_INCONNU = "?";

/**
 * Table des glyphes : 7 chaînes de 5 caractères, `#` pour un pixel allumé,
 * espace sinon. Couvre `A`–`Z`, `0`–`9`, l'espace et la ponctuation utile au
 * HUD et aux écrans.
 */
export const GLYPHES: Readonly<Record<string, readonly string[]>> =
  Object.freeze({
    A: [" ### ", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"],
    B: ["#### ", "#   #", "#   #", "#### ", "#   #", "#   #", "#### "],
    C: [" ### ", "#   #", "#    ", "#    ", "#    ", "#   #", " ### "],
    D: ["#### ", "#   #", "#   #", "#   #", "#   #", "#   #", "#### "],
    E: ["#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#####"],
    F: ["#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#    "],
    G: [" ### ", "#   #", "#    ", "#  ##", "#   #", "#   #", " ### "],
    H: ["#   #", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"],
    I: ["#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "#####"],
    J: ["   ##", "    #", "    #", "    #", "    #", "#   #", " ### "],
    K: ["#   #", "#  # ", "# #  ", "##   ", "# #  ", "#  # ", "#   #"],
    L: ["#    ", "#    ", "#    ", "#    ", "#    ", "#    ", "#####"],
    M: ["#   #", "## ##", "# # #", "#   #", "#   #", "#   #", "#   #"],
    N: ["#   #", "##  #", "# # #", "#  ##", "#   #", "#   #", "#   #"],
    O: [" ### ", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "],
    P: ["#### ", "#   #", "#   #", "#### ", "#    ", "#    ", "#    "],
    Q: [" ### ", "#   #", "#   #", "#   #", "# # #", "#  # ", " ## #"],
    R: ["#### ", "#   #", "#   #", "#### ", "# #  ", "#  # ", "#   #"],
    S: [" ####", "#    ", "#    ", " ### ", "    #", "    #", "#### "],
    T: ["#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  "],
    U: ["#   #", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "],
    V: ["#   #", "#   #", "#   #", "#   #", "#   #", " # # ", "  #  "],
    W: ["#   #", "#   #", "#   #", "#   #", "# # #", "## ##", "#   #"],
    X: ["#   #", "#   #", " # # ", "  #  ", " # # ", "#   #", "#   #"],
    Y: ["#   #", "#   #", " # # ", "  #  ", "  #  ", "  #  ", "  #  "],
    Z: ["#####", "    #", "   # ", "  #  ", " #   ", "#    ", "#####"],

    "0": [" ### ", "#   #", "#  ##", "# # #", "##  #", "#   #", " ### "],
    "1": ["  #  ", " ##  ", "  #  ", "  #  ", "  #  ", "  #  ", " ### "],
    "2": [" ### ", "#   #", "    #", "   # ", "  #  ", " #   ", "#####"],
    "3": ["#####", "   # ", "  #  ", "   # ", "    #", "#   #", " ### "],
    "4": ["   # ", "  ## ", " # # ", "#  # ", "#####", "   # ", "   # "],
    "5": ["#####", "#    ", "#### ", "    #", "    #", "#   #", " ### "],
    "6": ["  ## ", " #   ", "#    ", "#### ", "#   #", "#   #", " ### "],
    "7": ["#####", "    #", "   # ", "  #  ", " #   ", " #   ", " #   "],
    "8": [" ### ", "#   #", "#   #", " ### ", "#   #", "#   #", " ### "],
    "9": [" ### ", "#   #", "#   #", " ####", "    #", "   # ", " ##  "],

    " ": ["     ", "     ", "     ", "     ", "     ", "     ", "     "],
    ".": ["     ", "     ", "     ", "     ", "     ", "     ", "  #  "],
    ",": ["     ", "     ", "     ", "     ", "     ", "  #  ", " #   "],
    ":": ["     ", "     ", "  #  ", "     ", "     ", "  #  ", "     "],
    ";": ["     ", "     ", "  #  ", "     ", "     ", "  #  ", " #   "],
    "-": ["     ", "     ", "     ", " ### ", "     ", "     ", "     "],
    "+": ["     ", "  #  ", "  #  ", "#####", "  #  ", "  #  ", "     "],
    "/": ["    #", "    #", "   # ", "  #  ", " #   ", "#    ", "#    "],
    "%": ["##  #", "##  #", "   # ", "  #  ", " #   ", "#  ##", "#  ##"],
    "°": [" ### ", " # # ", " ### ", "     ", "     ", "     ", "     "],
    "'": ["  #  ", "  #  ", "     ", "     ", "     ", "     ", "     "],
    '"': [" # # ", " # # ", "     ", "     ", "     ", "     ", "     "],
    "!": ["  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "     ", "  #  "],
    "?": [" ### ", "#   #", "    #", "   # ", "  #  ", "     ", "  #  "],
    "(": ["   # ", "  #  ", " #   ", " #   ", " #   ", "  #  ", "   # "],
    ")": [" #   ", "  #  ", "   # ", "   # ", "   # ", "  #  ", " #   "],
    "[": [" ### ", " #   ", " #   ", " #   ", " #   ", " #   ", " ### "],
    "]": [" ### ", "   # ", "   # ", "   # ", "   # ", "   # ", " ### "],
    "<": ["    #", "   # ", "  #  ", " #   ", "  #  ", "   # ", "    #"],
    ">": ["#    ", " #   ", "  #  ", "   # ", "  #  ", " #   ", "#    "],
    "=": ["     ", "     ", "#####", "     ", "#####", "     ", "     "],
    "*": ["     ", "  #  ", "# # #", " ### ", "# # #", "  #  ", "     "],
  });

const INCONNU: readonly string[] = GLYPHES[GLYPHE_INCONNU] ?? [];

/**
 * Cible de dessin minimale attendue par `dessineTexte` : un rectangle plein.
 *
 * Le `Renderer` du moteur satisfait cette forme dès qu'il expose `fillRect`
 * (T4). La police n'a besoin de rien d'autre, et cette réduction rend le rendu
 * testable sans canvas.
 */
export interface CibleDessin {
  fillRect(
    at: Vector2,
    largeur: number,
    hauteur: number,
    couleur: string,
  ): void;
}

/** Réglages de mise en page d'un texte bitmap. */
export interface OptionsTexte {
  /** Point d'ancrage horizontal du texte. Défaut : `left`. */
  align?: "left" | "center" | "right";
  /** Facteur d'agrandissement ENTIER ≥ 1. Défaut : 1. */
  echelle?: number;
  /** Pixels entre deux glyphes, entier ≥ 0. Défaut : 1. */
  espacement?: number;
}

/** L'échelle est entière et ≥ 1 : la grille de pixels ne se négocie pas. */
function echelleValide(valeur: number | undefined): number {
  const e = valeur ?? 1;
  return Number.isInteger(e) && e >= 1 ? e : 1;
}

/** L'espacement est entier et ≥ 0, pour la même raison. */
function espacementValide(valeur: number | undefined): number {
  const s = valeur ?? ESPACEMENT_DEFAUT;
  return Number.isInteger(s) && s >= 0 ? s : ESPACEMENT_DEFAUT;
}

/**
 * Traduit un texte en suite de glyphes : passage en majuscules, remplacement
 * des caractères inconnus par `?`. Le parcours est fait par point de code, donc
 * une paire de substitution compte pour un glyphe et non deux.
 */
function glyphesDe(texte: string): readonly (readonly string[])[] {
  const suite: (readonly string[])[] = [];
  for (const caractere of texte.toUpperCase()) {
    suite.push(GLYPHES[caractere] ?? INCONNU);
  }
  return suite;
}

/** Largeur totale d'une suite de glyphes déjà résolue. */
function largeurDe(
  nombre: number,
  echelle: number,
  espacement: number,
): number {
  if (nombre === 0) return 0;
  return (nombre * LARGEUR_GLYPHE + (nombre - 1) * espacement) * echelle;
}

/** Largeur du texte en pixels, espacement inter-glyphes compris. */
export function mesureTexte(texte: string, options?: OptionsTexte): number {
  const echelle = echelleValide(options?.echelle);
  const espacement = espacementValide(options?.espacement);
  return largeurDe(glyphesDe(texte).length, echelle, espacement);
}

/**
 * Dessine un texte bitmap. `at` est le coin haut-gauche du premier glyphe pour
 * `align: "left"`, et l'origine de l'alignement dans les autres cas. Les
 * coordonnées finales sont arrondies à l'entier.
 */
export function dessineTexte(
  r: CibleDessin,
  texte: string,
  at: Vector2,
  couleur: string,
  options?: OptionsTexte,
): void {
  const glyphes = glyphesDe(texte);
  if (glyphes.length === 0) return;

  const echelle = echelleValide(options?.echelle);
  const espacement = espacementValide(options?.espacement);
  const largeur = largeurDe(glyphes.length, echelle, espacement);

  const align = options?.align ?? "left";
  const decalage =
    align === "center" ? -largeur / 2 : align === "right" ? -largeur : 0;
  const x0 = Math.round(at.x + decalage);
  const y0 = Math.round(at.y);

  const pas = (LARGEUR_GLYPHE + espacement) * echelle;
  for (let i = 0; i < glyphes.length; i++) {
    dessineGlyphe(r, glyphes[i] ?? INCONNU, x0 + i * pas, y0, echelle, couleur);
  }
}

/**
 * Peint un glyphe **par segments** : sur chaque ligne, les pixels allumés
 * consécutifs partent en un seul `fillRect`. Un glyphe coûte alors une dizaine
 * d'appels au lieu de trente-cinq — indispensable pour tenir 60 images par
 * seconde avec un HUD complet.
 */
function dessineGlyphe(
  r: CibleDessin,
  glyphe: readonly string[],
  x: number,
  y: number,
  echelle: number,
  couleur: string,
): void {
  for (let ligne = 0; ligne < glyphe.length; ligne++) {
    const motif = glyphe[ligne];
    if (motif === undefined) continue;
    let debut = -1;
    // La borne va jusqu'à motif.length inclus pour fermer un segment collé au
    // bord droit du glyphe.
    for (let col = 0; col <= motif.length; col++) {
      const allume = col < motif.length && motif[col] === "#";
      if (allume) {
        if (debut < 0) debut = col;
      } else if (debut >= 0) {
        r.fillRect(
          new Vector2(x + debut * echelle, y + ligne * echelle),
          (col - debut) * echelle,
          echelle,
          couleur,
        );
        debut = -1;
      }
    }
  }
}
