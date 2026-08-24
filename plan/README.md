# Chantier — création du jeu LEM

## Contexte

Le dépôt vient d'être créé. Son premier commit (`8c32c9b`) est une **base
saine** : la structure et le moteur du projet voisin `../asteroids` ont été
reprises, le scope des paquets est passé à `@lem/*`, et **tout le code propre à
Asteroids a été retiré** — astéroïdes, balles, vaisseau, vagues, tir,
interactions, règles, sons, dessin du jeu.

Ce qui existe aujourd'hui :

- `packages/engine` — le moteur, **intact** : `GameLoop` (dt variable, limiteur
  60 Hz, clamp 1/30 s), `Scene` (`onPair` / `onTick` / `on` / `addEffect`),
  `GameState` immuable, `Vector2`, `KeyboardInput`, `collision`, `Renderer`
  (primitives canvas 2D). 33 tests.
- `packages/game` — un squelette : `types.ts` (commandes aux quatre flèches,
  union d'entités réduite à `Particle`), `constants.ts` (`PIXEL` 320 × 180,
  `MOON_GRAVITY` 1.62), `entities/Particle.ts` (immuable, fondu par âge, tirage
  injecté), `input/mapping.ts`, `main.ts` (monte le canvas pixel avec un
  agrandissement à facteur entier et affiche un titre). 4 tests.

Il n'y a **aucun jeu** : pas de LEM, pas de terrain, pas d'écran, pas de score,
pas de hall of fame. Ce chantier les crée.

Le **cahier des charges complet et arrêté** est dans
[`docs/cahier-des-charges.md`](../docs/cahier-des-charges.md). Il est la
référence : en cas de doute sur une règle de jeu, c'est lui qui tranche, pas ce
README.

## Cible

À la fin du chantier, `yarn dev` ouvre un jeu jouable où tout ce qui suit est
observable :

1. Un **écran d'accueil** en HTML sur fond animé en canvas : la Terre dans le
   ciel étoilé, le sol lunaire, un drapeau qui ondule. On y choisit son niveau de
   départ (facile / moyen / difficile) aux flèches et on entre dans le hall of
   fame.
2. Une **partie** de 3 vies qui enchaîne des manches. Chaque manche génère un
   terrain lunaire procédural de 1280 m de large : des secteurs doux, des
   secteurs accidentés avec pics et canyons, une plateforme plate portant le
   drapeau cible, un à quatre plateaux de repli (deux à quatre demandés et
   obtenus dans plus de 90 % des manches, un seul garanti par la géométrie —
   voir T6), et un point de départ situé à
   250–400 m de la cible avec une dérive initiale orientée vers elle.
3. Un **LEM** piloté aux quatre flèches : ← / → pour l'assiette, ↑ / ↓ pour la
   puissance moteur sur 6 crans mémorisés. Gravité 1,62 m/s², carburant compté,
   réservoir vide = chute libre. Échap met en pause et propose d'abandonner.
4. Une **caméra** qui suit le LEM, avec un zoom **entier** (×1, ×2, ×4) qui se
   resserre à l'approche du sol et ne clignote pas au seuil.
5. Un **HUD** chiffré : altitude au-dessus du sol, vitesse verticale, vitesse
   horizontale, distance à la cible, carburant, cran de puissance, vies, temps de
   vol, manche, difficulté. Les vitesses changent de couleur avant de sortir des
   seuils.
6. Un **verdict de contact** : posé si `|vy| ≤ 2 m/s`, `|vx| ≤ 1 m/s`,
   `|assiette| ≤ 10°` et dénivelé sous le train `≤ 1 m` ; sinon crash avec
   explosion en particules. Le fuselage collisionne aussi : on ne traverse pas une
   paroi de canyon parce que les pieds sont en l'air.
7. Un **score de type golf** : chaque manche réussie ajoute l'écart
   **horizontal** en mètres entre le **centre du LEM au contact** et le drapeau ;
   le total est la somme, le plus petit est le meilleur. Horizontal, et non
   euclidien : le centre du LEM est à 3,5 m au-dessus de la surface au contact,
   une distance euclidienne rendrait le posé parfait à 0 point impossible.
