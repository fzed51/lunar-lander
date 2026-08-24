---
id: T16
titre: Écran du hall of fame — tableau des 100 parties, remise à zéro
fichiers: packages/game/src/screens/hof.ts, packages/game/src/design/ui.css, packages/game/src/main.ts, packages/game/src/types.ts, packages/game/src/input/mapping.ts, packages/game/src/style.css
sensible: false
---

# T16 — Écran du hall of fame

## Objectif

Présenter les 100 meilleures parties sur le même fond animé que l'accueil, avec
défilement au clavier et remise à zéro confirmée.

## Ce qui existe

- `hof.ts` : `lisHof`, `videHof`, `TAILLE_HOF`, `EntreeHof` (T14).
- `storage.ts` : `Stockage`, `stockageDisponible` (T14).
- `render/background.ts` : `dessineFond`, réutilisé tel quel (T13). **Déplacé
  ici pendant ce run** : `GRAINE_CIEL`, la graine du champ d'étoiles, vivait
  dans `screens/home.ts` (T13) et a été déplacée dans `render/background.ts`
  pour que les deux écrans DOM sur fond animé — accueil et hall of fame — la
  partagent. Sans ce déplacement, soit la graine est recopiée dans `hof.ts`
  (et duplique la valeur, avec le risque de diverger un jour), soit ce module
  importe `screens/home.ts` (et couple deux écrans qui ne se connaissent pas
  autrement) ; `home.ts` importe désormais `GRAINE_CIEL` depuis
  `background.ts`, pas l'inverse.
- `screens/gameover.ts` : `etiquetteNiveau`, **exportée** pendant ce run (T15)
  précisément pour que cet écran l'importe — la colonne `NIVEAU` du tableau
  doit nommer les niveaux comme le bilan de fin de partie qu'on vient de
  quitter, pas retenir une seconde table qui finirait par diverger.
- `GestionnaireEcrans`, `Ecran`, la couche `#ui`, le snapshot d'entrée unique
  (T5).
- `design/ui.css` (T13).
- L'écran de fin de partie (T15) demande la transition vers `"hof"` en passant
  l'entrée qui vient d'être enregistrée, et a déjà remplacé le bouchon `"fin"`
  de `main.ts` par `creeEcranFin({ hote: ui, stockage })` — `stockage` est
  l'instance unique construite dans `main.ts` par `stockageDisponible()`. Cette
  tâche réutilise **la même variable `stockage`**, elle n'en refabrique pas une
  deuxième : sinon, en navigation privée, cet écran lirait un magasin en
  mémoire différent de celui où l'écran de fin vient d'écrire.
- `main.ts` enregistre encore `bouchonDom("hof", () => ({ nom: "accueil" }))` —
  c'est ce bouchon que cette tâche retire.

## À faire

