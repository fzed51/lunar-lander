# Design system du LEM

Une seule source de vérité visuelle pour tout le jeu : 16 couleurs nommées, une
police bitmap 5 × 7 pour le canvas, et le même jeu de couleurs en variables CSS
pour les écrans en DOM.

Aucune couleur, aucune taille de texte ne se décide ailleurs.

## Où vit quoi

| Fichier | Rôle |
|---|---|
| `packages/game/src/design/palette.json` | **Source unique** des 16 couleurs. C'est le seul endroit où l'on écrit une valeur hexadécimale. |
| `packages/game/src/design/palette.ts` | Expose `PALETTE` (figée) et le type `CouleurLem`. N'écrit aucune valeur. |
| `packages/game/src/design/palette.css` | **Fichier généré**, commité. Une variable `--lem-<clé-en-kebab-case>` par couleur. Ne pas éditer à la main. |
| `packages/game/src/design/font.ts` | Police bitmap 5 × 7 : `GLYPHES`, `mesureTexte`, `dessineTexte`. |
| `packages/game/scripts/gen-palette-css.mjs` | Générateur du CSS. `yarn workspace @lem/game gen:palette`. |

Le JSON est la source, et non un module TypeScript, pour que le générateur n'ait
pas à charger du TypeScript depuis Node : le décapage de types de Node n'est
acquis qu'à partir de la version 22.18, et un outillage qui dépend de la version
de Node installée est un outillage qui cassera.

Un test lit le `palette.css` **commité** et le compare au rendu du `palette.json`
lu sur disque. Une variable manquante, en trop ou fausse fait rougir la suite.
Aucun test ne réécrit le fichier : après un `yarn test`, `git status` est propre.

## La palette

| Clé | Variable CSS | Valeur | Emploi |
|---|---|---|---|
| `espace` | `--lem-espace` | `#000000` | fond de l'espace, vide |
| `nuit` | `--lem-nuit` | `#0d0d1a` | bas du ciel, ombre du ciel |
| `ombre` | `--lem-ombre` | `#1b2032` | ombre lunaire profonde, faces cachées |
| `reliefSombre` | `--lem-relief-sombre` | `#2e3448` | relief à l'ombre |
| `reliefMoyen` | `--lem-relief-moyen` | `#4a5068` | relief en mi-ton |
| `reliefClair` | `--lem-relief-clair` | `#6b7186` | relief éclairé |
| `grisClair` | `--lem-gris-clair` | `#949aad` | crêtes, structures |
| `grisPale` | `--lem-gris-pale` | `#c3c8d6` | reflets, texte secondaire |
| `blanc` | `--lem-blanc` | `#ffffff` | étoiles, LEM, texte principal |
| `flammeClaire` | `--lem-flamme-claire` | `#ffd447` | cœur de la flamme, jauge pleine |
| `flammeChaude` | `--lem-flamme-chaude` | `#ff8c2b` | halo de la flamme, avertissement |
| `alerte` | `--lem-alerte` | `#e33d3d` | crash, valeur hors seuil, carburant bas |
| `terreOcean` | `--lem-terre-ocean` | `#2f6fd0` | océans de la Terre |
| `terreCiel` | `--lem-terre-ciel` | `#6fb7f2` | atmosphère, nuages |
| `terreSol` | `--lem-terre-sol` | `#3f9e5a` | continents |
| `accent` | `--lem-accent` | `#57d6c0` | sélection d'interface, valeur dans les clous |

## Règles d'emploi

- **Aucune couleur hors palette.** Ni au canvas, ni en CSS. Un besoin nouveau se
  règle en réutilisant une couleur existante, pas en ajoutant la dix-septième.
- **Le relief se lit sur trois gris et pas plus** : `reliefSombre`,
  `reliefMoyen`, `reliefClair`. `ombre` sert au noir de l'ombre portée,
  `grisClair` et `grisPale` aux crêtes et aux reflets. Empiler davantage de
  nuances brouille la lecture du terrain à 320 × 180.
