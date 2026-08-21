---
id: T1
titre: Design system — palette 16 couleurs, police bitmap, tokens canvas et CSS
fichiers: packages/game/src/design/palette.json, packages/game/src/design/palette.ts, packages/game/src/design/palette.css, packages/game/src/design/font.ts, packages/game/src/design/palette.test.ts, packages/game/src/design/font.test.ts, packages/game/scripts/gen-palette-css.mjs, packages/game/package.json, tsconfig.base.json, docs/design-system.md, packages/game/src/style.css, packages/game/src/main.ts
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

2. Ajouter `"resolveJsonModule": true` **et `"allowJs": true`** dans
   `tsconfig.base.json`. `allowJs` est indispensable : les tests importent
   `rendCss` depuis un `.mjs` (étape 4), et sans lui `tsc` refuse l'import
   (TS7016, « Could not find a declaration file »). L'alternative — maintenir un
   `gen-palette-css.d.mts` en double de l'implémentation — a été écartée.

3. Créer `packages/game/src/design/palette.ts` : importe le JSON, l'expose figé
   sous `PALETTE`, et exporte le type `CouleurLem = keyof typeof PALETTE`. Aucune
   valeur de couleur n'est écrite ici.

4. Créer `packages/game/scripts/gen-palette-css.mjs`, **découpé en deux** :
   - `export function rendCss(palette)` — **pure** : prend l'objet de couleurs et
     rend la chaîne CSS (bloc `:root`, une variable
     `--lem-<clé-en-kebab-case>` par couleur, précédée d'un en-tête « fichier
     généré, ne pas éditer à la main »). Elle ne lit ni n'écrit aucun fichier ;
   - `export function litPalette()` et `export function litCssCommite()` — les
     deux **lectures** de fichiers, exportées pour que les tests n'aient pas à
     importer `node:fs` : `@types/node` n'est installé nulle part dans le
     monorepo et le plan interdit d'ajouter une dépendance, donc un
     `import { readFileSync } from "node:fs"` dans un `.ts` échoue au typecheck
     (TS2307). Elles ne font que lire ; elles exposent aussi `CHEMIN_JSON` et
     `CHEMIN_CSS` ;
   - `main()` — seule fonction qui **écrit** sur le disque : `litPalette()` puis
     `writeFileSync` de `rendCss(...)` dans
     `packages/game/src/design/palette.css`. Elle n'est appelée que quand le
     module est exécuté directement (garde `import.meta.url` /
     `process.argv[1]`), **jamais** à l'import.
   Ce découpage est ce qui rend la garde de fraîcheur réelle : les tests
   importent `rendCss` et comparent en mémoire, sans jamais réécrire un fichier
   suivi par git. Un script qui n'écrit qu'en dur obligerait le test
   d'idempotence à relancer la génération, donc à réparer lui-même le fichier
   qu'un autre test est censé trouver périmé.
   Ajouter le script npm `"gen:palette": "node scripts/gen-palette-css.mjs"` dans
   `packages/game/package.json`.

5. Lancer le script et **commiter le CSS généré** : Vite doit pouvoir l'importer
   sans étape préalable.

6. Créer `packages/game/src/design/font.ts` : police bitmap **5 × 7**.
   - `GLYPHES: Readonly<Record<string, readonly string[]>>` — chaque glyphe est
     un tableau de **7 chaînes de 5 caractères**, `#` pour un pixel allumé,
     espace sinon. Couvrir `A`–`Z`, `0`–`9`, l'espace, et
     `. , : ; - + / % ° ' " ! ? ( ) [ ] < > = *`. Le `%` est le percent 5 × 7
     classique — deux blocs 2 × 2 et une diagonale : un `%` fait de pixels
     isolés rendrait vide de sens le test de segmentation (autant de rectangles
     que de pixels).
   - Constantes exportées : `LARGEUR_GLYPHE` (5), `HAUTEUR_GLYPHE` (7),
     `ESPACEMENT_DEFAUT` (1), `GLYPHE_INCONNU` (`"?"`).
   - `mesureTexte(texte: string, options?): number` — largeur en pixels, 1 pixel
     d'espacement entre glyphes.
   - `CibleDessin` — interface **structurelle minimale** exportée par `font.ts` :
     `fillRect(at: Vector2, largeur: number, hauteur: number, couleur: string)`,
     et rien d'autre. C'est le type du premier paramètre de `dessineTexte`, et
     non `Renderer` : au moment où T1 s'écrit, le `Renderer` n'a **aucune**
     primitive de rectangle plein — `fillRect` n'arrive qu'en T4 — donc un
     `r: Renderer` ne compilerait pas. La signature choisie est exactement celle
     que T4 donne au `Renderer`, qui satisfait donc `CibleDessin` sans qu'une
     ligne de `font.ts` change. Effet de bord voulu : le rendu du texte est
     testable sans canvas, ce qu'exige de toute façon le test « segments contre
     rendu naïf ».
   - `dessineTexte(r: CibleDessin, texte, at: Vector2, couleur: string, options?)`.
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
   L'échelle DOM reste **documentée seulement** : aucune variable CSS de
   typographie n'est posée en T1, parce qu'aucun écran DOM n'existe avant T5 et
   que des tokens sans consommateur sont du code écrit en prévision. C'est T5
   qui matérialise cette typographie, directement sur la règle `#ui` de
   `style.css`.

