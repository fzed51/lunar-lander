---
id: T5
titre: Surface pixel, entrée unique et machine à écrans, côté jeu
fichiers: packages/game/src/render/surface.ts, packages/game/src/render/surface.test.ts, packages/game/src/screens/types.ts, packages/game/src/screens/manager.ts, packages/game/src/screens/manager.test.ts, packages/game/src/main.ts, packages/game/index.html, packages/game/src/style.css, packages/game/package.json
sensible: false
---

# T5 — Surface pixel, entrée unique, machine à écrans

## Objectif

Poser la charpente du jeu : une surface pixel 320 × 180 agrandie à facteur
entier, **un seul sondage du clavier par image**, et une machine à écrans qui
donne la main à un seul écran à la fois — canvas pour le jeu, DOM pour les
autres.

## Ce qui existe

- `packages/game/src/main.ts` fait déjà, en dur : récupération du canvas,
  dimensionnement à `PIXEL`, `imageSmoothingEnabled = false`, une fonction
  `fitToWindow` à facteur entier, un `Renderer`, un titre dessiné.
- `packages/game/index.html` contient un seul `<canvas id="game">`.
- `@lem/engine` fournit `GameLoop`, `Camera`, `Renderer`, `KeyboardInput`,
  `InputSource`, `InputSnapshot`.
- **Point sensible** : `Scene.tick` (`packages/engine/src/core/Scene.ts`) appelle
  `this.input.poll()` lui-même, et `KeyboardInput.poll()` **vide** le tampon
  `pressedSincePoll`. Deux `poll()` dans la même image et le second ne voit plus
  aucun front montant. Or le cran de poussée (T7), la navigation et la saisie du
  trigramme (T15) reposent entièrement sur `justPressed`.
- Aucune notion d'écran : le moteur ne s'en occupe pas et ne doit pas s'en
  occuper (contrainte du chantier).

## À faire