8. Une **fin de partie** qui, si la partie compte **au moins une manche réussie**
   et que son résultat entre dans les 100 meilleurs, demande un trigramme à la
   manière d'une borne d'arcade (↑ ↓ pour la lettre, ← → pour la position, Entrée
   pour valider). Une partie sans aucun posé n'entre **jamais** au classement,
   quel que soit son temps de vol.
9. Un **hall of fame** de 100 entrées en `localStorage`, trié par temps de vol
   total **arrondi à la seconde** décroissant, puis par total de points
   croissant, avec remise à zéro confirmée.

Le tout en **pixel art 320 × 180 agrandi d'un facteur entier**, sur une palette
de **16 couleurs** figée par un design system commun au canvas et au DOM.

## Contraintes

- **Le moteur ne s'occupe que de la partie jouée** et ne connaît aucun type du
  jeu : aucun import de `@lem/game` dans `@lem/engine`. Écrans, menus, hall of
  fame, persistance, design system et **tout le dessin** sont dans le jeu. Le
  moteur dit *quand* dessiner, il ne dessine jamais.
- **Un seul sondage du clavier par image, un seul propriétaire du clavier.**
  `Scene.tick` appelle `input.poll()` en interne et `KeyboardInput.poll()` vide le
  tampon des fronts montants : deux consommateurs dans la même image et le second
  ne voit plus rien. Le gestionnaire d'écrans possède l'unique `KeyboardInput`,
  fait le seul `poll()`, et la `Scene` reçoit un adaptateur qui relit ce
  snapshot. Aucun écran ne crée son propre `KeyboardInput`.
- **Une demande de transition d'écran est consommée, jamais relue.** Les écrans
  sont des instances enregistrées une fois et réactivées par nom : le
  gestionnaire les lit par `prendTransition()`, qui rend la demande **et** la
  remet à `null`, et `sort()` efface toute demande en attente. Une demande
  laissée en place est rejouée au passage suivant, et les quatre écrans défilent
  seuls. Le nom et sa charge utile voyagent dans **une seule union
  discriminée** `Transition`, pas dans un `nom: string` doublé d'un `params`
  optionnel.
- **Le rendu ne consomme aucun tirage aléatoire.** Les scintillements et
  tremblements sont dérivés de `state.time`. Passer un générateur au dessin ferait
  dépendre la suite des tirages du nombre d'images affichées, et le déterminisme
  du terrain et des particules tomberait.
- **Zoom entier et coordonnées entières.** Le zoom ne prend que les valeurs 1, 2
  et 4 ; toute position monde passe par `versEcranPixel` et toute taille est
  multipliée par le zoom. Aucun `ctx.scale` lié à la caméra, aucune coordonnée
  fractionnaire au canvas : c'est ce qui garde la grille de pixels intacte.
- **Le facteur d'agrandissement de la surface se compte en pixels d'écran, pas
  en pixels CSS.** `facteurEchelle` (T5) multiplie la mesure de fenêtre par
  `devicePixelRatio` : c'est l'écran qui affiche les carrés. Un facteur entier en
  pixels CSS donne un nombre fractionnaire de pixels d'écran dès que la densité
  l'est — ×3 à 1,5 dppx fait 4,5 — et `image-rendering: pixelated` duplique alors
  une colonne sur deux plus large que ses voisines. La taille de boîte rendue au
  CSS est donc, elle, possiblement fractionnaire : l'invariant tenu est que son
  produit par la densité soit entier.
- **État immuable** : chaque tick produit un nouveau `GameState`. Les entités ne
  se mutent pas. Les reducers sont purs et idempotents. Aucun état de simulation
  hors du `GameState` — y compris les accumulateurs (débit de particules).
