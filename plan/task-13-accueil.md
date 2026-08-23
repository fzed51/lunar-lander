---
id: T13
titre: Écran d'accueil — fond animé, choix du niveau, accès au hall of fame
fichiers: packages/game/src/screens/home.ts, packages/game/src/screens/home.test.ts, packages/game/src/render/background.ts, packages/game/src/render/background.test.ts, packages/game/src/render/draw.ts, packages/game/src/design/ui.css, packages/game/src/constants.ts, packages/game/src/main.ts, packages/game/src/style.css, packages/game/src/input/mapping.ts, packages/game/src/types.ts
sensible: false
---

# T13 — Écran d'accueil

## Objectif

Faire l'écran qui ouvre le jeu : la Terre dans le ciel étoilé, le sol lunaire, un
drapeau qui ondule, et par-dessus, en HTML, le choix du niveau et l'accès au
hall of fame.

## Ce qui existe

- `packages/game/index.html` porte trois couches : `#fond`, `#game`, `#ui` (T5).
  Les deux canvas déclarent `width="320" height="180"` ; `#fond` n'est encore
  piloté par **aucun** code — c'est cette tâche qui lui donne un `Renderer`.
- `packages/game/src/main.ts` est le **seul** fichier qui appelle `creeSurface`
  et enregistre les écrans. Aujourd'hui il ne crée de surface que pour `#game` ;
  **c'est cette tâche qui crée la seconde surface sur `#fond`**
  (`creeSurface(exige("#fond"))`) et qui retire le bouchon `"accueil"` du
  registre pour enregistrer `creeEcranAccueil({ renderer: fond.renderer })` à
  sa place. Sans cette modification, `screens/home.ts` n'est jamais instancié et
  `yarn dev` continue d'afficher le bouchon DOM.
- `packages/game/src/style.css` porte déjà la typographie DOM du design system
  sur la règle `#ui` (`ui-monospace`, graisse 700, `letter-spacing: 1px`, tailles
  multiples de 8 px), et le dimensionnement des trois couches par la variable
  `--lem-echelle` que `creeSurface` écrit sur `<html>` (T5). Il n'y a **pas** de
  variables CSS de typographie : les tailles se posent règle par règle.
- `GestionnaireEcrans` et l'interface `Ecran` (T5). Le gestionnaire expose aussi
  `nomCourant` et accepte une source de commandes injectable, réservée aux tests.
- `design/palette.ts`, `design/palette.css`, `design/font.ts`,
  `docs/design-system.md` (T1).
- `render/stars.ts` (champ d'étoiles) et `render/draw.ts` (drapeau qui ondule sur
  4 images, relief) de T10 : à réutiliser, **pas à réécrire**.
- `KeyboardInput` avec les commandes `tilt-left` / `tilt-right` /
  `throttle-up` / `throttle-down` / `confirm` / `back`.

## À faire

