---
id: T14
titre: Hall of fame — stockage et logique de classement
fichiers: packages/game/src/storage.ts, packages/game/src/hof.ts, packages/game/src/hof.test.ts, packages/game/src/score.ts
sensible: true
---

# T14 — Stockage et classement

## Objectif

Conserver et classer les 100 meilleures parties, en logique pure plus une
interface de stockage — **sans aucun écran**. L'écran de fin de partie (T15) et
l'écran du hall of fame (T16) consommeront ces fonctions directement.

> Cette tâche passe **avant** les deux écrans qui l'utilisent. C'est volontaire :
> faire l'écran d'abord obligerait à inventer une injection de dépendance qui ne
> servirait qu'à contourner l'ordre des tâches.

## Ce qui existe

- `score.ts` : `comparePartie` — temps de vol total **décroissant**, puis total
  de points **croissant** (T9). Il est **complété** ici, pas redéfini ailleurs.
- `state.ts` : `Globals` avec `manchesReussies`, `ecarts`, `tempsDeVol`,
  `niveauDepart` (T9).
- Aucune persistance nulle part : `localStorage` n'est utilisé par aucun fichier.

## À faire

1. Créer `packages/game/src/storage.ts` :
   - `interface Stockage { lit(cle: string): string | null; ecrit(cle, valeur): void; efface(cle): void }` ;
   - `stockageNavigateur(): Stockage` — implémentation `localStorage` ;
   - `stockageMemoire(): Stockage` — implémentation en mémoire, pour les tests et
     pour le repli quand `localStorage` est indisponible ;
   - `stockageDisponible(): Stockage` — rend le premier des deux qui fonctionne,
     testé par une écriture-lecture réelle sur une clé jetable.
2. Compléter `score.ts` : `comparePartie` compare le temps de vol **arrondi à la
   seconde** (`Math.round`), puis le total de points croissant. Le temps exact
   reste stocké et affiché ; seul le **tri** est arrondi. Sans cet arrondi, deux
   sommes de pas de temps flottants ne sont jamais égales et la seconde clé de
   tri ne sert jamais à rien.
3. Créer `packages/game/src/hof.ts` :
   - `CLE_HOF = "lem.hof.v1"` et `TAILLE_HOF = 100` ;
   - `type EntreeHof = { trigramme: string; points: number; tempsDeVol: number; manchesReussies: number; niveauDepart: number; date: string }` ;
   - `normaliseTrigramme(brut: unknown): string` — exactement 3 caractères
     `A`–`Z`, tout le reste remplacé par `A` ;
   - `entreeValide(brut: unknown): brut is EntreeHof` — garde de type complète ;
   - `lisHof(stockage): readonly EntreeHof[]` — lecture, validation, tri ;
   - `estQualifie(stockage, resultat): boolean` — `false` si
     `manchesReussies < 1` ; sinon `true` si la liste n'est pas pleine, ou si
     l'entrée bat la dernière selon `comparePartie` ;
   - `ajouteAuHof(stockage, entree): readonly EntreeHof[]` — insère, trie,
     tronque à `TAILLE_HOF`, écrit, rend la liste ;
   - `videHof(stockage): void`.
4. **Enrichir** la variante `{ nom: "hof" }` de `Transition` (T5) avec
   `params?: { misEnAvant: EntreeHof }` : la variante existe déjà, on lui ajoute
   sa charge utile maintenant que `EntreeHof` existe. Le champ est optionnel
   parce qu'on ouvre aussi le hall of fame depuis l'accueil, sans entrée à
   mettre en avant ; l'écran (T16) traite explicitement le cas absent, il ne le
   force pas par un cast.

## Gardes et cas limites

- **Zéro manche réussie = pas d'entrée**, vérifié dans `estQualifie` **et** dans
  `ajouteAuHof`. La seconde garde protège l'appel direct qui contournerait la
  première : une garde qui ne couvre qu'un chemin ne garde rien.
- **Données non fiables** : `localStorage` est écrit par l'utilisateur autant que
  par le jeu. `lisHof` doit survivre à du JSON invalide, à un objet au lieu d'un
  tableau, à une entrée sans `trigramme`, à `points` valant `"douze"`, `NaN` ou
  `Infinity`, à un `tempsDeVol` négatif. Les entrées invalides sont écartées une
  par une, les valides conservées, et **jamais** d'exception qui bloquerait
  l'écran appelant.
- **Trigramme normalisé à l'écriture**, et c'est la seule donnée du jeu écrite
  par un tiers : T16 devra l'afficher par `textContent`, jamais `innerHTML`.
- **`localStorage` indisponible** (navigation privée, quota plein, exception à
  l'écriture) : repli silencieux sur `stockageMemoire`. Une exception non
  attrapée ici casserait l'écran de fin de partie.
- **Quota dépassé à l'écriture** : attrapé, la liste rendue reste correcte.
- **Troncature** : jamais plus de 100 entrées, y compris depuis un stockage qui
  en contenait 300.
- **Tri stable** : deux parties strictement identiques ne changent pas d'ordre
  entre deux lectures.
- **Clé versionnée** (`lem.hof.v1`) : un futur changement de format n'écrase pas
  les données d'une autre version.
- Arrondi du tri : `59.4 s` et `59.6 s` ne sont **pas** égaux (59 contre 60) ;
  `59.4 s` et `59.5 s` le sont. Le comportement au demi-point est celui de
  `Math.round`, et c'est écrit.

## Tests attendus

- `estQualifie` : faux avec `manchesReussies: 0` et un temps de vol de
  99 999 s ; vrai sur une liste vide avec une manche réussie ; faux quand la
  liste est pleine et que l'entrée est moins bonne que la centième.
- `ajouteAuHof` refuse aussi une entrée à zéro manche réussie appelée
  directement.
- Tri : temps de vol le plus long en tête ; **à temps arrondi égal** (120,2 s et
  119,9 s), les points les plus bas passent devant — c'est le test qui prouve que
  la seconde clé est vivante.
- Troncature à 100 depuis un stockage qui en contient 300.
- `lisHof` sur `"pas du json"`, `"{}"`, `"[]"`, et un tableau d'une entrée valide
  plus quatre invalides → rend uniquement la valide, sans lever.
- `points` à `NaN`, `Infinity`, `"douze"`, `tempsDeVol` négatif → écartées.
- `normaliseTrigramme` : `"ab"`, `"abcd"`, `"a1!"`, `"<script>"`, `null`,
  `42` → trois lettres majuscules de `A`–`Z`.
- Écriture qui lève (quota simulé) : pas d'exception remontée.
- `videHof` puis `lisHof` : liste vide.
- Aller-retour écriture / lecture : liste identique.

## Fini quand

- [ ] `hof.ts` et `storage.ts` sont complets, testés, sans aucune dépendance au
      DOM ni à un écran.
- [ ] Une partie sans aucun posé est refusée par les deux chemins.
- [ ] Un `localStorage` corrompu à la main ne fait lever aucune fonction.
- [ ] Le tri est arrondi à la seconde et un test prouve que la clé des points
      départage.
- [ ] La commande de vérification du README du plan passe au vert.
