/**
 * Hall of fame : les cent meilleures parties, conservées dans un `Stockage` et
 * classées par `comparePartie`.
 *
 * Ce module est de la logique pure plus trois appels de stockage. Il ne connaît
 * ni le DOM, ni les écrans : l'écran de fin de partie (T15) et l'écran du
 * classement (T16) l'appellent, jamais l'inverse.
 *
 * ## Le stockage est une donnée de l'utilisateur, pas une donnée du jeu
 *
 * `localStorage` s'édite à la main en trois clics dans les outils de
 * développement, et survit aux versions du jeu. Tout ce qui en sort est traité
 * comme une entrée hostile : JSON invalide, objet au lieu d'un tableau, entrée
 * sans trigramme, `points` valant `"douze"`, `tempsDeVol` négatif, trois cents
 * entrées au lieu de cent. Aucune fonction de ce module ne lève sur ces cas —
 * une exception ici gèlerait l'écran de fin de partie, juste après la dernière
 * vie perdue, au pire moment possible.
 */

import { comparePartie, type CleClassement } from "./score.ts";
import type { Stockage } from "./storage.ts";

/**
 * Clé du classement dans le stockage, **versionnée**. Un futur changement de
 * format prendra `lem.hof.v2` et laissera les données de la v1 intactes plutôt
 * que de les écraser à la première écriture.
 */
export const CLE_HOF = "lem.hof.v1";

/** Nombre d'entrées conservées au classement. */
export const TAILLE_HOF = 100;

/** Longueur du trigramme, en lettres. Le nom du type le dit déjà, la constante l'applique. */
const TRIGRAMME_LONGUEUR = 3;

/** Une lettre acceptée dans un trigramme : majuscule ASCII, rien d'autre. */
const LETTRE_TRIGRAMME = /^[A-Z]$/;

/** Une partie classée. C'est la ligne du tableau du hall of fame. */
export interface EntreeHof {
  /** Trois lettres `A`–`Z`, normalisées à l'écriture comme à la lecture. */
  readonly trigramme: string;
  /** Total de points, la somme des écarts. Le plus petit est le meilleur. */
  readonly points: number;
  /** Temps de vol total (s), valeur exacte. Seul le **tri** l'arrondit. */
  readonly tempsDeVol: number;
  /** Manches terminées par un posé. Au moins une, sinon la partie n'entre pas. */
  readonly manchesReussies: number;
  /** Difficulté de départ, celle du niveau choisi à l'accueil. */
  readonly niveauDepart: number;
  /** Horodatage ISO de la fin de partie, tel qu'écrit. */
  readonly date: string;
}

/**
 * Ce qu'il faut d'une partie pour savoir si elle mérite une place. Structural à
 * dessein : le `ResultatPartie` de `state.ts` le satisfait sans rien
 * transformer, et une `EntreeHof` aussi.
 */
export interface CandidatHof extends CleClassement {
  /** Manches terminées par un posé. En dessous de 1, la partie n'entre jamais. */
  readonly manchesReussies: number;
}

/**
 * Ramène n'importe quoi à trois lettres `A`–`Z` : minuscules mises en capitales,
 * tout le reste — chiffres, ponctuation, accents, absence de caractère —
 * remplacé par `A`.
 *
 * La fonction prend un `unknown` et non une `string` parce qu'elle sert des deux
 * côtés : sur la saisie du joueur (T15), et sur ce qui sort du stockage, où le
 * champ peut valoir `null`, `42` ou `"<script>"`. Le résultat est toujours de
 * longueur 3, donc affichable sans autre précaution — ce qui n'exonère pas T16
 * de passer par `textContent`.
 */
export function normaliseTrigramme(brut: unknown): string {
  const source = typeof brut === "string" ? brut : "";
  let trigramme = "";
  for (let i = 0; i < TRIGRAMME_LONGUEUR; i++) {
    const lettre = (source[i] ?? "").toUpperCase();
    trigramme += LETTRE_TRIGRAMME.test(lettre) ? lettre : "A";
  }
  return trigramme;
}

/** Vrai si la valeur est un nombre fini positif ou nul. Écarte `NaN`, `Infinity`, `"douze"`. */
function estNombrePositif(valeur: unknown): valeur is number {
  return typeof valeur === "number" && Number.isFinite(valeur) && valeur >= 0;
}

/**
 * Garde de type sur une entrée sortie du stockage.
 *
 * Elle est volontairement stricte sur les nombres et souple sur le trigramme :
 * un `points` à `NaN` empoisonnerait le tri de toute la liste, alors qu'un
 * trigramme douteux se rattrape par `normaliseTrigramme` sans perdre la
 * performance du joueur.
 *
 * `manchesReussies` doit valoir au moins 1 : la règle « une partie sans aucun
 * posé n'entre jamais au classement » vaut aussi pour une entrée fabriquée à la
 * main dans le stockage. La refuser à la lecture est le seul moyen de tenir la
 * règle face à des données qu'on n'a pas écrites.
 */
