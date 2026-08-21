---
id: T5
titre: Surface pixel, entrée unique et machine à écrans, côté jeu
fichiers: packages/game/src/render/surface.ts, packages/game/src/screens/types.ts, packages/game/src/screens/manager.ts, packages/game/src/screens/manager.test.ts, packages/game/src/main.ts, packages/game/index.html, packages/game/src/style.css
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
     `renderer`, `echelle()`, `dispose()` ;
   - dimensionnement interne à `PIXEL`, lissage désactivé, agrandissement au
     **plus grand facteur entier** qui tient dans la fenêtre, minimum 1 ;
   - recalcul sur `resize`, et `dispose()` qui retire l'écouteur.
2. Restructurer `packages/game/index.html` en trois couches superposées dans un
   conteneur `#scene` :
   - `<canvas id="fond">` — fond animé des écrans DOM ;
   - `<canvas id="game">` — l'écran de jeu ;
   - `<div id="ui">` — les écrans en DOM.
   Les trois partagent la même boîte et le même facteur d'échelle.
3. Créer `packages/game/src/screens/types.ts` : l'interface `Ecran`.
   - `readonly nom: "accueil" | "jeu" | "fin" | "hof"` ;
   - `entre(params: ParamsEcran): void` — appelé à l'activation ;
   - `sort(): void` — **doit** défaire ce que `entre` a fait (nœuds DOM retirés,
     état de saisie effacé) ;
   - `tick(dt: number, input: InputSnapshot<Command>): void` — l'écran **reçoit**
     le snapshot, il ne le fabrique pas ;
   - `rend(): void` ;
   - `transitionDemandee(): { nom: string; params?: ParamsEcran } | null` — une
     **méthode**, pas une propriété `readonly` : un écran doit pouvoir noter sa
     demande, ce qu'une propriété en lecture seule lui interdit.
   - `ParamsEcran` est une **union discriminée**, et non `unknown` : c'est la
     couture par laquelle passent le niveau choisi, le résultat de partie et
     l'entrée du classement, elle mérite d'être typée. T5 n'en déclare que les
     variantes dont les types existent déjà — `{ ecran: "accueil" }` et
     `{ ecran: "jeu"; niveau: number }`. Les variantes `fin` et `hof` sont
     **ajoutées** par les tâches qui créent leurs types : T9 pour
     `ResultatPartie`, T14 pour `EntreeHof`. Ne pas les déclarer par avance avec
     un `unknown` de complaisance.
4. Créer `packages/game/src/screens/manager.ts` : `GestionnaireEcrans`.
   - Il **possède** l'unique `KeyboardInput` et fait **le seul `poll()` de
     l'image**, au début de son `tick`.
   - Il expose `sourcePartagee(): InputSource<Command>` — un adaptateur dont
     `poll()` rend le snapshot déjà capturé pour l'image en cours. C'est cet
     adaptateur que l'écran de jeu passe à sa `Scene`, de sorte que la `Scene`
     croie sonder le clavier alors qu'elle relit le snapshot commun.
   - `active(nom, params)` : `sort()` sur l'écran courant **avant** `entre()` sur
     le nouveau.
   - `tick(dt)` : capture le snapshot, délègue à l'écran courant, puis applique
     **une seule** transition demandée.
   - `rend()` : délègue à l'écran courant.
   - `dispose()` : libère le `KeyboardInput`.
5. Réécrire `main.ts` : créer la surface, instancier le gestionnaire, enregistrer
   des écrans **bouchons** (chacun affiche son nom et passe au suivant sur
   Entrée), et faire tourner le tout dans un `GameLoop` du moteur.
   - `GameLoop<S>` est fonctionnel sur un état immuable, la couche écrans est à
     objets : on l'instancie en `GameLoop<null>` avec
     `onTick: (s, dt) => { gestionnaire.tick(dt); return s; }` et
     `onRender: () => gestionnaire.rend()`, démarré par `loop.start(null)`. C'est
     assumé et écrit en commentaire, pour que personne n'invente une seconde
     boucle à côté.
6. Mettre `style.css` à jour : superposition des trois couches, mêmes dimensions,
   `image-rendering: pixelated`, couleurs prises dans les variables de T1.

## Gardes et cas limites

- **Un seul `poll()` par image, et un seul propriétaire du clavier** : aucun
  écran ne crée son propre `KeyboardInput` ni n'ajoute d'écouteur clavier. Un
  test doit échouer si un second `poll()` intervient dans la même image — par
  exemple en comptant les appels sur une source instrumentée.
- **Seul l'écran actif réagit** : le clavier étant unique et centralisé, un écran
  sorti ne peut plus rien recevoir. C'est l'effet voulu.
- Fenêtre **plus petite** que 320 × 180 : facteur 1, jamais 0 ni fractionnaire —
  le jeu déborde plutôt que de casser la grille.
- `active` sur un nom inconnu : erreur explicite, pas un écran noir muet.
- `active` sur l'écran **déjà courant** : traité comme une vraie réactivation
  (`sort` puis `entre`), pour que les params soient repris.
- Transition demandée depuis `entre()` : appliquée au tick suivant, jamais en
  récursion pendant l'activation.
- Deux transitions demandées dans le même tick : une seule appliquée, la seconde
  attend. Pas de cascade dans une image.
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
- Nom inconnu : erreur.
- **Le snapshot est capturé une fois** : sur une source instrumentée, un tick
  produit exactement un `poll()`, y compris quand l'écran de jeu passe
  l'adaptateur à une `Scene`.
- L'adaptateur rend le **même** snapshot que celui reçu par l'écran, avec les
  mêmes fronts montants.
- Après `sort()` d'un écran DOM bouchon, `#ui` ne contient plus aucun nœud.
- Facteur d'échelle : 1 pour 300 × 150, 4 pour 1280 × 720, 4 pour 1400 × 800 (et
  pas 4,375).

## Fini quand

- [ ] `yarn dev` affiche l'écran bouchon « ACCUEIL » en pixels nets, et Entrée
      fait défiler les quatre écrans bouchons.
- [ ] Un seul `poll()` par image, prouvé par un test.
- [ ] Redimensionner la fenêtre change le facteur par sauts entiers, sans jamais
      flouter l'image.
- [ ] Aucune logique d'écran n'est entrée dans `packages/engine`.
- [ ] La commande de vérification du README du plan passe au vert.
