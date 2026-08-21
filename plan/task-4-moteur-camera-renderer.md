---
id: T4
titre: Caméra, primitives de dessin et robustesse du clavier
fichiers: packages/engine/src/render/Camera.ts, packages/engine/src/render/Camera.test.ts, packages/engine/src/render/Renderer.ts, packages/engine/src/input/KeyboardInput.ts, packages/engine/src/input/KeyboardInput.test.ts, packages/engine/src/index.ts
sensible: false
---

# T4 — Caméra, primitives de dessin, clavier

## Objectif

Donner au moteur une caméra à zoom **entier** (conversion monde ↔ écran, suivi,
bornage), les primitives de dessin qui manquent pour du pixel art, et corriger le
clavier qui reste enfoncé quand la fenêtre perd le focus.

## Ce qui existe

- `packages/engine/src/render/Renderer.ts` : `clear`, `drawPolygon`,
  `drawCircle`, `drawLine`, `drawText`, `withTransform(pos, angle, fn)`,
  `withAlpha(alpha, fn)`, et un `paint` privé qui applique `StrokeFill`.
- Aucune caméra : Asteroids dessinait en coordonnées écran directes.
- Il n'y a ni pixel, ni rectangle, ni polyligne ouverte, ni découpe.
- `packages/engine/src/input/KeyboardInput.ts` écoute `keydown` et `keyup` sur
  `window`. Il n'écoute **pas** `blur` : si la fenêtre perd le focus touche
  enfoncée, le `keyup` n'arrive jamais et la commande reste active pour toujours
  — le LEM tourne indéfiniment au retour d'onglet.
- `onKeyDown` ne regarde que `e.code` : il **ignore** `ctrlKey`, `metaKey` et
  `altKey`, et appelle `preventDefault()` dès que le code est dans le mapping.
  Un `Ctrl+R` ou `Cmd+R` produit donc un front montant sur la commande mappée
  sur `KeyR` (la remise à zéro du hall of fame, T16) **et** supprime le
  rechargement de page. Même chose pour tout raccourci navigateur bâti sur les
  flèches, Entrée, Échap, `H` ou `R`.
- `KeyboardInput.test.ts` : 4 tests **intouchables**.

## À faire

1. Créer `packages/engine/src/render/Camera.ts`.
   - `Camera` **immuable** : `readonly centre: Vector2`,
     `readonly zoom: number` (**entier ≥ 1**),
     `readonly vue: TailleVue` (taille de la surface de rendu, en pixels). Les
     deux formes de données sont des interfaces exportées :
     `TailleVue { largeur; hauteur }` et `Limites { xMin; xMax; yMin; yMax }`.
   - `creeCamera(centre: Vector2, vue: TailleVue, zoom = 1): Camera` — la
     **fabrique validée**, ajoutée à la fiche d'origine. `Camera` étant une
     donnée immuable (interface plus fonctions libres, comme `Heightfield`), un
     simple objet littéral contournait le seul garde-fou existant, `avecZoom` :
     rien n'empêchait de poser un zoom 1,5 ou une vue de taille nulle à la
     construction. `creeCamera` valide le zoom entier ≥ 1 **et** une vue finie
     strictement positive.
   - `versEcran(cam, monde: Vector2): Vector2` — conversion exacte, flottante.
   - `versEcranPixel(cam, monde: Vector2): Vector2` — conversion **arrondie à
     l'entier**. C'est celle-là que le jeu utilise pour dessiner.
   - `versMonde(cam, ecran: Vector2): Vector2` — inverse exacte de `versEcran`.
   - `avecCentre(cam, centre)`, `avecZoom(cam, zoom)` — rendent une nouvelle
     caméra ; `avecZoom` **refuse** un zoom non entier ou `< 1` par une erreur
     explicite.
   - `borne(cam, limites: { xMin; xMax; yMin; yMax })` — recentre pour que la vue
     ne sorte pas des limites ; si le monde est plus petit que la vue sur un axe,
     la vue est **centrée** sur cet axe.
   - `suit(cam, cible: Vector2, dt: number, reactivite: number)` — lissage
     exponentiel indépendant du framerate (`1 - Math.exp(-reactivite * dt)`),
     jamais un `lerp(…, dt)`.
   - `bornesVisibles(cam): { xMin; xMax; yMin; yMax }` — l'étendue monde couverte
     par la vue. C'est ce que T10 utilise pour ne parcourir que la tranche de
     terrain visible.
   - `estVisible(cam, point, marge?): boolean`.