1. Ajouter dans `constants.ts` :
   - `TERRE = { rayon: 26, centre: { x: 250, y: 44 } }` (pixels du canvas 320 × 180) ;
   - `TERRE_ROTATION = 0.005` (tour par seconde, dérive lente des continents —
     une rotation complète en 200 s). **Piège à éviter** : à 0,05 tour/s, la
     période vaut exactement 20 s, or le test attendu compare la position à
     `t` et à `t + 20` — l'écart d'angle vaudrait alors exactement un tour et
     les deux instants rendraient les mêmes pixels, ce qui ferait échouer le
     test par construction (et ferait de « rotation » un tour toutes les 20 s,
     soit 3 tr/min, pas une dérive lente). Règle à garder en tête pour tout
     futur réglage : le pas de temps du test ne doit jamais être un multiple de
     `1 / TERRE_ROTATION` ;
   - `DRAPEAU_PERIODE = 0.6` (s pour les 4 images de l'ondulation).
2. **`#fond` est sous `#game` dans le DOM**, et `#game` a `background:
   transparent` (`style.css`) : rien n'efface aujourd'hui la couche de jeu
   quand on la quitte. Le fond animé de cette tâche serait donc invisible dès
   la deuxième visite à l'accueil, masqué par la dernière image peinte sur
   `#game` (la dernière frame de la partie, ou le `clear(PALETTE.espace)`
   opaque des bouchons de `main.ts`). **C'est T10 (point 7 de sa fiche) qui
   ajoute la primitive `Renderer.efface()` et l'appelle au `sort()` de l'écran
   de jeu** : cette tâche n'a rien à coder pour ça, mais dépend de ce que T10
   soit fait avant, et doit le **vérifier** — sinon le fond animé livré ici
   reste invisible en pratique dès qu'on revient de l'écran de jeu. Contrôle à
   l'œil obligatoire : un cycle accueil → jeu → accueil ne laisse aucun résidu
   de l'écran de jeu sur `#game`.
   **Cette tâche corrige aussi le `rend()` des bouchons `fin` et `hof` dans
   `main.ts`** (`bouchonDom`) : ils peignaient `#game` en `clear(PALETTE.espace)`
   opaque, ce qui aurait masqué le fond animé pendant tout le passage par ces
   deux écrans. Remplacé par `surface.renderer.efface()`, comme l'écran de jeu,
   et l'import de `PALETTE` retiré de `main.ts` quand il devient inutile.
3. Créer `packages/game/src/render/background.ts` : le fond animé, dessiné sur
   `#fond`, réutilisé par l'accueil **et** le hall of fame.
   - `dessineFond(r, temps, etoiles)` : ciel en bandes de palette, étoiles, la
     **Terre** (disque `terreOcean`, taches de continents `terreSol`, croissant
     d'atmosphère `terreCiel`, terminateur en `nuit`, continents qui dérivent
     lentement selon `temps`), une **crête de sol lunaire** au premier plan en
     `reliefMoyen` / `reliefSombre`, et le **drapeau qui ondule** planté dessus.
   - La Terre et le sol sont dessinés à partir de formules déterministes, sans
     tirage à chaque frame.
   - **Étoiles sans caméra, pas `dessineEtoiles`** : le fond n'a pas de caméra
     et ne peut donc pas réutiliser `dessineEtoiles` (T10), qui applique la
     parallaxe d'une manche à un centre suivi. Le champ tiré par
     `genereEtoiles` (T10, `stars.ts`) est plutôt **remis à l'échelle** du
     canvas 320 × 180 à partir de `ETOILES_ETENDUE` (l'étendue du champ,
     exportée par `stars.ts`) : sur un écran sans caméra, un tirage direct sur
     les bornes du monde n'aurait mis à l'écran qu'une fraction des 90 étoiles,
     et un enroulement modulo aurait doublé la densité sur une moitié du ciel.
   - **Le drapeau réutilise `ONDULATION`, exportée de `render/draw.ts` (T10)**,
     sans réécrire la table des quatre poses — c'est la plus petite réutilisation
     possible du drapeau déjà dessiné pour la plateforme cible. En revanche il
     garde sa **propre cadence**, dérivée de `DRAPEAU_PERIODE` : la cadence du
     drapeau de la plateforme (`DRAPEAU_CADENCE = 8` dans `draw.ts`) ne peut pas
     être redérivée de `DRAPEAU_PERIODE` sans casser les tests T10 existants sur
     les quatre poses à 0 / 0,125 / 0,25 / 0,375 s. Les deux cadences sont
     documentées dans `constants.ts`, chacune pour son propre drapeau.
4. Créer `packages/game/src/design/ui.css` : le style commun aux écrans DOM —
   police `ui-monospace, "Courier New", monospace`, graisse 700, tailles
   8 / 16 / 24 / 32 px, couleurs prises dans les variables de `palette.css`,
   cadres à bord net d'un pixel, aucune ombre, aucun arrondi, aucun dégradé.
   **Chargement** : ajouter `@import "./design/ui.css";` dans
   `packages/game/src/style.css`, juste après `@import "./design/palette.css";`
   — même mécanisme, déjà éprouvé. **Ne pas** importer ce fichier depuis un
   `.ts` (`import "../design/ui.css"` depuis `home.ts`) : `tsconfig.base.json`
   n'a ni `noUncheckedSideEffectImports` désactivé, ni type `vite/client`, ni
   `.d.ts` de CSS, et cet import échoue au `typecheck` avec `TS2307 Cannot find
   module './ui.css'`. Sans le chargement par `style.css`, `ui.css` est un
   fichier mort : l'accueil hérite de la seule règle `#ui` déjà posée
   (typographie monospace) et aucune des règles ajoutées ici, en T15 ou en T16
   ne s'applique jamais.
5. Créer `packages/game/src/screens/home.ts` : l'écran d'accueil.
   - `entre()` : injecte dans `#ui` le titre `LEM`, la ligne de sélection des
     trois niveaux (`FACILE` / `MOYEN` / `DIFFICILE`), l'invite
     `ENTREE — DECOLLER`, l'entrée `H — HALL OF FAME`, et le rappel des
     contrôles.
   - Navigation : ← / → changent le niveau sélectionné, Entrée lance la partie,
     `KeyH` ouvre le hall of fame. La touche `KeyH` est ajoutée à
     `input/mapping.ts` sur une nouvelle commande `hof` — et la variante `hof`
     doit être ajoutée à l'union `Command` dans `types.ts` (pas
     `screens/types.ts`) : `KEY_MAP` est typé `Record<string, Command>`, la
     commande n'existe donc pas tant que sa variante n'est pas dans l'union.
   - L'écran lit le **snapshot fourni par le gestionnaire** (T5), il n'appelle
     jamais `poll()` lui-même et ne pose pas ses propres écouteurs clavier.
   - Le niveau sélectionné est **retenu entre deux parties** (dernier choix
     mémorisé en mémoire, pas en stockage). En revanche la **demande de
     transition ne survit pas** : elle est consommée par le gestionnaire
     (`prendTransition`, T5) et `sort()` la remet à `null`. Sans ça, l'accueil
     réactivé après une partie relancerait aussitôt une partie sans qu'on
     appuie sur quoi que ce soit.
   - Entrée note `{ nom: "jeu", params: { niveau, graine: Date.now() } }` : c'est
     **ici, et nulle part ailleurs**, que l'unique graine extérieure d'une partie
     est tirée (contrainte « aucun `Math.random` dans la logique de jeu »).
   - `tick(dt)` fait avancer le temps du fond ; `rend()` appelle `dessineFond`.
   - `sort()` vide `#ui` et retire tous les écouteurs.