1. Créer `packages/game/src/render/surface.ts` : sortir de `main.ts` la logique
   d'affichage.
   - `creeSurface(canvas: HTMLCanvasElement): Surface`, où `Surface` porte
     `renderer`, `echelle()`, `densite()` et `dispose()` ;
   - dimensionnement interne à `PIXEL`, lissage désactivé (`canvas.width` posé
     **avant** `getContext`, car changer `width` réinitialise l'état du contexte
     et donc `imageSmoothingEnabled`) ;
   - agrandissement au **plus grand facteur entier** qui tient dans la fenêtre,
     minimum 1 — mais **le facteur entier se compte en pixels d'écran, pas en
     pixels CSS.** Le calcul est sorti en fonction pure exportée
     `facteurEchelle(largeur: number, hauteur: number, densite = 1): number`,
     avec `densiteValide(brute: number | undefined): number` qui ramène un
     `devicePixelRatio` absent, nul ou absurde à 1. Ce qui compte est le nombre
     de pixels **d'écran** par pixel de jeu : sur un `devicePixelRatio`
     fractionnaire (Windows à 125 % ou 150 %, la plupart des mobiles, certaines
     résolutions macOS mises à l'échelle), un facteur entier en pixels CSS donne
     un nombre fractionnaire de pixels d'écran — ×3 à 1,5 dppx fait 4,5 — et
     `image-rendering: pixelated` duplique alors une colonne sur deux plus large
     que ses voisines. Les traits d'un pixel et les glyphes 5 × 7 ressortent
     d'épaisseur irrégulière : exactement ce que tout le design system existe
     pour empêcher. Un facteur calculé en pixels CSS aurait tenu cet invariant
     **faux** sur ce matériel, sans aucun signalement ;
   - la taille de boîte est donc redonnée au CSS en pixels CSS **éventuellement
     fractionnaires** — `echelle() / densite()` — pour que le produit par la
     densité retombe juste. Elle est publiée dans la variable CSS
     `VAR_ECHELLE = "--lem-echelle"`, posée sur `document.documentElement` ;
   - recalcul sur `resize` **et sur changement de densité**. `devicePixelRatio`
     n'émet aucun événement propre : on interroge la densité courante par
     `matchMedia("(resolution: <d>dppx)")` et on attend qu'elle cesse de
     correspondre, en réarmant la requête à chaque calcul. Sans ça, une fenêtre
     glissée d'un écran à l'autre change de densité sans émettre de `resize` et
     reste au mauvais facteur. Environnement sans `matchMedia` : on perd la
     surveillance, pas la surface ;
   - `dispose()` retire les deux écouteurs et est **idempotent**.
2. Restructurer `packages/game/index.html` en trois couches superposées dans un
   conteneur `#scene` :
   - `<canvas id="fond" width="320" height="180">` — fond animé des écrans DOM ;
   - `<canvas id="game" width="320" height="180">` — l'écran de jeu ;
   - `<div id="ui">` — les écrans en DOM.
   Les trois partagent la même boîte et le même facteur d'échelle. Le partage se
   fait **par la variable CSS** `--lem-echelle` : c'est le CSS qui dimensionne
   `#scene`, donc les trois couches d'un coup. La signature imposée
   `creeSurface(canvas)` ne voit qu'un seul canvas, et il valait mieux publier
   une mesure que d'aller chercher des nœuds que la surface ne possède pas.
   Effet de bord à connaître : `creeSurface` écrit sur
   `document.documentElement.style`.
   Les attributs `width` / `height` sur les **deux** canvas ne sont pas
   décoratifs : un canvas sans dimensions déclarées vaut 300 × 150 en interne et
   son contenu, étiré sur la boîte agrandie, sort de la grille. `#fond` n'est pas
   encore piloté par du code (c'est T13), l'attribut suffit en attendant.
3. Créer `packages/game/src/screens/types.ts` : le type `Transition` et
   l'interface `Ecran`.
   - `Transition` est **une seule union discriminée qui apparie le nom et sa
     charge utile**, avec les **quatre** variantes dès T5 :

     ```ts
     type Transition =
       | { nom: "accueil" }
       | { nom: "jeu"; params: { niveau: 0 | 1 | 2; graine: number } }
       | { nom: "fin" }
       | { nom: "hof" };
     ```

     Un nom et des params déclarés séparément (`{ nom: string; params?: … }`)
     ne compile pas sous `strict` face à un `entre(params: ParamsEcran)` qui
     exige son argument, laisse passer une faute de frappe dans le nom, et
     autorise d'apparier `"jeu"` avec les params de l'accueil. Les variantes
     `fin` et `hof` sont déclarées **sans charge utile** ici, puis
     **enrichies** — pas créées — par les tâches qui produisent leurs types :
     T9 ajoute `params: ResultatPartie` à `fin`, T14 ajoute l'entrée mise en
     avant à `hof`. Ne pas les typer par avance avec un `unknown` de
     complaisance.
     La `graine` de la variante `jeu` est la seule entropie extérieure du jeu
     (`Date.now()` au moment de la transition, côté accueil en T13) : tout le
     reste des tirages en descend.
   - `readonly nom: Transition["nom"]` — l'écran s'identifie dans la **même**
     union, pas dans une copie littérale qui pourrait dériver ;
   - `entre(t: Transition): void` — appelé à l'activation, avec la transition
     entière : l'écran discrimine sur `t.nom` et récupère ses params typés ;
   - `sort(): void` — **doit** défaire ce que `entre` a fait (nœuds DOM retirés,
     état de saisie effacé, **et toute demande de transition en attente
     effacée**) ;
   - `tick(dt: number, input: InputSnapshot<Command>): void` — l'écran **reçoit**
     le snapshot, il ne le fabrique pas ;
   - `rend(): void` ;
   - `prendTransition(): Transition | null` — **rend la demande en attente et la
     remet à `null` dans le même appel**. C'est une méthode, pas une propriété
     `readonly` : un écran doit pouvoir noter sa demande. Et c'est une
     **consommation**, pas une lecture : les écrans sont des instances
     enregistrées une fois et réactivées par nom, donc une demande jamais
     effacée est rejouée au passage suivant et les quatre écrans se mettent à
     défiler seuls, une image après l'autre, sans qu'on touche une touche.
4. Créer `packages/game/src/screens/manager.ts` : `GestionnaireEcrans`.
   - Il **possède** l'unique `KeyboardInput` et fait **le seul `poll()` de
     l'image**, au début de son `tick`.
   - Son constructeur prend des options,
     `new GestionnaireEcrans(options: OptionsGestionnaire = {})`, avec une
     **source de commandes injectable** : `{ source?: InputSource<Command> }`.
     Sans injection, impossible de compter les `poll()` — or c'est précisément le
     test que cette fiche exige. Par défaut le gestionnaire crée et **possède**
     l'unique `KeyboardInput`, et le libère dans `dispose()` ; une source
     injectée ne lui appartient pas et n'est pas libérée. Un test vérifie le
     comportement par défaut avec de vrais `keydown`.
   - Il expose aussi `nomCourant: NomEcran | null` (accesseur), et `enregistre`
     rend `this` pour s'enchaîner. `NomEcran = Transition["nom"]` est exporté par
     `types.ts` : le nom d'écran est dérivé de l'union, jamais recopié.
   - Il expose `sourcePartagee(): InputSource<Command>` — un adaptateur dont
     `poll()` rend le snapshot déjà capturé pour l'image en cours. C'est cet
     adaptateur que l'écran de jeu passe à sa `Scene`, de sorte que la `Scene`
     croie sonder le clavier alors qu'elle relit le snapshot commun.
   - `active(t: Transition)` : `sort()` sur l'écran courant **avant** `entre(t)`
     sur le nouveau. Un seul argument, la transition entière — c'est ce qui
     garde le nom et les params appariés de bout en bout.
   - `tick(dt)` : capture le snapshot, délègue à l'écran courant, puis
     **consomme** la demande de l'écran courant par `prendTransition()` et
     l'applique — au plus une par image. Consommer avant d'appliquer, et non
     après, pour qu'une demande formulée depuis `entre()` du nouvel écran ne
     soit pas avalée par la même image.
   - `rend()` : délègue à l'écran courant.
   - `dispose()` : libère le `KeyboardInput`.
5. Réécrire `main.ts` : créer la surface, instancier le gestionnaire, enregistrer
   des écrans **bouchons** (chacun affiche son nom et note la transition vers le
   suivant sur le **front montant** de `confirm`, en cycle
   accueil → jeu → fin → hof → accueil), et faire tourner le tout dans un
   `GameLoop` du moteur. Le bouchon `accueil` fournit la charge utile de la
   variante `jeu` (`{ niveau: 0, graine: Date.now() }`) : les quatre variantes de
   `Transition` sont donc exercées dès T5, sans cast.
   Les bouchons se répartissent comme les vrais écrans, et non tous au canvas :
   `accueil`, `fin` et `hof` sont des **écrans en DOM** (un bloc dans `#ui`),
   seul `jeu` est dessiné au canvas à la police bitmap. C'est l'architecture
   cible, et c'est ce qui fait exercer la couche `#ui` dès T5 — sans quoi le test
   « après `sort()`, `#ui` est vide » n'aurait rien à observer. Le texte des
   bouchons DOM suit la typographie DOM du design system (monospace système,
   32 px pour le titre, 16 px pour l'invite). Le bouchon canvas repeint la couche
   de jeu à chaque image ; les bouchons DOM aussi, sinon la dernière image de la
   partie resterait affichée derrière le HTML.
   - `GameLoop<S>` est fonctionnel sur un état immuable, la couche écrans est à
     objets : on l'instancie en `GameLoop<null>` avec
     `onTick: (s, dt) => { gestionnaire.tick(dt); return s; }` et
     `onRender: () => gestionnaire.rend()`, démarré par `loop.start(null)`. C'est
     assumé et écrit en commentaire, pour que personne n'invente une seconde
     boucle à côté.
6. Mettre `style.css` à jour : superposition des trois couches, mêmes dimensions,
   `image-rendering: pixelated`, couleurs prises dans les variables de T1.
   - `#scene` est dimensionné en
     `calc(var(--lem-largeur) * var(--lem-echelle) * 1px)`, et les trois couches
     en héritent par `inset: 0`.
   - `style.css` **redéclare** la résolution interne en `--lem-largeur: 320` et
     `--lem-hauteur: 180`. C'est une duplication assumée de `PIXEL`
     (`src/constants.ts`) : le CSS ne peut pas lire un module TypeScript. Un
     commentaire le signale aux deux endroits.
   - `--lem-echelle` vaut 1 par défaut, valeur de repli avant le premier calcul
     et si le script ne tourne pas. Elle n'est **pas** forcément entière — c'est
     le facteur en pixels d'écran qui l'est, et il vaut cette valeur ×
     `devicePixelRatio`. Le commentaire du fichier doit dire cela et pas
     « le facteur est entier, donc chaque pixel du jeu couvre un carré entier de
     pixels d'écran » : cette formulation est fausse dès que la densité est
     fractionnaire.
   - C'est aussi ici qu'atterrit la typographie DOM du design system, sur la
     règle `#ui` : `font-family: ui-monospace, "Courier New", monospace`,
     `font-weight: 700`, `letter-spacing: 1px`, tailles en multiples de 8 px. T1
     l'avait documentée sans la matérialiser, faute de consommateur.

## Gardes et cas limites

- **Un seul `poll()` par image, et un seul propriétaire du clavier** : aucun
  écran ne crée son propre `KeyboardInput` ni n'ajoute d'écouteur clavier. Un
  test doit échouer si un second `poll()` intervient dans la même image — par
  exemple en comptant les appels sur une source instrumentée.
- **Seul l'écran actif réagit** : le clavier étant unique et centralisé, un écran
  sorti ne peut plus rien recevoir. C'est l'effet voulu.
- Fenêtre **plus petite** que 320 × 180 : facteur 1, jamais 0 ni fractionnaire —
  le jeu déborde plutôt que de casser la grille.
- Mesure de fenêtre absurde (`0`, `NaN`, négative) ou densité absurde (`0`,
  `NaN`, `Infinity`, négative) : facteur 1 et densité 1. Un facteur 0 ferait
  disparaître la surface sans laisser de trace de la cause.
- `body` en `overflow: hidden` : des barres de défilement rétréciraient la
  fenêtre utile et relanceraient le calcul du facteur en boucle.
- `active` sur un nom qui n'a **aucun écran enregistré** : erreur explicite, pas
  un écran noir muet. Le typage de `Transition` couvre la faute de frappe, la
  garde couvre l'écran oublié au registre.
- `active` sur l'écran **déjà courant** : traité comme une vraie réactivation
  (`sort` puis `entre`), pour que les params soient repris.
- **La demande est consommée, jamais relue** : après application, l'écran
  d'origine n'a plus de demande en attente. Réactiver un écran qui avait déjà
  demandé quelque chose ne relance rien. `sort()` efface aussi la demande, pour
  qu'un écran quitté avant application ne la ressorte pas plus tard.
- Transition demandée depuis `entre()` : appliquée au tick suivant, jamais en
  récursion pendant l'activation.
- Deux transitions demandées dans le même tick : **une seule case d'attente**, la
  première notée gagne, la seconde est ignorée. Une seule appliquée, pas de
  cascade dans une image. C'est aussi ce qui protège la double validation de
  l'écran de fin (T15) : le second `Entrée` tombe sur une demande déjà notée.
- Un écran DOM qui oublie de nettoyer : après `sort()`, `#ui` est vide. Test sur
  un écran bouchon.
- `dispose()` de la surface appelé deux fois : sans effet la seconde fois.

## Tests attendus

- Le gestionnaire appelle `sort` puis `entre` dans cet ordre, une fois chacun, à
  chaque changement.
- `tick` et `rend` ne touchent que l'écran courant.
- Une transition demandée pendant `tick` est appliquée après le `tick`, pas
  pendant.
- Deux transitions dans le même tick : une seule appliquée.
- **La demande est consommée** : A demande B, le gestionnaire applique ; on
  réactive A et on ticke → **aucune** transition n'est appliquée.
- **Cycle complet des quatre bouchons** : après accueil → jeu → fin → hof →
  accueil, ticker sans nouveau front montant sur `confirm` ne change plus
  d'écran. C'est le test qui interdit le défilement automatique.
- `sort()` efface la demande : A note une demande, on active B directement (sans
  ticker), on revient sur A → rien n'est appliqué.
- Nom sans écran enregistré : erreur.
- **Le snapshot est capturé une fois** : sur une source instrumentée, un tick
  produit exactement un `poll()`, y compris quand l'écran de jeu passe
  l'adaptateur à une `Scene`.
- L'adaptateur rend le **même** snapshot que celui reçu par l'écran, avec les
  mêmes fronts montants.
- Après `sort()` d'un écran DOM bouchon, `#ui` ne contient plus aucun nœud.
- Facteur d'échelle, **à densité 1** : 1 pour 300 × 150, 4 pour 1280 × 720,
  4 pour 1400 × 800 (et pas 4,375).
- Facteur d'échelle **à densité fractionnaire** : 4 pour 1000 × 600 à 1,5 dppx
  (et pas 3, qui vaudrait 4,5 pixels d'écran par pixel de jeu), 8 pour
  1280 × 720 à 2 dppx, 5 pour 1400 × 800 à 1,25 dppx.
- `creeSurface` pose une taille de boîte dont le produit par la densité est
  entier ; elle reste entière quand la densité vaut 1, et la boîte tient dans la
  fenêtre.
- Changement de densité **sans** `resize` : le facteur est recalculé, la requête
  de densité est réarmée sur la nouvelle valeur, et aucun écouteur n'est laissé
  derrière. `dispose()` libère la surveillance ; un second `dispose()` est sans
  effet et aucun `resize` ne recalcule plus.
- Ces tests vivent dans `packages/game/src/render/surface.test.ts` (16 tests),
  ajouté à l'en-tête `fichiers:` : la fiche exigeait le test du facteur d'échelle
  sans prévoir de fichier pour l'accueillir. `creeSurface` y est testée sur un
  canvas au contexte 2d factice, happy-dom rendant `null` sur
  `canvas.getContext("2d")`.

## Fini quand

- [x] `yarn dev` affiche l'écran bouchon « ACCUEIL » en pixels nets, et Entrée
      fait défiler les quatre écrans bouchons — **un appui, un écran** : après un
      tour complet, l'écran reste sur l'accueil tant qu'on ne touche à rien.
      « En pixels nets » porte sur la couche canvas (bouchon `jeu`) :
      agrandissement entier en pixels d'écran, `imageSmoothingEnabled = false`,
      vérifié à ×3 sur une fenêtre 1024 × 768. Les bouchons `accueil`, `fin` et
      `hof` sont en DOM, comme le seront les vrais écrans.
- [x] `Transition` est une union unique qui apparie nom et params, et
      `yarn typecheck` passe sans cast ni `any`.
- [x] Un seul `poll()` par image, prouvé par un test (`manager.test.ts` :
      15 tests).
- [x] Redimensionner la fenêtre change le facteur par sauts entiers, sans jamais
      flouter l'image — sauts entiers **en pixels d'écran**, y compris sur un
      `devicePixelRatio` fractionnaire.
- [x] Aucune logique d'écran n'est entrée dans `packages/engine`.
- [x] La commande de vérification du README du plan passe au vert.
- [x] `happy-dom` ajouté aux `devDependencies` de `@lem/game` (même version que
      le moteur, `^15.0.0`, une ligne dans `yarn.lock`). `manager.test.ts` a
      besoin d'un vrai DOM pour le test « après `sort()`, `#ui` est vide » et
      pour le clavier ; le paquet ne le déclarait pas et ne marchait que par
      remontée depuis `@lem/engine`. Ce n'est pas une dépendance runtime : la
      contrainte « pas de dépendance runtime ajoutée » est intacte.
