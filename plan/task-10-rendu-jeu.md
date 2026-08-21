---
id: T10
titre: Rendu de l'écran de jeu — relief, LEM, flamme, drapeau, étoiles, zoom entier
fichiers: packages/game/src/render/draw.ts, packages/game/src/render/draw.test.ts, packages/game/src/render/stars.ts, packages/game/src/screens/game.ts, packages/game/src/constants.ts
sensible: false
---

# T10 — Rendu de l'écran de jeu

## Objectif

Dessiner la manche à l'écran, en pixel art sur la palette, avec la caméra qui
suit le LEM et un zoom **entier** qui se resserre à l'approche du sol.

## Ce qui existe

- `design/palette.ts` (`PALETTE`, `CouleurLem`) et `design/font.ts`
  (`dessineTexte`) (T1). `dessineTexte` prend un `CibleDessin` — une interface
  structurelle réduite à `fillRect` — et non un `Renderer` ; le `Renderer` la
  satisfait, on lui passe donc `surface.renderer` directement.
- `@lem/engine` : `Camera` (`creeCamera`, la fabrique **validée** à passer plutôt
  qu'un objet littéral, `versEcran`, `versEcranPixel`, `avecCentre`, `avecZoom`
  qui **refuse** un zoom non entier, `borne`, `suit`, `bornesVisibles`,
  `estVisible`) et les primitives `drawPixel`, `fillRect`, `strokeRect`,
  `drawPolyline`, `withClip`, plus l'existant `withTransform` / `withAlpha`
  (T4). Il n'y a **pas** de `withCamera` : le contexte canvas reste à
  l'échelle 1.
- `render/surface.ts` et la machine à écrans avec son snapshot d'entrée unique
  (T5).
- `terrain.ts` (T6), `Lander` (T7), `landing.ts` (T8), `state.ts` avec les statuts
  `vol / pause / pose / crash / fini` (T9).
- Asteroids avait un `render/draw.ts` qui aiguillait par `kind` ; il a été
  supprimé. Le patron d'aiguillage est à reprendre, le contenu est neuf.

## À faire