6. Dans `main.ts` : créer la surface de `#fond` (`creeSurface(exige("#fond"))`),
   retirer le bouchon `"accueil"` du registre et enregistrer
   `creeEcranAccueil({ renderer: fond.renderer })` à sa place. C'est ce qui rend
   l'écran réellement joignable depuis `yarn dev` — voir « Ce qui existe ».

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
- Le niveau choisi est celui passé à l'écran de jeu à la transition, et la
  transition porte bien une `graine`.
- Après consommation de la transition, réactiver l'accueil et ticker sans appui
  ne relance **aucune** partie.
- Après `sort()`, `#ui` est vide et un appui sur ← ne change plus rien.
- Le drapeau rend l'image 0 à `t = 0`, l'image 1 à `t = 0.15`, et reboucle à
  `t = 0.6` (avec `DRAPEAU_PERIODE = 0.6`).
- La position des continents à `t` et à `t + 20` diffère, et est déterministe.
- Étoiles du fond : identiques d'une ouverture d'accueil à l'autre.
- Aucune couleur littérale dans `background.ts` ni dans `ui.css` (hors
  déclaration des variables).

## Fini quand

- [ ] `yarn dev` ouvre l'accueil : Terre, ciel étoilé, sol lunaire, drapeau qui
      ondule, titre et sélection de niveau en DOM sur le même style pixel —
      preuve à l'œil que `ui.css` est bien chargé (cadres nets, tailles
      8/16/24/32, tokens de couleur), pas seulement la typographie de base.
      **Non vérifiée à l'œil dans cet environnement** (pas de navigateur) :
      remplacée par un rendu hors écran du fond en ASCII à `t = 0` et `t = 60`
      (test temporaire, retiré depuis) — Terre, dérive des continents,
      croissant, terminateur, crête de sol, mât et toile tous conformes — et
      par la vérification que `ui.css` atterrit bien dans `dist/assets/*.css`
      au `yarn build`. Reste à cocher par un humain.
- [x] ← / → changent le niveau, Entrée lance la partie, `H` ouvre le hall of
      fame.
- [x] Le retour à l'accueil après une partie ne laisse aucun résidu de l'écran
      précédent.
- [x] La commande de vérification du README du plan passe au vert.