8. Importer `palette.css` depuis `packages/game/src/style.css` et y remplacer les
   couleurs en dur par les variables. `style.css` et `main.ts` sont donc bien
   touchés par cette tâche (ils figurent dans l'en-tête `fichiers:`) : la case
   « Fini quand » demande un contrôle visuel dans `main.ts`, et l'import du CSS
   se fait dans `style.css`.
   Pour ce contrôle visuel, `main.ts` s'est vu ajouter un adaptateur
   `CibleDessin` de cinq lignes au-dessus du `Renderer`. Il a **disparu** en T4,
   dès que `Renderer.fillRect` a existé : `main.ts` passe aujourd'hui
   `surface.renderer` directement à `dessineTexte`.

## Gardes et cas limites

- Palette figée : un test échoue si le JSON compte autre chose que 16 entrées, ou
  si une valeur n'est pas un hexadécimal `#rrggbb` en minuscules.
- CSS désynchronisé : un test lit le `palette.css` **commité** et échoue s'il
  diffère de `rendCss(litPalette())` — une seule variable manquante, en trop ou
  fausse fait rougir. C'est cette garde qui rend la « source unique » réelle
  plutôt que déclarative. Vérifiée en cassant volontairement une variable de
  `palette.css` : le test rougit bien.
- **Aucun test n'écrit dans `packages/game/src`**, ni directement ni en appelant
  le `main()` du générateur. Un test qui régénère `palette.css` répare la
  désynchronisation qu'un autre test doit détecter, et laisse le dépôt sale
  après un simple `yarn test`.
- Générateur relancé : idempotent, la deuxième exécution ne change pas un octet.
  Vérifié en mémoire, par deux appels de `rendCss` sur le même objet.
- Glyphe mal formé : un test échoue si un glyphe n'a pas exactement 7 lignes de
  5 caractères, ou contient autre chose que `#` et l'espace.
- Caractère inconnu passé à `dessineTexte` : dessiné comme `?`, jamais
  d'exception, jamais de trou silencieux.
- Texte vide : `mesureTexte("")` vaut 0, `dessineTexte` ne dessine rien.
- `echelle` non entière ou `< 1` : ramenée à 1 — la grille de pixels ne se
  négocie pas.
- `espacement` non entier ou `< 0` : ramené à `ESPACEMENT_DEFAUT`. Même raison
  que pour `echelle`, et c'est bien la raison qui a fait étendre la
  normalisation : un espacement fractionnaire décale hors grille **tous** les
  glyphes suivants, pas seulement le sien.
- Le découpage en segments doit rendre **exactement** les mêmes pixels que le
  dessin naïf : un test compare les rectangles produits aux pixels attendus, y
  compris pour un glyphe à trous (`H`, `%`, `8`). L'assertion retenue est un
  invariant **exact** et non une inégalité : le nombre de `fillRect` égale le
  nombre de suites maximales de `#` du glyphe. Un « moins de rectangles que de
  pixels » serait vrai sans rien prouver sur un glyphe sans pixels adjacents.

## Tests attendus

- `palette.json` : 16 entrées, toutes en `#rrggbb` minuscule, sans doublon de
  valeur.
- `palette.css` est à jour : le contenu du **fichier commité** est égal à
  `rendCss` appliqué au `palette.json` lu sur disque. Le test lit les deux
  fichiers par `litCssCommite()` et `litPalette()` — deux lectures, aucune
  écriture.
- `rendCss` est idempotent : deux appels sur le même objet rendent la même
  chaîne, octet pour octet.
- Tous les glyphes sont bien formés ; la table couvre `A`–`Z`, `0`–`9` et la
  ponctuation listée.
- `mesureTexte("AB")` vaut 11 ; `mesureTexte("")` vaut 0 ; l'échelle 2 double la
  largeur.
- Un caractère absent produit `?` et non une exception.
- Le rendu par segments couvre les mêmes pixels que le rendu naïf, sur `H`, `%`
  et `8`, et en **exactement** autant de `fillRect` que le glyphe a de suites de
  `#`.

## Fini quand

- [x] `palette.json` est la seule source des couleurs, `PALETTE` la typée,
      `palette.css` la reflète et un test le garantit **sans réécrire le
      fichier** (`git status` est propre après `yarn test` — vérifié, et casser
      une variable de `palette.css` fait bien rougir le test de fraîcheur).
- [x] `dessineTexte` écrit un texte lisible en 5 × 7 dans le canvas 320 × 180
      (contrôle visuel : `ALTITUDE 0000 M` affiché dans `main.ts`). La table
      5 × 7 est **conservée** : ni repli en 4 × 6 condensé, ni passage en 6 × 8.
      Le texte de contrôle a été remplacé en T5 par les écrans bouchons.
- [x] Le texte est peint par segments, pas pixel par pixel.
- [x] `docs/design-system.md` documente palette, règles d'emploi et échelles.
- [x] La commande de vérification du README du plan passe au vert.
      `palette.test.ts` : 10 tests, `font.test.ts` : 28 tests.