- **Aucun `Math.random` dans la logique de jeu** : tout tirage passe par le
  générateur à graine du moteur. Seule la graine initiale d'une partie vient de
  l'extérieur.
- **TypeScript strict** tel que configuré dans `tsconfig.base.json` :
  `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`,
  `noFallthroughCasesInSwitch`. Pas de `any`, pas de `@ts-ignore`.
- **Français partout** : noms de fichiers en anglais comme aujourd'hui, mais
  commentaires, messages et documentation en français, avec les accents.
- **Aucun asset externe** : ni image, ni police, ni son. Tout est dessiné ou
  généré par le code. Pas de dépendance runtime ajoutée. Pas d'outillage qui
  dépende de la version de Node installée.
- **Aucun son en v1** (décision du cahier des charges).
- **Valeurs de réglage centralisées** dans `packages/game/src/constants.ts` —
  jamais de nombre magique disséminé dans les règles.
- Les tests existants (33 dans le moteur, 4 dans le jeu) sont **intouchables** :
  aucun ne doit être supprimé, désactivé ni affaibli. Après T1–T5 le dépôt en
  comptait 116 dans le moteur et 73 dans le jeu ; **après T6–T9, 116 dans le
  moteur et 224 dans le jeu**, les 37 d'origine inclus et non modifiés. T9 a
  adapté `screens/manager.test.ts` de façon **strictement mécanique** — une
  fabrique `versFin()` pour la charge utile de la variante `fin`, un type de
  globals local — sans toucher une assertion : ses 15 tests passent inchangés.
  **Après T10–T13, 121 dans le moteur et 439 dans le jeu. Après T14–T17
  (run D, dernier lot du plan), 121 dans le moteur (inchangé) et 568 dans le
  jeu**, aucun test antérieur supprimé, désactivé ni affaibli.
- **`packages/game` n'a pas `@types/node`** : un test ne peut donc pas lire le
  source d'un fichier (`import { readFileSync } from "node:fs"` échoue au
  `typecheck`), et ajouter la dépendance sortirait du périmètre. Les gardes du
  genre « aucun `Math.random` dans ce fichier », « aucune couleur littérale » se
  prouvent donc par le **comportement** : piège qui lève à la place de
  `Math.random`, faux contexte canvas qui collecte les couleurs posées. Vaut pour
  T6, T9 et surtout T10, dont la fiche prévoyait deux tests de lecture de source.

## Découpage

| Tâche | Fiche | Rôle | Dépend de |
|---|---|---|---|
| T1 | `task-1-design-system.md` | Palette 16 couleurs, police bitmap, tokens canvas + CSS depuis une source unique | — |
| T2 | `task-2-moteur-rng.md` | Générateur aléatoire à graine dans le moteur | — |
| T3 | `task-3-moteur-heightfield.md` | Outils de champ d'altitudes dans le moteur | — |
| T4 | `task-4-moteur-camera-renderer.md` | Caméra à zoom entier, primitives de dessin, clavier robuste au blur et aux raccourcis à modificateur | — |
| T5 | `task-5-surface-et-ecrans.md` | Surface pixel, sondage clavier unique, machine à écrans | T1, T4 |
| T6 | `task-6-terrain.md` | Relief procédural, secteurs accidentés, plateformes, point de départ | T2, T3 |
| T7 | `task-7-lem.md` | Entité LEM : assiette, 6 crans de poussée, carburant, physique | T6 |
| T8 | `task-8-atterrissage.md` | Contact de la coque, verdict posé / crash | T3, T6, T7 |
| T9 | `task-9-manche-score.md` | Manches, vies, pause, difficulté progressive, score golf | T2, T6, T7, T8 |
| T10 | `task-10-rendu-jeu.md` | Dessin de l'écran de jeu : relief, LEM, flamme, drapeau, étoiles, zoom entier | T1, T4, T5, T6, T7, T9 |
| T11 | `task-11-hud.md` | Tableau de bord chiffré avec seuils colorés | T1, T3, T9, T10 |
| T12 | `task-12-particules.md` | Particules rhabillées : explosion, poussière, gaz du moteur | T2, T9, T10 |
| T13 | `task-13-accueil.md` | Écran d'accueil DOM, fond animé, choix du niveau | T1, T5, T10 |
| T14 | `task-14-hof-logique.md` | Stockage et classement du hall of fame, sans écran | T9 |
| T15 | `task-15-fin-de-partie.md` | Récapitulatif et saisie du trigramme à l'arcade | T1, T5, T9, T14 |
| T16 | `task-16-hof-ecran.md` | Écran des 100 meilleures parties, remise à zéro | T1, T5, T13, T14, T15 |
| T17 | `task-17-equilibrage-doc.md` | Équilibrage des réglages et mise à jour de la documentation | tout |

