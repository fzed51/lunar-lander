/**
 * Score de type golf : chaque manche réussie coûte l'écart au drapeau, et le
 * **plus petit** total gagne. Une manche perdue ne coûte rien de plus que la vie
 * qu'elle a prise — sinon le score punirait deux fois le même échec.
 */

/**
 * Total de points d'une partie : la **somme** des écarts de ses manches
 * réussies. Vaut 0 quand aucune manche n'a été réussie, et 0 aussi sur un
 * parcours parfait — c'est le score idéal du cahier des charges, et c'est
 * assumé : ce sont `manchesReussies` puis `tempsDeVol` qui séparent les deux au
 * classement.
 */
export function totalPoints(ecarts: readonly number[]): number {
  return ecarts.reduce((somme, ecart) => somme + ecart, 0);
}

/**
 * Ce qu'il faut d'une partie pour la classer. Structural à dessein : l'entrée de
 * hall of fame de T14 porte d'autres champs et satisfait quand même ce type.
 */
export interface CleClassement {
  /** Temps de vol cumulé (s). Clé principale, la plus longue d'abord. */
  readonly tempsDeVol: number;
  /** Total de points. Clé secondaire, le plus petit d'abord. */
  readonly points: number;
}

/**
 * Comparateur du hall of fame : temps de vol **arrondi à la seconde**
 * décroissant, puis total de points croissant.
 *
 * L'arrondi est indispensable, ce n'est pas une coquetterie d'affichage : le
 * temps de vol est une somme de pas de temps flottants, deux parties ne seraient
 * jamais exactement égales et la seconde clé de tri ne servirait jamais.
 *
 * Le comparateur est cohérent — antisymétrique, transitif, et rend 0 sur deux
 * parties de mêmes clés : `Array.prototype.sort` est stable, donc deux parties
 * indiscernables gardent leur ordre d'insertion.
 */
export function comparePartie(a: CleClassement, b: CleClassement): number {
  const secondesA = Math.round(a.tempsDeVol);
  const secondesB = Math.round(b.tempsDeVol);
  if (secondesA !== secondesB) return secondesB - secondesA;
  return a.points - b.points;
}
