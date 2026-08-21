---
id: T4
titre: Caméra, primitives de dessin et robustesse du clavier
fichiers: packages/engine/src/render/Camera.ts, packages/engine/src/render/Camera.test.ts, packages/engine/src/render/Renderer.ts, packages/engine/src/input/KeyboardInput.ts, packages/engine/src/index.ts
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
- `KeyboardInput.test.ts` : 4 tests **intouchables**.

## À faire

1. Créer `packages/engine/src/render/Camera.ts`.
   - `Camera` **immuable** : `readonly centre: Vector2`,
     `readonly zoom: number` (**entier ≥ 1**),
     `readonly vue: { largeur: number; hauteur: number }` (taille de la surface de
     rendu, en pixels).
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
   - `strokeRect(at: Vector2, largeur, hauteur, opts?: StrokeFill)` ;
   - `drawPolyline(points, opts?)` — chemin **ouvert** : le terrain n'est pas un
     polygone fermé ;
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
5. Ajouter les exports dans `packages/engine/src/index.ts`.
6. Ne **rien** changer aux méthodes existantes du `Renderer` : les ajouts sont
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
- `withClip` restaure le contexte même si `fn` lève.
- Coordonnées non finies : un `NaN` dans un `Vector2` ne doit pas se propager
  silencieusement en dessin vide ; au minimum, le documenter.
- `blur` : après l'événement, aucune commande n'est active, et un `keydown`
  suivant refonctionne normalement.

## Tests attendus

- Aller-retour `versEcran` / `versMonde` à zoom 1, 2 et 4.
- Un point au centre de la caméra tombe au centre de la vue.
- `versEcranPixel` rend des entiers, et reste stable sur deux positions monde
  très proches.
- `avecZoom(cam, 2.5)`, `avecZoom(cam, 0)`, `avecZoom(cam, -1)` : erreur.
- `avecCentre` et `avecZoom` ne mutent pas la caméra d'origine.
- `borne` : vue collée au bord gauche quand la caméra sort à gauche ; vue centrée
  quand le monde est plus étroit que la vue.
- `suit` : convergence monotone, jamais de dépassement, immobile à `dt = 0`, et
  résultat identique pour un pas de 0,1 s et dix pas de 0,01 s.
- `bornesVisibles` au zoom 4 couvre le quart de l'étendue du zoom 1.
- `estVisible` : vrai au centre, faux largement dehors, vrai juste au bord avec
  une marge.
- `blur` avec deux touches enfoncées : plus aucune commande active ensuite.
- Les 4 tests d'origine de `KeyboardInput.test.ts` passent, non modifiés.

## Fini quand

- [ ] `Camera` est exportée, immuable, à zoom entier, testée.
- [ ] Les cinq primitives sont ajoutées au `Renderer` sans toucher aux
      existantes, et il n'existe **aucun** `ctx.scale` lié à la caméra.
- [ ] Le clavier ne reste plus enfoncé après une perte de focus.
- [ ] Les 33 tests du moteur passent toujours.
- [ ] La commande de vérification du README du plan passe au vert.
