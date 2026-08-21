import palette from "./palette.json";

/**
 * Palette du jeu : 16 couleurs nommées, unique source de vérité visuelle.
 *
 * Les valeurs ne sont **pas** écrites ici : elles vivent dans `palette.json`,
 * afin que le générateur `scripts/gen-palette-css.mjs` puisse les lire depuis
 * Node sans avoir à charger du TypeScript. Ce module ne fait que les typer et
 * les figer.
 */
export const PALETTE = Object.freeze(palette);

/** Nom d'une couleur de la palette. Aucune couleur hors de cette liste. */
export type CouleurLem = keyof typeof PALETTE;
