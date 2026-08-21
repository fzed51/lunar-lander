---
id: T1
titre: Design system — palette 16 couleurs, police bitmap, tokens canvas et CSS
fichiers: packages/game/src/design/palette.json, packages/game/src/design/palette.ts, packages/game/src/design/palette.css, packages/game/src/design/font.ts, packages/game/src/design/palette.test.ts, packages/game/src/design/font.test.ts, packages/game/scripts/gen-palette-css.mjs, packages/game/package.json, tsconfig.base.json, docs/design-system.md
sensible: false
---

# T1 — Design system

## Objectif

Figer, avant tout écran, l'unique source de vérité visuelle du jeu : 16 couleurs
nommées, une police bitmap pour le canvas, et leur équivalent CSS pour les
écrans en DOM.

## Ce qui existe

- `packages/game/src/constants.ts` porte `PIXEL` (320 × 180) et `MOON_GRAVITY`.
- `packages/game/src/style.css` : une feuille minimale (fond noir, canvas
  centré, `image-rendering: pixelated`).
- `packages/engine/src/render/Renderer.ts:drawText` sait écrire du texte avec la
  police du navigateur — inutilisable à 320 × 180, où une police vectorielle
  rend un texte flou et hors grille.
- `tsconfig.base.json` n'active **pas** `resolveJsonModule`.
- Il n'y a **aucune** palette, **aucune** police bitmap, **aucun** token CSS.

## À faire

1. Créer `packages/game/src/design/palette.json` : la **source unique**, un objet
   de **exactement 16 entrées**, dans cet ordre et avec ces valeurs :

   | Clé | Valeur | Emploi |
   |---|---|---|
   | `espace` | `#000000` | fond de l'espace, vide |
   | `nuit` | `#0d0d1a` | bas du ciel, ombre du ciel |
   | `ombre` | `#1b2032` | ombre lunaire profonde, faces cachées |
   | `reliefSombre` | `#2e3448` | relief à l'ombre |
   | `reliefMoyen` | `#4a5068` | relief en mi-ton |
   | `reliefClair` | `#6b7186` | relief éclairé |
   | `grisClair` | `#949aad` | crêtes, structures |
   | `grisPale` | `#c3c8d6` | reflets, texte secondaire |
   | `blanc` | `#ffffff` | étoiles, LEM, texte principal |
   | `flammeClaire` | `#ffd447` | cœur de la flamme, jauge pleine |
   | `flammeChaude` | `#ff8c2b` | halo de la flamme, avertissement |
   | `alerte` | `#e33d3d` | crash, valeur hors seuil, carburant bas |
   | `terreOcean` | `#2f6fd0` | océans de la Terre |
   | `terreCiel` | `#6fb7f2` | atmosphère, nuages |
   | `terreSol` | `#3f9e5a` | continents |
   | `accent` | `#57d6c0` | sélection d'interface, valeur dans les clous |

   Le JSON est la source, et non un module TypeScript, pour que le générateur CSS
   n'ait pas à charger du TypeScript depuis Node : le décapage de types de Node
   n'est acquis qu'à partir de la version 22.18, et un outillage qui dépend de la
   version de Node installée est un outillage qui cassera.

2. Ajouter `"resolveJsonModule": true` dans `tsconfig.base.json`.

3. Créer `packages/game/src/design/palette.ts` : importe le JSON, l'expose figé
   sous `PALETTE`, et exporte le type `CouleurLem = keyof typeof PALETTE`. Aucune
   valeur de couleur n'est écrite ici.

4. Créer `packages/game/scripts/gen-palette-css.mjs` : lit `palette.json` avec
   `readFileSync` + `JSON.parse`, écrit `packages/game/src/design/palette.css`
   avec un bloc `:root` portant une variable `--lem-<clé-en-kebab-case>` par
   couleur, précédé d'un en-tête « fichier généré, ne pas éditer à la main ».
   Ajouter le script npm `"gen:palette": "node scripts/gen-palette-css.mjs"` dans
   `packages/game/package.json`.

5. Lancer le script et **commiter le CSS généré** : Vite doit pouvoir l'importer
   sans étape préalable.