- **`alerte` est réservée au danger** : crash, valeur hors seuil, carburant bas.
  Elle ne décore jamais.
- **`accent` est réservée à l'interface** : élément sélectionné, valeur dans les
  clous. Elle n'apparaît jamais dans la scène jouée.
- **`flammeClaire` et `flammeChaude`** vont ensemble : cœur clair, halo chaud.
  `flammeChaude` sert aussi d'avertissement, le cran avant `alerte`.
- **Les quatre couleurs `terre*`** ne servent qu'à la Terre du fond animé.
- **Aucun dégradé, aucune ombre floue, aucune transparence décorative.** Les
  aplats et le tramage suffisent : c'est ce qui donne l'image un pixel = un
  pixel.

## Texte au canvas

La police est dessinée par le code, en **5 × 7 pixels**, glyphe par glyphe. À
320 × 180, une police vectorielle rend un texte flou et hors grille : elle est
inutilisable ici.

- **Grille** : 5 pixels de large, 7 de haut, ligne de base sur la dernière ligne.
- **Espacement** : 1 pixel entre deux glyphes. Le pas d'un glyphe vaut donc 6
  pixels à l'échelle 1.
- **Échelles** : **1** pour le HUD et les valeurs chiffrées, **2** pour les
  titres et les verdicts. Rien d'autre. L'échelle est un entier ≥ 1 ; une
  échelle non entière ou inférieure à 1 est ramenée à 1, car la grille de pixels
  ne se négocie pas.
- **Casse** : le texte est passé en majuscules avant dessin. La police n'a pas de
  minuscules.
- **Couverture** : `A`–`Z`, `0`–`9`, l'espace, et
  `. , : ; - + / % ° ' " ! ? ( ) [ ] < > = *`. Tout caractère absent est dessiné
  comme `?` — jamais d'exception, jamais de trou silencieux.
- **Alignement** : `left` (défaut), `center`, `right`. Les coordonnées finales
  sont arrondies à l'entier.
- **Peinture par segments** : sur chaque ligne d'un glyphe, les pixels allumés
  consécutifs partent en un seul `fillRect`. Un glyphe coûte une dizaine
  d'appels au lieu de trente-cinq ; c'est ce qui laisse le HUD complet tenir
  60 images par seconde.

```ts
import { PALETTE } from "./design/palette.ts";
import { dessineTexte, mesureTexte } from "./design/font.ts";

dessineTexte(r, "ALTITUDE 0000 M", new Vector2(160, 8), PALETTE.grisPale, {
  align: "center",
});
const largeur = mesureTexte("CARBURANT", { echelle: 2 }); // 106
```

## Texte au DOM

Les écrans en DOM (s'il en reste) partagent la palette par ses variables CSS et
la même sobriété typographique.

- **Famille** : `font-family: ui-monospace, "Courier New", monospace;` — une
  police système, jamais un fichier de police téléchargé.
- **Graisse** : `font-weight: 700`.
- **Interlettrage** : `letter-spacing: 1px`.
- **Échelle** : **8 / 16 / 24 / 32 px**. Quatre tailles, pas cinq.

| Taille | Emploi |
|---|---|
| 8 px | mentions, notes de bas d'écran |
| 16 px | texte courant |
| 24 px | sous-titres, intitulés de colonne |
| 32 px | titres |

`style.css` importe `design/palette.css` et n'écrit aucune couleur en dur :
toutes passent par `var(--lem-…)`.

## Aucun asset externe

Ni image, ni police, ni son, ni feuille de style distante. Tout est dessiné ou
généré par le code. Le jeu doit s'ouvrir hors ligne, et son rendu ne doit
dépendre d'aucune ressource qu'on ne contrôle pas.

## Ajouter ou modifier une couleur

1. Éditer `packages/game/src/design/palette.json`.
2. `yarn workspace @lem/game gen:palette`.
3. Commiter le JSON **et** le `palette.css` régénéré.

Sauter l'étape 2 fait rougir le test de fraîcheur du CSS. C'est voulu.