L'ordre du tableau est l'ordre d'exécution : les tâches sont jouées en série.
**Exception constatée après coup** : `render/draw.ts` (T10) importe désormais
deux constantes de mise en page de `render/hud.ts` (T11) pour l'écrêtage de
l'indicateur de cible — un défaut trouvé après implémentation a inversé la
dépendance déclarée dans la colonne ci-dessus. Sans conséquence ici puisque les
deux tâches sont faites, mais à garder en tête pour toute relecture isolée de
T10.

**T1 à T9 sont faites.** Les fondations (T1–T5) : design system (palette générée,
police bitmap 5 × 7), `Rng` et `heightfield` dans le moteur, `Camera` et les cinq
primitives de dessin, `KeyboardInput` corrigé, surface pixel et machine à écrans
avec ses quatre bouchons. Le gameplay (T6–T9) : `terrain.ts` (relief procédural,
secteurs, plateforme cible, replis, départ), `entities/Lander.ts` (assiette, six
crans, carburant, gravité), `landing.ts` (coque, verdict, causes de crash),
`events.ts`, `state.ts` (partie, manche, `Globals`, `ResultatPartie`),
`difficulty.ts`, `score.ts`, `rules.ts` (trois règles de tick) et `reducers.ts`
(cinq reducers de scène, trois reducers de pause appliqués par l'écran).

**T10 à T13 sont faites** (run C, dessin uniquement). L'écran de jeu
(`screens/game.ts`) dessine relief, LEM, flamme, drapeau, étoiles en parallaxe et
zoom entier à hystérésis (`render/draw.ts`, `render/stars.ts`) ; le HUD chiffré à
seuils colorés (`render/hud.ts`) ; les particules d'explosion, de poussière et de
gaz moteur, portées par deux règles de tick de plus que prévu (`regleGaz` et
`regleParticules`, `entities/Particle.ts`) ; l'écran d'accueil avec son fond animé
(Terre, ciel, sol, drapeau — `render/background.ts`), le choix du niveau et
l'accès au hall of fame (`screens/home.ts`). `main.ts` enregistre désormais les
deux vrais écrans (`accueil`, `jeu`) ; `fin` et `hof` restent des bouchons DOM en
attente de T15/T16. `packages/engine/src/render/Renderer.ts` a gagné une
primitive `efface()` (`clearRect`), nécessaire pour que la couche de jeu ne
masque plus le fond animé de l'accueil au retour. Un défaut constaté après
implémentation a été corrigé : l'indicateur de cible, écrêté aux seuls bords de
l'écran, tombait au largage derrière les jauges du HUD ; il se peint maintenant
**après** le HUD et son écrêtage évite désormais les deux jauges (voir T10, T11).
121 tests dans le moteur, 439 dans le jeu.

Les fiches T1 à T13 ont été mises à jour avec les signatures et les valeurs
réellement retenues — les lire avant d'attaquer T14. Écarts du run B qui
touchent directement la suite : les tests ne peuvent pas lire les sources (voir
les contraintes), `Transition` porte `params: ResultatPartie` sur sa variante
`fin`, et `Lander` porte un champ `inerte` qui gèle son `step` après le verdict.
Écarts du run C à connaître avant T14–T17 : `EcranJeu` (retour de
`creeEcranJeu`) expose `etat()` et `camera()` en lecture seule, en plus du
contrat `Ecran` ; `Globals` porte maintenant `carburantInitial`,
`tiragesParticules` et `gazAccu` ; `types.ts` porte la commande `hof` ; `draw.ts`
(T10) et `hud.ts` (T11) sont mutuellement dépendants (l'indicateur de cible lit
les bandes du HUD pour son écrêtage) et `render/draw.ts` (T10) est aussi touché
par T13 (export d'`ONDULATION`, réutilisée par le drapeau du fond).

La logique du hall of fame (T14) passe **avant** les deux écrans qui l'utilisent
(T15, T16). C'est volontaire : faire les écrans d'abord obligerait à inventer une
injection de dépendance qui ne servirait qu'à contourner l'ordre des tâches.

**T14 à T17 sont faites (run D, ce dépôt clôt le plan).** Le hall of fame
(`hof.ts`, `storage.ts`) : cent entrées maximum, tri par temps de vol arrondi à
la seconde puis par points, troncature appliquée **à la lecture**
(`lisHof`) et pas seulement à l'écriture, `stockageDisponible()` mémorise son
repli mémoire pour que les deux écrans partagent la même instance. L'écran de
fin de partie (`screens/gameover.ts`, `trigramme.ts`) affiche le bilan sur
**deux lignes** (et non quatre, pour tenir sous les 180 px de la scène au
facteur d'agrandissement 1) et un titre `FIN DE PARTIE` / `ABANDON` ; la saisie
du trigramme y est bornée aux trois lettres `A`–`Z`. L'écran du hall of fame
(`screens/hof.ts`) montre neuf lignes défilantes sur le même fond animé que
l'accueil, avec remise à zéro à double appui sur `R` (au front montant,
`justPressed`, jamais `isActive`). `main.ts` a été rebranché : les bouchons DOM
`"fin"` et `"hof"` ont disparu, avec `bouchonDom` / `titreBouchon` /
`invitationBouchon` et les règles CSS `.bouchon*` qui ne stylaient plus rien.
La liste écrite par la validation du trigramme voyage dans la transition
(`Transition["hof"].params.liste`) plutôt que d'être relue par l'écran suivant
— une divergence entre écriture et relecture (quota, navigation privée)
pourrait sinon faire disparaître, sans le moindre message, la partie que le
joueur vient de valider. L'équilibrage (T17) n'a changé aucune valeur
numérique de `constants.ts` : `CARBURANT_PENTE = 18` était déjà en place
depuis le run B, et le calcul (`reglages.test.ts`, sept invariants) le
confirme à 17,6 % de marge au plafond de difficulté. `docs/cahier-des-charges.md`
et `docs/design-system.md` portent maintenant les valeurs retenues.
121 tests dans le moteur (inchangé), **568 dans le jeu**.

Écarts et signatures réelles du run D à connaître pour toute relecture : voir
les fiches `task-14-hof-logique.md` à `task-17-equilibrage-doc.md`, qui portent
chacune un encart « Rapport (run D) » ou « Signature réelle » aux endroits où
le code a divergé du texte d'origine — notamment `CandidatHof` (type structural
de `hof.ts`, pour ne pas faire dépendre le hall of fame de `state.ts`),
`etiquetteNiveau` exportée de `gameover.ts` et réutilisée par `hof.ts`,
`GRAINE_CIEL` déplacée de `screens/home.ts` vers `render/background.ts`, et
`OptionsEcranHof` qui porte un `Renderer` en plus de `hote` et `stockage`.

## Inconnues à lever

- [x] **Lisibilité de la police bitmap 5 × 7** dans le HUD à 320 × 180. ~~Levée
      en T1 en dessinant la table complète et en affichant une ligne de test ; si
      c'est illisible, passer à 4 × 6 condensé ou 6 × 8, et le dire dans le report
      de fin.~~ **Levée en T1 : la table 5 × 7 est conservée**, ni repli en 4 × 6
      condensé, ni passage en 6 × 8. Contrôle visuel fait sur
      `ALTITUDE 0000 M`, puis sur les bouchons de T5 (échelle 2 pour un titre,
      échelle 1 pour une invite). La confirmation définitive viendra du HUD
      complet en T11, mais rien n'oblige à changer de grille.
- [x] **Harmonie canvas / DOM sans police de fichier.** T1 tranche : police
      bitmap maison pour le canvas, `monospace` système à tailles multiples de
      8 px pour le DOM. Si l'écart visuel est trop fort, T13 peut rendre les
      titres DOM dans un petit canvas et le signaler.
      État après T5 : les deux typographies coexistent réellement à l'écran
      (bouchons DOM à 32 / 16 px sur `#ui`, bouchon `jeu` à la police bitmap sur
      `#game`) et la typographie DOM est posée sur la règle `#ui` de `style.css`
      — pas en variables CSS, faute de besoin. Rien de bloquant constaté.
      État après T13 : `design/ui.css` est écrit et **chargé** (`@import` dans
      `style.css`, vérifié présent dans `dist/assets/*.css` au build) — cadres
      nets d'un pixel, tailles 8/16/24/32, couleurs de tokens. L'accueil rend
      son titre et sa sélection de niveau sur ce style. **Contrôle à l'œil non
      fait** (pas de navigateur dans cet environnement d'implémentation) :
      remplacé par un rendu ASCII hors écran du fond animé, jugé conforme.
      L'arbitrage définitif reste à faire par un humain via `yarn dev`.
      État après T17 : la décision est **écrite** dans
      `docs/design-system.md` (§ Harmonie canvas / DOM : ce qui a été décidé)
      — un écran appartient à un seul système, même palette des deux côtés,
      mêmes interdits (majuscules, aplats, cadres d'un pixel), grille de 8 px
      commune — et les écrans de fin de partie et du hall of fame (T15, T16)
      suivent la même règle que l'accueil.
      **Levée après la PR du run D** : contrôle à l'œil fait par l'utilisateur
      via `yarn dev` sur les quatre écrans DOM, aucun problème signalé.
- [x] **Jouabilité des réglages chiffrés** (poussée max 4,0 m/s², consommation
      0,8 u/s par cran, réservoirs 140 / 122 / 104 u avec
      `CARBURANT_PENTE = 18`, dérive initiale 8 / 14 / 20 m/s). Posés pour être
      jouables, pas démontrés. T17 les réajuste et reporte les valeurs finales
      dans le cahier des charges.
      État après T9 : toutes ces valeurs sont dans `constants.ts` telles
      qu'annoncées, aucune n'a été retouchée à l'implémentation, et `Lander` comme
      `difficulty.ts` les respectent au chiffre près dans leurs tests. Mais rien
      n'est encore **joué** : il n'y a pas d'écran de jeu, donc pas une seconde de
      manette. L'inconnue reste entière.
      État après T10–T13 : l'écran de jeu, le HUD et l'accueil existent
      réellement et `yarn dev` ouvre un jeu manipulable au clavier. Mais aucune
      manette n'a encore été tenue dans **cet** environnement d'implémentation
      (pas de navigateur) : la jouabilité a été sondée uniquement par du calcul
      et des simulations chiffrées (voir les gardes de T10), jamais par une
      partie réellement jouée. L'inconnue reste entière, à lever en T17.
      État après T17 : aucune valeur n'a bougé (le calcul valide l'existant,
      voir ci-dessous), et aucune partie n'a été jouée manette en main dans cet
      environnement — remplacé par le calcul et par une mesure sur 800
      terrains générés.
      **Levée après la PR du run D** : partie jouée manette en main par
      l'utilisateur via `yarn dev`, aucun problème signalé.
- [x] **Plafond de difficulté à 2,4** : l'arbitrage retenu veut qu'il reste
      **franchissable**, donc que le carburant y suffise encore à annuler la
      dérive et à freiner la chute — sur le **pire** terrain (chute de
      `TERRAIN_Y_MAX - DEPART_Y = 280` m), pas sur le meilleur. Tranché dans le
      plan : on garde 2,4 et on passe `CARBURANT_PENTE` de 25 à 18, ce qui donne
      96,8 u au plafond contre ≈ 83 u de besoin (marge 17 %). T17 le vérifie par
      le calcul et par le jeu.
      État après T9 : `DIFFICULTE_MAX = 2.4` et `CARBURANT_PENTE = 18` sont dans
      `constants.ts`, et `difficulty.test.ts` chiffre le réservoir au plafond —
      `toBeCloseTo(96.8, 10)`, `140 - 18 * 2.4` valant `96.80000000000001` en
      flottant. Le calcul de besoin (≈ 83 u) n'est **pas** encore vérifié par un
      test, et la vérification « par le jeu » attend l'écran. Inconnue toujours
      ouverte.
      **Levée en T17** par le calcul : besoin réel au pire cas ≈ 82,3 u
      (freinage ≈ 50,6 u + dérive à 45° ≈ 31,7 u), réservoir 96,8 u, soit
      **17,6 % de marge**, tenu par un invariant de `reglages.test.ts` écrit
      avec les constantes en toutes lettres (`CONSO_PAR_CRAN`, `CRANS_MAX`,
      `POUSSEE_MAX`, `MOON_GRAVITY`), pas avec la lecture simplifiée `v / sin θ`
      qui ne vaudrait que pour les valeurs du jour. Seule la vérification
      « par le jeu » (ressenti manette) reste ouverte, fondue dans l'inconnue
      « jouabilité des réglages » ci-dessus.
- [x] **Contraste de rugosité du terrain** (`RUGOSITE_DOUCE = 0,15` contre
      `RUGOSITE_ACCIDENTEE = 1,6`, plus la passe de pics et de canyons) : le
      relief doit vraiment offrir des secteurs infranchissables et des secteurs
      posables. Vérifié statistiquement en T6, réajusté à l'œil en T17.
      `AMPLITUDE_INITIALE` est passée de 60 à 18 pour que la surface tienne dans
      la bande sans écrêtage — un écrêtage aux bornes fabriquait des mesas plates
      donc posables au milieu des secteurs accidentés. Cette baisse seule a rendu
      le relief trop plat à l'échelle du train : 49 % des abscisses d'un secteur
      accidenté acceptaient encore le LEM. `AMPLITUDE_DECROISSANCE` est donc
      passée de 0,55 à 0,70, ce qui remonte la dernière itération du point milieu
      de 0,27 à 1,5 m sans toucher à la macro-forme (la normalisation affine
      ramène de toute façon la surface dans la bande). Mesuré sur 200 graines à
      difficulté 2,4 : 10 % d'abscisses posables en secteur accidenté contre
      89 % en secteur doux, et `terrain.test.ts` borne désormais ces deux
      fractions.
      État après T17 : le contraste chiffré (10 % / 89 %) est reporté au §5.1
      du cahier des charges, et `reglages.test.ts` ajoute l'invariant
      « `RUGOSITE_ACCIDENTEE` vaut au moins cinq fois `RUGOSITE_DOUCE` ».
      **Levé après la PR du run D** : réajustement à l'œil fait par
      l'utilisateur via `yarn dev`, aucun problème signalé.
- [x] **Seuils de zoom et hystérésis** : assez larges pour ne pas clignoter,
      assez serrés pour que la vue rapprochée arrive à temps, et **bornés par la
      demi-hauteur de vue du zoom visé** (45 m au zoom 2, 22,5 m au zoom 4),
      **côté entrée et côté retour**, pour que le sol ne sorte pas de l'écran ni
      au moment du saut ni pendant toute la bande d'hystérésis qui suit.
      État après T10 : les valeurs retenues sont
      `SEUILS_ZOOM = { vers2: 40, retour1: 44, vers4: 16, retour2: 22 }` — les
      valeurs de départ (60 / 80 et 25 / 35) laissaient le seuil de retour
      au-dessus de la borne de visibilité et sortaient le sol de l'écran en
      remontant ; corrigé avant implémentation. `zoomSuivant` compare en
      **strict** (pile au seuil, le cran courant est conservé) et n'avance que
      d'**un cran par appel** (1 → 12 m rend 2, pas 4 ; le second cran arrive à
      l'image suivante). `reglages.test.ts` (T17) couvre déjà les quatre bornes
      dans son plan de tests. Reste ouvert : la validation **par le jeu**
      (ressenti manette), qui attend T17.
      État après T17 : l'**ordre des quatre seuils** et le fait qu'ils
      **tiennent tous les quatre** dans la demi-vue du zoom visé — entrée et
      retour — sont désormais couverts par deux invariants de
      `reglages.test.ts`. Le ressenti manette est couvert par la levée de
      l'inconnue « jouabilité des réglages » ci-dessus : partie jouée par
      l'utilisateur via `yarn dev`, aucun clignotement ni sol sorti de l'écran
      signalé.

### Fenêtre aveugle du largage — inconnue nouvelle, levée par la mesure

Non listée à l'ouverture du plan, apparue avec le calcul du run D :
`TERRAIN_Y_MAX - DEPART_Y = 280` m dépasse largement ce que `BIAIS_CAMERA_Y`
peut couvrir, donc chaque manche démarre par un temps de chute libre sans le
moindre relief visible. Mesuré sur 800 terrains : **6,8 à 10,0 s, 8,6 s en
médiane** — le pire cas théorique (12,7 s) n'arrive jamais, la cible ne tombant
jamais à `TERRAIN_Y_MAX`. `BIAIS_CAMERA_Y` reste à 60 (le monter jusqu'à couvrir
le pire cas déborderait la vue au zoom 2) ; c'est `dessineIndicateurCible`
(T10) qui signale la cible pendant l'attente. Chiffré au §6.2 du cahier des
charges. Le **ressenti** de cette attente, lui, n'a pas été éprouvé manette en
main.

## Vérification

Commande qui doit passer au vert à la fin de chaque tâche, depuis la racine du
dépôt :

```
yarn typecheck && yarn test && yarn build
```

Les tâches qui produisent du visuel (T5, T10 à T16) ajoutent un contrôle à la
main : `yarn dev`, puis vérifier à l'écran ce que dit la section « Fini quand » de
la fiche.

## Hors périmètre

- **Aucun son.** Le module audio d'Asteroids a été retiré ; on ne le remet pas.
- **Pas de manette, pas de tactile, pas de souris** : le jeu se joue aux quatre
  flèches, plus Entrée, Échap, `H` et `R`.
- **Pas de sauvegarde en ligne** ni de classement partagé : le hall of fame est
  local. On se contente d'une interface de stockage propre, sans client réseau.
- **Pas d'export / import** du hall of fame.
- **Pas de publication npm du moteur** : l'import reste en source directe.
- **Pas de refonte du moteur existant** : `GameLoop`, `Scene`, `GameState`,
  `Vector2` et `collision` ne sont pas retouchés. `KeyboardInput` ne reçoit que
  **deux** corrections, toutes deux en T4 : l'écouteur `blur`, et l'**ignorance
  des `keydown` porteurs de `ctrlKey`, `metaKey` ou `altKey`** — sans quoi
  `Cmd+R` ne recharge pas la page et vaut un appui sur la commande `raz` du hall
  of fame. On ajoute des outils à côté.
- **Pas de multi-résolution fractionnaire** : l'agrandissement est entier **en
  pixels d'écran** (la boîte CSS, elle, peut mesurer 2,666… px par pixel de jeu
  sur un écran à 1,5 dppx), et si la fenêtre est plus petite que 320 × 180 on
  reste au facteur 1.
- **Pas de mode replay** ni de partage de graine, même si le générateur à graine
  le permettrait.
