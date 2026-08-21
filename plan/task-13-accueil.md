---
id: T13
titre: Écran d'accueil — fond animé, choix du niveau, accès au hall of fame
fichiers: packages/game/src/screens/home.ts, packages/game/src/render/background.ts, packages/game/src/render/background.test.ts, packages/game/src/design/ui.css, packages/game/src/constants.ts
sensible: false
---

# T13 — Écran d'accueil

## Objectif

Faire l'écran qui ouvre le jeu : la Terre dans le ciel étoilé, le sol lunaire, un
drapeau qui ondule, et par-dessus, en HTML, le choix du niveau et l'accès au
hall of fame.

## Ce qui existe

- `packages/game/index.html` porte trois couches : `#fond`, `#game`, `#ui` (T5).
- `GestionnaireEcrans` et l'interface `Ecran` (T5).
- `design/palette.ts`, `design/palette.css`, `design/font.ts`,
  `docs/design-system.md` (T1).
- `render/stars.ts` (champ d'étoiles) et `render/draw.ts` (drapeau qui ondule sur
  4 images, relief) de T10 : à réutiliser, **pas à réécrire**.
- `KeyboardInput` avec les commandes `tilt-left` / `tilt-right` /
  `throttle-up` / `throttle-down` / `confirm` / `back`.

## À faire

1. Ajouter dans `constants.ts` :
   - `TERRE = { rayon: 26, centre: { x: 250, y: 44 } }` (pixels du canvas 320 × 180) ;
   - `TERRE_ROTATION = 0.05` (tour par seconde, dérive lente des continents) ;
   - `DRAPEAU_PERIODE = 0.6` (s pour les 4 images de l'ondulation).
2. Créer `packages/game/src/render/background.ts` : le fond animé, dessiné sur
   `#fond`, réutilisé par l'accueil **et** le hall of fame.
   - `dessineFond(r, temps, etoiles)` : ciel en bandes de palette, étoiles, la
     **Terre** (disque `terreOcean`, taches de continents `terreSol`, croissant
     d'atmosphère `terreCiel`, terminateur en `nuit`, continents qui dérivent
     lentement selon `temps`), une **crête de sol lunaire** au premier plan en
     `reliefMoyen` / `reliefSombre`, et le **drapeau qui ondule** planté dessus.
   - La Terre et le sol sont dessinés à partir de formules déterministes, sans
     tirage à chaque frame.
3. Créer `packages/game/src/design/ui.css` : le style commun aux écrans DOM —
   police `ui-monospace, "Courier New", monospace`, graisse 700, tailles
   8 / 16 / 24 / 32 px, couleurs prises dans les variables de `palette.css`,
   cadres à bord net d'un pixel, aucune ombre, aucun arrondi, aucun dégradé.
4. Créer `packages/game/src/screens/home.ts` : l'écran d'accueil.
   - `entre()` : injecte dans `#ui` le titre `LEM`, la ligne de sélection des
     trois niveaux (`FACILE` / `MOYEN` / `DIFFICILE`), l'invite
     `ENTREE — DECOLLER`, l'entrée `H — HALL OF FAME`, et le rappel des
     contrôles.
   - Navigation : ← / → changent le niveau sélectionné, Entrée lance la partie,
     `KeyH` ouvre le hall of fame. La touche `KeyH` est ajoutée à
     `input/mapping.ts` sur une nouvelle commande `hof`.
   - L'écran lit le **snapshot fourni par le gestionnaire** (T5), il n'appelle
     jamais `poll()` lui-même et ne pose pas ses propres écouteurs clavier.
   - Le niveau sélectionné est **retenu entre deux parties** (dernier choix
     mémorisé en mémoire, pas en stockage).
   - `tick(dt)` fait avancer le temps du fond ; `rend()` appelle `dessineFond`.
   - `sort()` vide `#ui` et retire tous les écouteurs.

## Gardes et cas limites

- **`sort()` ne laisse rien** : `#ui` vide, aucun écouteur clavier résiduel. Un
  écouteur oublié fait réagir l'accueil pendant la partie. Test dédié.
- **Sélection bornée** : ← sur `FACILE` reste sur `FACILE`, → sur `DIFFICILE`
  reste sur `DIFFICILE` (pas de rebouclage, qui ferait passer du plus dur au plus
  facile par erreur).
- **Entrée maintenue** depuis l'écran précédent : la transition ne doit pas
  enchaîner deux écrans d'un seul appui. Passer par le front montant.
- **Fond animé indépendant du framerate** : l'ondulation du drapeau et la dérive
  des continents suivent le temps écoulé, pas le nombre de frames.
- **Aucun tirage aléatoire à chaque frame** dans le fond : les étoiles sont
  générées une fois à l'entrée de l'écran, avec une graine fixe pour que
  l'accueil ait toujours le même ciel.
- **Palette et tokens seulement** : aucune couleur littérale, ni dans le canvas
  ni dans le CSS.
- Fenêtre étroite : le bloc DOM reste dans la boîte de la scène, sans barre de
  défilement.

## Tests attendus

- La sélection du niveau est bornée aux deux extrémités.
- Le niveau choisi est celui passé à l'écran de jeu à la transition.
- Après `sort()`, `#ui` est vide et un appui sur ← ne change plus rien.
- Le drapeau rend l'image 0 à `t = 0`, l'image 1 à `t = 0.15`, et reboucle à
  `t = 0.6` (avec `DRAPEAU_PERIODE = 0.6`).
- La position des continents à `t` et à `t + 20` diffère, et est déterministe.
- Étoiles du fond : identiques d'une ouverture d'accueil à l'autre.
- Aucune couleur littérale dans `background.ts` ni dans `ui.css` (hors
  déclaration des variables).

## Fini quand

- [ ] `yarn dev` ouvre l'accueil : Terre, ciel étoilé, sol lunaire, drapeau qui
      ondule, titre et sélection de niveau en DOM sur le même style pixel.
- [ ] ← / → changent le niveau, Entrée lance la partie, `H` ouvre le hall of
      fame.
- [ ] Le retour à l'accueil après une partie ne laisse aucun résidu de l'écran
      précédent.
- [ ] La commande de vérification du README du plan passe au vert.