2. Ajouter au `Renderer`, dans le style de l'existant (`StrokeFill`, `paint`) :
   - `drawPixel(at: Vector2, couleur: string, taille = 1)` — un pixel plein, de
     `taille` pixels de côté (la taille vaut le zoom quand on dessine du monde) ;
   - `fillRect(at: Vector2, largeur, hauteur, couleur)` ;
   - `strokeRect(at: Vector2, largeur, hauteur, opts?: StrokeFill)` — peint en
     **quatre `fillRect`**, et non en `ctx.rect()` + `paint()` comme le suggérait
     « le style de l'existant ». Un trait de canvas est centré sur son chemin :
     une épaisseur 1 posée sur des coordonnées entières déborde d'un demi-pixel
     de chaque côté et ressort en deux rangées à 50 % d'opacité — l'antialiasing
     même que cette tâche combat, et un cadre de jauge du HUD flou et large de
     deux pixels en T11. Les options `StrokeFill` sont respectées : `fill` peint
     l'intérieur, `stroke` le contour, `lineWidth` son épaisseur, tracée **à
     l'intérieur** du rectangle ;
   - `drawPolyline(points, opts?)` — chemin **ouvert** : le terrain n'est pas un
     polygone fermé. Celle-là garde bien `paint()` : une polyligne quelconque ne
     se corrige pas par un décalage, il faudrait un rasteriseur de segments, hors
     périmètre ;
   - `withClip(at, largeur, hauteur, fn)` — découpe rectangulaire pendant `fn`,
     `save` / `restore` encadrés d'un `try` / `finally`.
3. **Ne pas** ajouter de `withCamera` qui appliquerait `ctx.scale` : c'est le
   piège de cette tâche. Une mise à l'échelle du contexte place les bords des
   formes à des coordonnées fractionnaires dès que la position monde n'est pas
   entière — le LEM est à `x = 623,47` — ce qui donne des pixels antialiasés et
   de largeur irrégulière. Le jeu convertit ses coordonnées avec
   `versEcranPixel` et multiplie ses tailles par le zoom entier ; le contexte
   canvas, lui, reste à l'échelle 1.
4. Ajouter à `KeyboardInput` un écouteur `blur` sur la cible qui **vide
   `active`** (et laisse `pressedSincePoll` intact : un front montant déjà
   enregistré est une information réelle). `dispose()` retire aussi cet
   écouteur. Les 4 tests existants doivent rester verts sans modification.