6. Créer `packages/game/src/design/font.ts` : police bitmap **5 × 7**.
   - `GLYPHES: Readonly<Record<string, readonly string[]>>` — chaque glyphe est
     un tableau de **7 chaînes de 5 caractères**, `#` pour un pixel allumé,
     espace sinon. Couvrir `A`–`Z`, `0`–`9`, l'espace, et
     `. , : ; - + / % ° ' " ! ? ( ) [ ] < > = *`.
   - `mesureTexte(texte: string, options?): number` — largeur en pixels, 1 pixel
     d'espacement entre glyphes.
   - `dessineTexte(r: Renderer, texte, at: Vector2, couleur: string, options?)`.
     Options : `align: "left" | "center" | "right"` (défaut `left`),
     `echelle: number` entier (défaut 1), `espacement: number` (défaut 1).
   - Le texte est **converti en majuscules** avant dessin ; un caractère absent
     de la table est remplacé par `?`.
   - **Dessin par segments** : sur chaque ligne d'un glyphe, les pixels allumés
     consécutifs sont peints en **un seul** `fillRect`, pas un par un. Un glyphe
     coûte alors une dizaine d'appels au lieu de trente-cinq — le HUD complet
     tourne à 60 images par seconde, ce qu'un `drawPixel` par pixel ne garantit
     pas (environ 3 000 appels par image).

7. Écrire `docs/design-system.md` : la planche de la palette (clé, valeur,
   emploi), les règles d'emploi (le relief se lit sur trois gris et pas plus ;
   `alerte` est réservée au danger ; `accent` est réservée à l'interface ; aucune
   couleur hors palette, aucun dégradé, aucune ombre floue), l'échelle de texte
   canvas (police 5 × 7 aux échelles 1 et 2), l'échelle DOM (tailles
   8 / 16 / 24 / 32 px, `font-family: ui-monospace, "Courier New", monospace`,
   `font-weight: 700`, `letter-spacing: 1px`), et la règle « aucun asset
   externe ».

8. Importer `palette.css` depuis `packages/game/src/style.css` et y remplacer les
   couleurs en dur par les variables.

## Gardes et cas limites

- Palette figée : un test échoue si le JSON compte autre chose que 16 entrées, ou
  si une valeur n'est pas un hexadécimal `#rrggbb` en minuscules.
- CSS désynchronisé : un test lit `palette.css` et échoue si une seule variable
  manque, est en trop, ou ne correspond pas à `palette.json`. C'est cette garde
  qui rend la « source unique » réelle plutôt que déclarative.
- Générateur relancé : idempotent, la deuxième exécution ne change pas un octet.
- Glyphe mal formé : un test échoue si un glyphe n'a pas exactement 7 lignes de
  5 caractères, ou contient autre chose que `#` et l'espace.
- Caractère inconnu passé à `dessineTexte` : dessiné comme `?`, jamais
  d'exception, jamais de trou silencieux.
- Texte vide : `mesureTexte("")` vaut 0, `dessineTexte` ne dessine rien.
- `echelle` non entière ou `< 1` : ramenée à 1 — la grille de pixels ne se
  négocie pas.
- Le découpage en segments doit rendre **exactement** les mêmes pixels que le
  dessin naïf : un test compare les rectangles produits aux pixels attendus, y
  compris pour un glyphe à trous (`H`, `%`, `8`).

## Tests attendus

- `palette.json` : 16 entrées, toutes en `#rrggbb` minuscule, sans doublon de
  valeur.
- `palette.css` est à jour vis-à-vis de `palette.json` (comparaison du fichier
  réel, pas de la fonction de génération).
- Le générateur est idempotent.
- Tous les glyphes sont bien formés ; la table couvre `A`–`Z`, `0`–`9` et la
  ponctuation listée.
- `mesureTexte("AB")` vaut 11 ; `mesureTexte("")` vaut 0 ; l'échelle 2 double la
  largeur.
- Un caractère absent produit `?` et non une exception.
- Le rendu par segments couvre les mêmes pixels que le rendu naïf, sur `H`, `%`
  et `8`.

## Fini quand

- [ ] `palette.json` est la seule source des couleurs, `PALETTE` la typée,
      `palette.css` la reflète et un test le garantit.
- [ ] `dessineTexte` écrit un texte lisible en 5 × 7 dans le canvas 320 × 180
      (contrôle visuel : afficher `ALTITUDE 0000 M` dans `main.ts`).
- [ ] Le texte est peint par segments, pas pixel par pixel.
- [ ] `docs/design-system.md` documente palette, règles d'emploi et échelles.
- [ ] La commande de vérification du README du plan passe au vert.
