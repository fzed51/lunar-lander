---
id: T10
titre: Rendu de l'écran de jeu — relief, LEM, flamme, drapeau, étoiles, zoom entier
fichiers: packages/game/src/render/draw.ts, packages/game/src/render/draw.test.ts, packages/game/src/render/stars.ts, packages/game/src/screens/game.ts, packages/game/src/screens/game.test.ts, packages/game/src/constants.ts
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
  `vol / pause / pose / crash / fini` (T9). `Globals`, `Statut`, `EtatPartie`,
  `nouvellePartie`, `nouvelleManche`, `ResultatPartie` et `resultatPartie` vivent
  dans `state.ts` ; `types.ts` les ré-exporte, les deux points d'import
  fonctionnent.
- `reducers.ts` (T9) expose `surPause`, `surReprise` et `surAbandon` : trois
  reducers purs **sans** règle de tick associée, volontairement laissés à
  l'appelant. C'est **cet écran** qui les applique.
- `rules.ts` (T9) expose `regleContact`, `regleTempsDeVol` et `regleEnchainement`
  — type commun `RegleManche` — et `reducers.ts` les cinq reducers de scène
  correspondants : `surContact`, `surHorsLimites`, `surTempsVol`,
  `surMancheSuivante`, `surParticuleMorte`. **La `Scene` de cet écran doit brancher
  les trois règles et les cinq reducers** : `temps-vol` et `manche-suivante` sont
  deux événements ajoutés en T9 parce qu'une `TickRule` émet sans écrire l'état.
  Sans leur reducer branché, le chrono ne tourne pas et la manche suivante ne
  démarre jamais.
- `Lander` porte un champ `inerte` (posé par le reducer du verdict) et
  court-circuite son `step` quand il est vrai : le LEM figé après un posé ou un
  crash ne bouge plus, même si la scène continue de ticker. Le rendu n'a rien à
  faire de ce champ, sauf à ne pas dessiner de flamme hors de `"vol"` (garde déjà
  écrite plus bas).
- `Transition` porte désormais `{ nom: "fin"; params: ResultatPartie }` (T9), et
  `main.ts` publie un `RESULTAT_BOUCHON` neutre depuis le bouchon « jeu » : c'est
  ce bouchon que cet écran remplace, avec un vrai `resultatPartie(etat)`.
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
   - `tick(dt, input)`, dans cet ordre :
     1. **la pause d'abord, à chaque image et y compris en pause** : sur
        `justPressed("back")` appliquer `surPause` si `statut === "vol"` et
        `surAbandon` si `statut === "pause"` ; sur `justPressed("confirm")`
        appliquer `surReprise`. Les reducers portent eux-mêmes leurs gardes de
        statut (T9) ;
     2. **si `statut !== "pause"`** : un `Scene.tick` alimenté par l'adaptateur
        d'entrée partagé du gestionnaire, puis mise à jour de la caméra — `suit`
        vers le LEM, `avecZoom(zoomSuivant(altitude, zoomCourant))`, `borne` sur
        le monde.
     Autrement dit : **en pause, l'écran n'appelle pas `Scene.tick` mais traite
     quand même la pause.** C'est le seul code du jeu qui lit le clavier en pause,
     et c'est pour ça que l'entrée **et** la sortie de pause vivent ici, du même
     côté de la frontière `Scene.tick`. Une règle de tick le ferait à l'intérieur
     de la scène : elle ne tournerait plus dès la pause posée, le voile
     n'obéirait plus à aucune touche et la partie serait perdue.
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
  autre. **Attention, tranché en T6 et T9 : un test ne peut pas lire le source.**
  `packages/game` n'embarque pas `@types/node`, donc
  `import { readFileSync } from "node:fs"` échoue au `typecheck` (`TS2307`), et
  ajouter la dépendance sort du périmètre (« pas d'outillage qui dépende de la
  version de Node installée »). La garde se prouve **fonctionnellement** :
  remplacer `Math.random` par un piège qui lève et dessiner N images, et vérifier
  que deux rendus successifs du même état produisent les mêmes pixels. C'est ce
  qui a été fait pour `terrain.ts` (piège sur 100 générations) et pour la logique
  de manche (deux déroulés de 300 ticks identiques au bit près).
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
- **L'entrée et la sortie de pause sont du même côté de la frontière** : les
  trois reducers de pause sont appliqués par cet écran, jamais par une
  `TickRule`. Corollaire : la pause n'est **pas** un simple « on saute le tick »,
  c'est « on saute le tick **et** on continue de lire l'entrée ».