1. Ajouter dans `constants.ts` :
   - `ZOOMS = [1, 2, 4]` (valeurs entières autorisées) ;
   - `SEUILS_ZOOM = { vers2: 40, retour1: 60, vers4: 16, retour2: 24 }` (m
     d'altitude au-dessus du sol). Chaque seuil d'entrée est **borné par la
     demi-hauteur de vue du zoom visé** : la caméra est centrée sur le LEM et la
     vue fait `PIXEL.height` = 180 px, donc on voit 90 m sous le LEM au zoom 1,
     45 m au zoom 2 et 22,5 m au zoom 4. D'où `vers2 <= PIXEL.height / 4` (45) et
     `vers4 <= PIXEL.height / 8` (22,5). Avec les anciennes valeurs (60 / 80 et
     25 / 35), le passage au zoom 2 à 60 m d'altitude poussait le sol 15 m sous
     le bord bas de l'écran, et le passage au zoom 4 à 25 m le poussait 2,5 m
     dessous : le joueur perdait le sol de vue à l'instant même où le zoom est
     censé l'aider à juger le contact, et l'hystérésis de retour l'y maintenait.
     Le bornage de la caméra ne rattrapait le coup que pour un terrain proche du
     bas du monde ;
   - `CAMERA_REACTIVITE = 6` (1/s) ;
   - `ETOILES_NOMBRE = 90`, `ETOILES_PARALLAXE = 0.25`.
2. Créer `packages/game/src/render/stars.ts` : champ d'étoiles **fixe**, généré
   une fois par manche depuis le `rng` de la manche (position et une des trois
   teintes `blanc` / `grisPale` / `grisClair`), dessiné en **parallaxe**
   (déplacement réduit par `ETOILES_PARALLAXE`).
3. Créer `packages/game/src/render/draw.ts`. Chaque fonction reçoit le `Renderer`
   et des données déjà calculées — **aucune règle de jeu ici**.
   - `zoomSuivant(altitude: number, zoomCourant: number): number` — machine à
     **hystérésis** : passe à 2 sous `vers2`, revient à 1 au-dessus de `retour1`,
     passe à 4 sous `vers4`, revient à 2 au-dessus de `retour2`. Le zoom ne prend
     jamais de valeur intermédiaire. Une interpolation continue placerait les
     bords des formes entre deux colonnes de la grille et ruinerait le pixel art
     pendant toute la descente — c'est le piège de cette tâche.
   - `dessineCiel(r)` — **bandes** de palette (`espace`, `nuit`), aucun dégradé
     continu.
   - `dessineEtoiles(r, etoiles, cam)`.
   - `dessineTerrain(r, terrain, cam)` — la surface en `drawPolyline` couleur
     `grisClair`, le corps rempli en `reliefMoyen`, un liseré `reliefSombre` sous
     la crête. Ne parcourir que la tranche donnée par `bornesVisibles`, plus un
     échantillon de marge de chaque côté.
   - `dessineDrapeau(r, cible, cam, temps)` — mât et toile qui ondule sur
     4 images, couleur `alerte`, liseré de plateforme en `accent`.
   - `dessineReplis(r, replis, cam)` — liseré discret en `reliefClair` sur les
     plateaux de repli, pour qu'ils se voient sans crier plus fort que la cible.
   - `dessineLem(r, lem, cam)` — corps, train à deux pieds, tuyère, tourné de
     l'assiette.
   - `dessineFlamme(r, lem, cam, temps)` — longueur proportionnelle au cran, cœur
     `flammeClaire`, halo `flammeChaude`, tremblement d'un pixel **dérivé du
     temps** (par exemple `Math.sin(temps * 37)`), jamais d'un générateur
     aléatoire. Passer le `rng` de la manche au rendu ferait dépendre la suite
     des tirages du nombre d'images affichées : les particules et le terrain
     cesseraient d'être reproductibles à graine égale, et toute la contrainte
     « aucun `Math.random` » deviendrait décorative.
   - `dessineIndicateurCible(r, cible, cam)` — flèche au bord de l'écran quand la
     cible est hors champ.
   - `dessinePause(r)` — voile sombre plus `PAUSE`, `ENTREE REPRENDRE`,
     `ECHAP ABANDONNER`.
4. **Règle de dessin** : toute position monde passe par `versEcranPixel`, et
   toute taille est multipliée par le zoom entier. Aucune coordonnée
   fractionnaire n'atteint le canvas.
5. Créer `packages/game/src/screens/game.ts`, qui implémente `Ecran` (T5).
   - `entre(t)` : sur la variante `{ nom: "jeu"; params: { niveau, graine } }`
     de `Transition` (T5), démarre une partie via `nouvellePartie(niveau,
     graine)` (T9). Le niveau et la graine viennent **tous les deux** de la
     transition : rien n'est tiré ici.
   - `tick(dt, input)` : un `Scene.tick` alimenté par l'adaptateur d'entrée
     partagé du gestionnaire, puis mise à jour de la caméra — `suit` vers le LEM,
     `avecZoom(zoomSuivant(altitude, zoomCourant))`, `borne` sur le monde. En
     `pause`, ni `Scene.tick` ni caméra.
   - `rend()` : ciel, étoiles, terrain, replis, drapeau, particules, LEM, flamme,
     HUD (T11), puis le voile de pause s'il y a lieu.
   - Note **une seule fois** la transition `{ nom: "fin", params: résultat de la
     partie }` quand `statut === "fini"` ; c'est le gestionnaire qui la consomme
     par `prendTransition()` (T5). `sort()` remet la case d'attente à `null`,
     sinon un retour ultérieur sur l'écran de jeu rejouerait la demande.

## Gardes et cas limites

- **Aucune règle de jeu dans le rendu** : le dessin lit l'état, ne le calcule pas
  et ne le modifie pas. Aucun `dessine*` ne rend autre chose que `void`.
- **Aucun générateur aléatoire consommé au rendu**, ni celui de la manche ni un
  autre. Un test lit le source de `draw.ts` et échoue s'il y trouve `rng` ou
  `Math.random`.
- **Ordre de dessin** figé : ciel, étoiles, terrain, replis, drapeau, particules,
  LEM, flamme, HUD, pause. Un LEM dessiné avant le terrain disparaît derrière le
  relief.
- **Hystérésis** : un LEM qui flotte exactement à 40 m ne doit pas faire clignoter
  le zoom entre 1 et 2 d'une image à l'autre. C'est tout l'objet des seuils de
  retour à 60 et 24 m.
- **Le sol reste visible au moment du saut de zoom** : à l'altitude de bascule,
  la surface sous le LEM doit encore tomber dans la vue du zoom visé. Contrôle
  visuel obligatoire dans `yarn dev`, en plus de l'invariant chiffré de T17.
- **Tranche visible seulement** : parcourir le terrain entre les abscisses de
  `bornesVisibles`, avec un échantillon de marge, sinon la crête est coupée net
  au bord de l'écran.
- **Caméra bornée** : la vue ne sort jamais du monde ; au zoom 4 le monde visible
  se réduit et le bornage doit encore tenir.
- **Flamme** : rien à dessiner au cran 0, réservoir vide, ou statut différent de
  `"vol"`. Une flamme sur un LEM crashé est un mensonge visuel.
- **Palette** : aucune couleur littérale dans `draw.ts` ni `stars.ts`. Un test lit
  le source et échoue sur un `#` suivi de six chiffres hexadécimaux.
- **Étoiles** : générées une fois par manche, jamais dans la boucle de rendu —
  sinon elles scintillent au hasard à chaque image.
- Cible visible : l'indicateur ne s'affiche **pas**.

## Tests attendus

- `zoomSuivant` : 1 à 200 m depuis 1 ; 2 à 30 m depuis 1 ; **encore 2** à 50 m
  depuis 2 (hystérésis) ; 1 à 70 m depuis 2 ; 4 à 12 m depuis 2 ; **encore 4** à
  20 m depuis 4 ; 2 à 30 m depuis 4. Aucune sortie hors de `ZOOMS`.
- Génération des étoiles : déterministe à graine fixée, `ETOILES_NOMBRE` étoiles,
  toutes dans les bornes du monde, teintes prises dans la palette.
- Aucune couleur littérale, aucun `rng`, aucun `Math.random` dans `draw.ts` ni
  `stars.ts`.
- Tranche visible : sur 257 échantillons et une caméra centrée à 640 m au zoom 4,
  le nombre d'échantillons retenus est très inférieur à 257 et couvre la vue plus
  la marge.
- L'écran de jeu demande `"fin"` quand le statut passe à `fini`, et rien avant.
  Après un `prendTransition()`, un second appel rend `null` : la demande ne se
  rejoue pas.
- En `pause`, `tick` n'avance pas l'état du jeu.

## Fini quand

- [ ] `yarn dev` montre un terrain lunaire, un LEM qui tombe, une flamme qui suit
      le cran, un drapeau qui ondule, un ciel étoilé en parallaxe.
- [ ] La caméra suit le LEM et le zoom saute par crans entiers, sans clignoter au
      seuil.
- [ ] Aucune coordonnée fractionnaire n'atteint le canvas.
- [ ] Le rendu ne consomme aucun tirage aléatoire.
- [ ] La commande de vérification du README du plan passe au vert.