5. **Ignorer les raccourcis à modificateur** : en **tête** de `onKeyDown`, avant
   toute lecture du mapping,
   `if (e.ctrlKey || e.metaKey || e.altKey) return;` — sans `preventDefault`,
   pour que le navigateur garde son raccourci. C'est la **seconde et dernière**
   retouche autorisée sur `KeyboardInput` (le hors périmètre du README du plan
   l'énumère avec le `blur`). Sans elle, `Cmd+R` ne recharge pas la page et vaut
   un appui sur la commande `raz` de T16 : deux `Cmd+R` de suite effacent les
   100 entrées du hall of fame. `shiftKey` n'est **pas** filtré : il ne porte
   aucun raccourci navigateur sur les touches du jeu.
   **`onKeyUp` n'est pas filtré**, volontairement : il ne fait qu'un
   `active.delete` et n'appelle aucun `preventDefault`, donc le filtrer
   n'apporterait rien et laisserait une commande bloquée quand la touche est
   relâchée après avoir attrapé un `Ctrl` en cours de route.
   Rien en aval ne peut rattraper ce cas : `InputSnapshot` n'expose que
   `isActive` / `justPressed` et ne transporte aucun modificateur.
6. Ajouter les exports dans `packages/engine/src/index.ts`.
7. Ne **rien** changer aux méthodes existantes du `Renderer` : les ajouts sont
   des ajouts.

## Gardes et cas limites

- `zoom` non entier, nul ou négatif : erreur explicite. Un zoom fractionnaire est
  précisément ce que cette tâche interdit ; un zoom nul rend des coordonnées
  infinies et fait disparaître l'écran sans message.
- `versMonde(versEcran(p))` retrouve `p` à la précision flottante près, à zoom
  1, 2 et 4.
- `versEcranPixel` est **stable** : deux positions monde distantes de moins d'un
  demi-pixel écran donnent le même pixel, sans osciller.
- `borne` quand le monde est **plus petit** que la vue : centrage, pas un clamp
  qui collerait la vue dans un coin.
- `suit` avec `dt = 0` : la caméra ne bouge pas. Avec un `dt` énorme (lag), elle
  ne dépasse jamais la cible — c'est ce que garantit la forme exponentielle.
- `bornesVisibles` reste correct après `borne`, et au zoom 4 couvre bien quatre
  fois moins de monde qu'au zoom 1.
- `withClip` restaure le contexte même si `fn` lève. **Non verrouillé par un
  test** : cette fiche ne prévoit ni `Renderer.test.ts` dans ses fichiers ni ce
  cas dans ses tests attendus, et happy-dom ne fournit aucun contexte canvas. La
  garantie ne repose donc que sur le `try` / `finally` du code. À reprendre avec
  un faux contexte si une tâche suivante veut la verrouiller — c'est le seul
  découvert assumé de T4.
- Coordonnées non finies : un `NaN` dans un `Vector2` ne doit pas se propager
  silencieusement en dessin vide ; au minimum, le documenter. Retenu : les
  coordonnées de points ne sont **pas** filtrées (c'est documenté en tête de
  module), mais les deux endroits où un `NaN` contaminerait ensuite *toutes* les
  conversions de la caméra le sont, par une erreur explicite — la `vue` dans
  `creeCamera` et les `limites` dans `borne`. Un point non fini ne coûte qu'un
  ordre de dessin ignoré ; une caméra non finie coûte l'image entière.
- `blur` : après l'événement, aucune commande n'est active, et un `keydown`
  suivant refonctionne normalement.
- **Touche mappée avec `ctrlKey`, `metaKey` ou `altKey`** : aucune commande
  active, aucun front montant, **aucun `preventDefault`**. Un `keydown` de la
  même touche sans modificateur, juste après, fonctionne normalement.
- **`keyup` avec modificateur** : traité normalement (il libère la commande), et
  c'est écrit dans le code pour que personne n'« harmonise » les deux
  écouteurs.

## Tests attendus

- Aller-retour `versEcran` / `versMonde` à zoom 1, 2 et 4.
- Un point au centre de la caméra tombe au centre de la vue.
- `versEcranPixel` rend des entiers, et reste stable sur deux positions monde
  très proches.
- `avecZoom(cam, 2.5)`, `avecZoom(cam, 0)`, `avecZoom(cam, -1)` : erreur. Idem
  `creeCamera` sur les mêmes zooms, et sur une vue nulle ou non finie.
- `avecCentre` et `avecZoom` ne mutent pas la caméra d'origine.
- `borne` : vue collée au bord gauche quand la caméra sort à gauche ; vue centrée
  quand le monde est plus étroit que la vue.
- `suit` : convergence monotone, jamais de dépassement, immobile à `dt = 0`, et
  résultat identique pour un pas de 0,1 s et dix pas de 0,01 s.
- `bornesVisibles` au zoom 4 couvre le quart de l'étendue du zoom 1.
- `estVisible` : vrai au centre, faux largement dehors, vrai juste au bord avec
  une marge.
- `blur` avec deux touches enfoncées : plus aucune commande active ensuite.
- **`Ctrl+R` ne produit aucune commande** : `keydown` sur `KeyR` avec
  `ctrlKey: true` → `poll()` ne rend ni `isActive` ni `justPressed` sur la
  commande, et `preventDefault` n'a pas été appelé. Idem `metaKey` (`Cmd+R`) et
  `altKey`.
- Les 4 tests d'origine de `KeyboardInput.test.ts` passent, non modifiés.
  Les tests `blur` et modificateurs sont écrits **dans ce même fichier**, en
  deux `describe` neufs ajoutés en fin de fichier (10 tests, total 14). La fiche
  exigeait ces tests sans donner de fichier pour les accueillir : c'est cette
  contradiction qui est levée, et `KeyboardInput.test.ts` est désormais dans
  l'en-tête `fichiers:`. `git diff` sur ce fichier ne montre aucune suppression.

## Fini quand

- [x] `Camera` est exportée, immuable, à zoom entier, testée
      (`Camera.test.ts` : 29 tests), et construite par la fabrique validée
      `creeCamera`.
- [x] Les cinq primitives sont ajoutées au `Renderer` sans toucher aux
      existantes, et il n'existe **aucun** `ctx.scale` lié à la caméra. Elles ne
      sont couvertes par **aucun** test (voir le § Gardes) : `Renderer` n'a pas
      de fichier de test dans le dépôt.
- [x] Le clavier ne reste plus enfoncé après une perte de focus.
- [x] `Ctrl+R` et `Cmd+R` rechargent la page et ne déclenchent aucune commande
      du jeu.
- [x] Les 33 tests du moteur passent toujours (le moteur en compte 116 à la fin
      de ce run : 33 d'origine, plus Rng 20, heightfield 24, Camera 29,
      KeyboardInput +10).
- [x] La commande de vérification du README du plan passe au vert.