- **La pause gèle la physique parce que la scène ne tourne pas** : `Scene.tick`
  déplace toutes les entités avant d'évaluer les règles et `step` ne voit pas les
  globals, donc aucune règle ni aucun reducer ne peut geler le monde. La
  responsabilité est ici, et le test qui la prouve aussi.
- **Flamme** : rien à dessiner au cran 0, réservoir vide, ou statut différent de
  `"vol"`. Une flamme sur un LEM crashé est un mensonge visuel.
- **Palette** : aucune couleur littérale dans `draw.ts` ni `stars.ts`. Le test ne
  peut **pas** lire le source (voir ci-dessus, pas de `@types/node`) : à défaut, il
  vérifie que toutes les couleurs posées sur le contexte canvas appartiennent à
  `PALETTE` — un faux contexte qui enregistre les `fillStyle` / `strokeStyle`
  reçus, puis comparaison à la palette. C'est plus fort qu'une recherche de `#`
  suivi de six chiffres hexadécimaux : une couleur en `rgb()` passait au travers.
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
  `stars.ts` — prouvé par le **comportement** (faux contexte qui collecte les
  couleurs, piège sur `Math.random`), pas par une lecture des sources : voir la
  garde correspondante.
- Tranche visible : sur 257 échantillons et une caméra centrée à 640 m au zoom 4,
  le nombre d'échantillons retenus est très inférieur à 257 et couvre la vue plus
  la marge.
- L'écran de jeu demande `"fin"` quand le statut passe à `fini`, et rien avant.
  Après un `prendTransition()`, un second appel rend `null` : la demande ne se
  rejoue pas.
- **La pause gèle la physique** : 100 appels de `ecran.tick(dt, snapshot)` en
  pause laissent la position, la vitesse et le `tempsDeVol` du LEM strictement
  inchangés — flèches tenues comprises. C'est le test que T9 ne pouvait pas
  écrire : au niveau de la scène, il n'aurait prouvé qu'une chose, qu'un état
  qu'on ne tick pas ne change pas.
- **La pause a une sortie** : depuis `"vol"`, un `justPressed("back")` passe en
  `"pause"` ; depuis `"pause"`, un `justPressed("confirm")` ramène `"vol"` et la
  physique repart ; depuis `"pause"`, un `justPressed("back")` met
  `statut === "fini"` et `abandonnee === true`. Ces trois-là échouent si la pause
  est traitée dans une règle de tick.
- **En pause, l'écran lit toujours l'entrée** : `tick` consulte le snapshot même
  quand `Scene.tick` est sauté.

## Fini quand

- [ ] `yarn dev` montre un terrain lunaire, un LEM qui tombe, une flamme qui suit
      le cran, un drapeau qui ondule, un ciel étoilé en parallaxe.
- [ ] La caméra suit le LEM et le zoom saute par crans entiers, sans clignoter au
      seuil.
- [ ] Aucune coordonnée fractionnaire n'atteint le canvas.
- [ ] Le rendu ne consomme aucun tirage aléatoire.
- [ ] La pause s'ouvre **et** se ferme : Entrée reprend, Échap abandonne, la
      physique est gelée pendant tout ce temps.
- [ ] La commande de vérification du README du plan passe au vert.