1. Créer `packages/game/src/screens/hof.ts`.
   - `creeEcranHof(options: OptionsEcranHof): Ecran`, avec
     `interface OptionsEcranHof { readonly hote: HTMLElement; readonly stockage: Stockage }`
     — même règle que T15 : le magasin est reçu, jamais recréé via un second
     appel à `stockageDisponible()`.
     **Signature réelle, un champ de plus** :
     `interface OptionsEcranHof { readonly hote: HTMLElement; readonly renderer: Renderer; readonly stockage: Stockage }`.
     Cette fiche annonçait deux champs (`hote`, `stockage`) mais exige par
     ailleurs, plus bas et dans « Fini quand », un « fond animé identique à
     l'accueil (`dessineFond` sur `#fond`) » : sans `Renderer`, l'écran ne peut
     rien peindre sur cette couche, qui resterait figée sur la dernière image
     laissée par l'accueil. `main.ts` passe `fond.renderer`, le même que
     l'accueil.
   - Fond animé identique à l'accueil (`dessineFond` sur `#fond`).
   - Tableau DOM : rang, trigramme, temps de vol, points, manches, niveau, date.
     Colonnes à largeur fixe, alignées.
   - Défilement au clavier : ↑ / ↓ ligne à ligne, ← / → page par page. Une
     fenêtre de lignes visibles, pas 100 lignes empilées hors écran.
   - Mise en évidence en `accent` de l'entrée portée par la variante
     `{ nom: "hof"; params: … }` de `Transition` (T5, enrichie par T14), quand on
     arrive depuis l'écran de fin ; défilement automatique jusqu'à elle. Arrivée
     depuis l'accueil : pas de params, aucune ligne mise en avant.
     **Précision décidée après revue** : `entre()` lit la liste en priorité
     depuis `t.params?.liste` (la valeur que `ajouteAuHof` a rendue à l'écran
     de fin, voir task-15-fin-de-partie.md) et ne retombe sur `lisHof(stockage)`
     que si ce champ est absent — venue de l'accueil, ou d'un appelant qui n'a
     rien écrit. Une relecture systématique du stockage pouvait diverger de ce
     qui vient d'être écrit (quota qui bascule entre les deux appels,
     navigation privée dont le repli mémoire n'est pas partagé) et faire
     disparaître, sans message, la partie que le joueur vient de valider.
   - `R` demande la remise à zéro, avec confirmation explicite
     (`R A NOUVEAU POUR CONFIRMER — ECHAP POUR ANNULER`), puis `videHof`.
   - `Échap` ou `Entrée` revient à l'accueil.
   - Liste vide : `AUCUNE PARTIE ENREGISTREE`.
   - `sort()` vide `#ui`, ne laisse aucun état de confirmation en attente, et
     remet la demande de transition à `null` (T5).
   - **Toutes les commandes de cet écran se lisent au front montant**
     (`justPressed`), jamais à `isActive` : `raz`, `back`, `confirm`, et les
     quatre commandes de défilement (haut/bas/gauche/droite). Une commande lue
     à `isActive` reste vraie sur plusieurs images consécutives tant que la
     touche est maintenue ; pour la remise à zéro en particulier, ça
     transformerait un appui un peu long sur `R` en confirmation involontaire
     dès l'image suivante (16 ms plus tard), sans que le message
     `R A NOUVEAU POUR CONFIRMER` ait eu le temps d'être vu.
2. Ajouter les styles de tableau dans `ui.css`, tokens de T1 uniquement.
3. Ajouter les touches `R` (commande `raz`) et le défilement à
   `input/mapping.ts` si elles n'y sont pas encore. `KeyR` **ne doit pas**
   déclencher `raz` quand `Ctrl`, `Cmd` ou `Alt` est enfoncé : le filtre est
   posé une fois pour toutes dans `KeyboardInput` par T4. Ne pas le refaire ici,
   et ne pas mapper `R` sur autre chose pour contourner le problème.
   **Complément constaté à l'implémentation** : la commande `raz` doit d'abord
   exister dans l'union `Command` de `packages/game/src/types.ts` — `mapping.ts`
   type son `Record<string, Command>` sur cette union, et `KeyR: "raz"` ne
   compile pas sans elle. C'est pourquoi `types.ts` a été touché en plus des
   fichiers listés à l'origine.
4. **Rebrancher `main.ts`** : remplacer
   `.enregistre(bouchonDom("hof", () => ({ nom: "accueil" })))` par
   `.enregistre(creeEcranHof({ hote: ui, stockage }))`, en réutilisant la même
   variable `stockage` que T15, et supprimer la ligne du bouchon. Une fois les
   deux bouchons retirés (celui de `"fin"` par T15, celui de `"hof"` ici),
   `bouchonDom`, `titreBouchon` et `invitationBouchon` n'ont plus aucun appelant
   dans `main.ts` : ce sont alors du code mort que `noUnusedLocals` fera
   échouer au `typecheck`. Les retirer dans **le même commit** que ce
   rebranchement, pas dans un commit séparé. **Complément constaté à
   l'implémentation** : le retrait de `bouchonDom` rend aussi mortes les
   règles `.bouchon`, `.bouchon-titre` et `.bouchon-invite` de
   `packages/game/src/style.css`, dernier balisage qu'elles stylaient — à
   retirer dans le même commit, même motif que le code mort TypeScript.

