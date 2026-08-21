/**
 * Générateur des tokens CSS de la palette.
 *
 * `palette.json` est la source unique des couleurs ; ce script en dérive
 * `src/design/palette.css`, la forme consommable par les écrans en DOM.
 *
 * Le module est volontairement découpé en deux : `rendCss` est pure et ne
 * touche à aucun fichier, `main` est la seule à lire et écrire sur le disque.
 * Les tests importent `rendCss` et comparent en mémoire — aucun test ne
 * régénère le fichier suivi par git, sinon la garde de fraîcheur réparerait
 * elle-même la désynchronisation qu'elle est censée détecter.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ICI = dirname(fileURLToPath(import.meta.url));

/** Source unique des couleurs. */
export const CHEMIN_JSON = resolve(ICI, "../src/design/palette.json");

/** Feuille générée, commitée pour que Vite l'importe sans étape préalable. */
export const CHEMIN_CSS = resolve(ICI, "../src/design/palette.css");

const EN_TETE = [
  "/* Fichier GÉNÉRÉ par packages/game/scripts/gen-palette-css.mjs.",
  " * Ne pas éditer à la main : toute couleur se modifie dans",
  " * packages/game/src/design/palette.json, puis `yarn gen:palette`.",
  " */",
].join("\n");

/** Convertit une clé camelCase (`reliefSombre`) en kebab-case. */
export function versKebab(cle) {
  return cle.replace(/[A-Z]/g, (lettre) => `-${lettre.toLowerCase()}`);
}

/**
 * Rend la feuille CSS des tokens de couleur.
 *
 * Fonction PURE : elle ne lit ni n'écrit aucun fichier. Deux appels sur le même
 * objet rendent la même chaîne, octet pour octet.
 *
 * @param {Record<string, string>} palette couleurs nommées, dans l'ordre voulu
 * @returns {string} feuille CSS complète, terminée par un saut de ligne
 */
export function rendCss(palette) {
  const lignes = Object.entries(palette).map(
    ([cle, valeur]) => `  --lem-${versKebab(cle)}: ${valeur};`,
  );
  return `${EN_TETE}\n\n:root {\n${lignes.join("\n")}\n}\n`;
}

/**
 * Lit la palette source. Lecture seule — c'est ce que les tests utilisent pour
 * ne pas avoir à importer `node:fs` depuis TypeScript.
 *
 * @returns {Record<string, string>}
 */
export function litPalette() {
  return JSON.parse(readFileSync(CHEMIN_JSON, "utf8"));
}

/**
 * Lit la feuille CSS commitée. Lecture seule.
 *
 * @returns {string}
 */
export function litCssCommite() {
  return readFileSync(CHEMIN_CSS, "utf8");
}

/** Seule fonction à ÉCRIRE sur le disque. Jamais appelée à l'import. */
function main() {
  const palette = litPalette();
  writeFileSync(CHEMIN_CSS, rendCss(palette), "utf8");
  const nombre = Object.keys(palette).length;
  console.log(`palette.css régénéré — ${nombre} couleurs.`);
}

// Exécution directe seulement : `node scripts/gen-palette-css.mjs`.
const lance = process.argv[1] ? resolve(process.argv[1]) : "";
if (lance === fileURLToPath(import.meta.url)) {
  main();
}