export function entreeValide(brut: unknown): brut is EntreeHof {
  if (typeof brut !== "object" || brut === null) return false;
  const e = brut as Partial<Record<keyof EntreeHof, unknown>>;
  return (
    typeof e.trigramme === "string" &&
    typeof e.date === "string" &&
    estNombrePositif(e.points) &&
    estNombrePositif(e.tempsDeVol) &&
    estNombrePositif(e.niveauDepart) &&
    estNombrePositif(e.manchesReussies) &&
    Number.isInteger(e.manchesReussies) &&
    e.manchesReussies >= 1
  );
}

/**
 * Classement lu, validé, trié et **tronqué à `TAILLE_HOF`**.
 *
 * C'est la seule porte de lecture du hall of fame, et la troncature est ici et
 * pas seulement à l'écriture : un stockage édité à la main, ou écrit par une
 * version antérieure, peut contenir trois cents entrées. Sans troncature en
 * lecture, `estQualifie` comparerait la partie qui vient de finir à la
 * trois-centième et laisserait entrer n'importe quoi.
 *
 * Les entrées invalides sont écartées une par une : quatre lignes corrompues ne
 * font pas perdre la cinquième, qui est bonne. Rend un tableau vide plutôt que
 * de lever, dans tous les cas de figure.
 */
export function lisHof(stockage: Stockage): readonly EntreeHof[] {
  let brut: string | null;
  try {
    brut = stockage.lit(CLE_HOF);
  } catch {
    return [];
  }
  if (brut === null) return [];

  let donnees: unknown;
  try {
    donnees = JSON.parse(brut);
  } catch {
    return [];
  }
  if (!Array.isArray(donnees)) return [];

  const lignes: readonly unknown[] = donnees;
  return lignes
    .filter(entreeValide)
    .map((e) => ({ ...e, trigramme: normaliseTrigramme(e.trigramme) }))
    .sort(comparePartie)
    .slice(0, TAILLE_HOF);
}

/**
 * Vrai si cette partie entre au classement.
 *
 * Deux conditions, dans cet ordre : au moins une manche réussie — un vol
 * interminable sans le moindre posé ne vaut rien —, puis une place libre ou une
 * meilleure performance que la centième. La comparaison porte sur la liste
 * **déjà tronquée** par `lisHof`, donc sur la centième et jamais sur la dernière
 * d'une liste plus longue.
 */
export function estQualifie(stockage: Stockage, resultat: CandidatHof): boolean {
  if (resultat.manchesReussies < 1) return false;
  const liste = lisHof(stockage);
  if (liste.length < TAILLE_HOF) return true;
  const derniere = liste[TAILLE_HOF - 1];
  if (derniere === undefined) return true;
  return comparePartie(resultat, derniere) < 0;
}

/**
 * Insère une entrée, trie, tronque, écrit, et rend le classement à jour.
 *
 * La garde « au moins une manche réussie » est répétée ici et n'est pas un
 * doublon de celle d'`estQualifie` : une garde qui ne couvre qu'un chemin ne
 * garde rien, et rien n'empêche un appelant d'écrire directement sans avoir
 * demandé la qualification.
 *
 * L'écriture est protégée : quota dépassé, navigation privée, stockage retiré
 * en cours de route — la liste rendue reste juste, seule sa persistance est
 * perdue. Faire remonter l'exception ferait planter l'écran de fin de partie
 * pour une raison que le joueur ne peut ni comprendre ni corriger.
 */
export function ajouteAuHof(
  stockage: Stockage,
  entree: EntreeHof,
): readonly EntreeHof[] {
  const liste = lisHof(stockage);
  if (entree.manchesReussies < 1) return liste;

  const normalisee: EntreeHof = {
    ...entree,
    trigramme: normaliseTrigramme(entree.trigramme),
  };
  const suivante = [...liste, normalisee]
    .sort(comparePartie)
    .slice(0, TAILLE_HOF);

  try {
    stockage.ecrit(CLE_HOF, JSON.stringify(suivante));
  } catch {
    // Stockage indisponible : la liste rendue reste correcte pour l'affichage.
  }
  return suivante;
}

/**
 * Efface le classement. C'est la remise à zéro de l'écran du hall of fame, dont
 * la **confirmation** est l'affaire de l'écran (T16) : ici, l'effacement est
 * déjà décidé.
 */
export function videHof(stockage: Stockage): void {
  try {
    stockage.efface(CLE_HOF);
  } catch {
    // Rien à rattraper : la liste est déjà considérée comme vide par l'appelant.
  }
}