## Gardes et cas limites

- **Trigramme affiché par `textContent`**, jamais `innerHTML` : c'est la seule
  donnée du jeu qui vienne d'un tiers (le `localStorage` est éditable à la main),
  et elle finit dans le DOM.
- **Confirmation de la remise à zéro** : un seul appui sur `R` ne doit jamais
  effacer 100 entrées. Lue à `justPressed`, une pression maintenue ne compte
  qu'une fois ; c'est ce qui distingue « un appui » d'« une touche enfoncée
  16 ms ». La confirmation en attente **expire** au changement d'écran — sinon
  un `R` laissé pendant depuis la visite précédente effacerait la liste au
  retour.
- **`Cmd+R` / `Ctrl+R` rechargent la page** et ne comptent pas comme un appui sur
  `raz`. Sans le filtre de modificateurs de T4, l'utilisateur qui veut recharger
  voit `R A NOUVEAU POUR CONFIRMER`, refait `Cmd+R` en croyant que rien n'a pris,
  et perd ses 100 entrées.
- **Défilement borné** : ↑ sur la première ligne et ↓ sur la dernière ne sortent
  pas de la liste. Liste vide : le défilement ne lève pas.
- **Date affichée** : formatée pour être lisible, mais une date invalide en
  stockage ne doit pas produire `Invalid Date` à l'écran.
- **Colonnes stables** : les nombres sont alignés à droite et à largeur fixe, un
  tableau dont les colonnes sautent selon les valeurs est illisible.
- Aucune couleur littérale : tokens CSS de T1 uniquement.

## Tests attendus

- Défilement borné en haut et en bas ; aucun jet sur une liste vide.
- Première pression sur `R` : rien d'effacé, message de confirmation présent.
- Deuxième pression : liste vidée.
- **Discrimine `justPressed` de `isActive`** : trois images consécutives avec
  `isActive("raz")` vrai et `justPressed("raz")` vrai à la **première** image
  seulement → une seule confirmation affichée à l'issue des trois images, liste
  intacte. Un écran qui lirait `raz` à `isActive` viderait la liste dès la
  deuxième image et ferait échouer ce test.
- **`Ctrl+R` puis `Ctrl+R`** : aucune confirmation demandée, liste intacte
  (garanti par le filtre de T4, éprouvé ici sur l'écran réel).
- `Échap` après une première pression sur `R` : confirmation annulée, liste
  intacte.
- Après `sort()` puis re-`entre()`, aucune confirmation n'est en attente.
- Un trigramme stocké valant `<script>alert(1)</script>` s'affiche comme du
  texte, et le DOM ne contient aucun élément `script`.
- Une date invalide en stockage n'affiche pas `Invalid Date`.

## Fini quand

- [ ] Le hall of fame s'ouvre depuis l'accueil et depuis la fin de partie, sur
      le même fond animé.
- [ ] L'entrée qui vient d'être enregistrée est mise en évidence.
- [ ] La remise à zéro demande une confirmation qui ne survit pas au changement
      d'écran.
- [ ] `main.ts` enregistre `creeEcranHof` à la place du bouchon `"hof"`, et
      `bouchonDom` / `titreBouchon` / `invitationBouchon` ont disparu du fichier.
- [ ] La commande de vérification du README du plan passe au vert.
- [ ] **Non fait dans cet environnement** : le contrôle à l'œil via `yarn dev`.
      La mise en page du tableau repose sur un budget calculé — 172 px de haut
      sur les 180 px du cadre, 276 px de large sur les 304 px utiles, avec
      `--hof-car: 6px` pour la largeur d'un caractère de 8 px interlettrage
      compris — jamais vérifié dans un navigateur réel. À faire par un humain
      avant la PR ; reporté dans les inconnues du README du plan.
