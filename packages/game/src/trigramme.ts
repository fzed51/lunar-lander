/**
 * Saisie d'un trigramme à la manière d'une borne d'arcade : trois lettres, une
 * position courante, quatre flèches.
 *
 * Le module est **pur** et ne connaît ni le DOM, ni le clavier, ni le hall of
 * fame. L'écran de fin de partie (T15) tient un `Trigramme` en variable et le
 * remplace à chaque appui ; c'est lui qui traduit les touches en appels, et lui
 * qui affiche le résultat.
 *
 * ## Défilement en boucle, positions bornées
 *
 * Les deux comportements sont différents, et c'est volontaire. Les lettres
 * tournent — après `Z` vient `A` —, sinon atteindre `Z` demanderait de savoir
 * qu'on est au bout. Les positions, elles, s'arrêtent : une droite en dernière
 * position qui ramènerait en première ferait valider par accident le trigramme
 * qu'on était en train de corriger.
 */

/** L'alphabet de la saisie. Rien d'autre n'entre dans un trigramme. */
export const LETTRES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Position de la lettre en cours d'édition : première, deuxième ou troisième. */
export type PositionTrigramme = 0 | 1 | 2;

/**
 * Un trigramme en cours de saisie : trois index dans `LETTRES`, plus la position
 * courante.
 *
 * Des index et non des caractères : c'est ce qui rend `monte` et `descend`
 * triviaux — un modulo — et interdit par construction qu'une valeur hors `A`–`Z`
 * s'installe dans l'état.
 */
export interface Trigramme {
  readonly lettres: readonly [number, number, number];
  readonly position: PositionTrigramme;
}

/** Trigramme de départ : `AAA`, curseur sur la première lettre. */
export function trigrammeInitial(): Trigramme {
  return { lettres: [0, 0, 0], position: 0 };
}

/**
 * Ramène un index dans `[0, 25]`, en **bouclant**. Écrit une fois ici plutôt que
 * dans `monte` et `descend` : un modulo de JavaScript rend un négatif sur une
 * entrée négative, et l'oublier d'un seul côté ferait sortir `descend` de
 * l'alphabet.
 */
function boucle(index: number): number {
  const taille = LETTRES.length;
  return ((Math.trunc(index) % taille) + taille) % taille;
}

/** Fait défiler la lettre courante de `pas` crans, en boucle. */
function defile(t: Trigramme, pas: number): Trigramme {
  const lettres: [number, number, number] = [...t.lettres];
  lettres[t.position] = boucle(lettres[t.position] + pas);
  return { lettres, position: t.position };
}

/** Lettre suivante de l'alphabet, `A` après `Z`. */
export function monte(t: Trigramme): Trigramme {
  return defile(t, 1);
}

/** Lettre précédente de l'alphabet, `Z` avant `A`. */
export function descend(t: Trigramme): Trigramme {
  return defile(t, -1);
}

/** Position **bornée** aux trois lettres : ni rebouclage, ni débordement. */
function bornePosition(position: number): PositionTrigramme {
  if (position <= 0) return 0;
  if (position >= 2) return 2;
  return 1;
}

/** Position précédente. Reste en première position si on y est déjà. */
export function gauche(t: Trigramme): Trigramme {
  return { lettres: t.lettres, position: bornePosition(t.position - 1) };
}

/** Position suivante. Reste en dernière position si on y est déjà. */
export function droite(t: Trigramme): Trigramme {
  return { lettres: t.lettres, position: bornePosition(t.position + 1) };
}

/**
 * La lettre d'un index. Le repli sur `A` couvre l'index impossible — un état
 * fabriqué à la main plutôt que construit par ce module : `texte` ne doit jamais
 * rendre autre chose que trois majuscules, y compris sur une entrée aberrante.
 */
export function lettreDe(index: number): string {
  return LETTRES[boucle(index)] ?? "A";
}

/** Les trois lettres du trigramme, prêtes à afficher ou à enregistrer. */
export function texte(t: Trigramme): string {
  return t.lettres.map(lettreDe).join("");
}
