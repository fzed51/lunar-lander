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

- `score.ts` : `comparePartie` — temps de vol total **décroissant** (déjà
  **arrondi à la seconde**, `Math.round` posé à T9), puis total de points
  **croissant** (T9). **Rapport (run D) : `score.ts` n'a été touché par
  aucune ligne.** Le point 2 du « À faire » ci-dessous demandait de compléter
  ce fichier avec l'arrondi ; c'était déjà fait en T9 (`score.ts:42-45`), et
  `score.test.ts` couvre déjà l'arrondi et le départage par les points. La
  tâche n'avait donc rien à y ajouter — ce n'est plus une chose à faire, mais
  un constat.
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
     testé par une écriture-lecture réelle sur une clé jetable. **Mémorise son
     repli** : si `localStorage` est indisponible, la fonction crée un seul
     `stockageMemoire()` la première fois et rend **cette même instance** à
     chaque appel suivant dans le processus. Sans ça, deux appelants (l'écran de
     fin et l'écran du hall of fame) obtiendraient chacun leur propre magasin en
     mémoire, invisible l'un pour l'autre. `main.ts` appelle
     `stockageDisponible()` **une seule fois** et passe l'instance obtenue en
     option aux deux écrans (T15, T16) — ce n'est pas à chaque écran de
     rappeler `stockageDisponible()` de son côté.
2. ~~Compléter `score.ts` : `comparePartie` compare le temps de vol **arrondi à
   la seconde** (`Math.round`), puis le total de points croissant.~~ **Fait
   par avance, en T9** : `comparePartie` arrondit déjà les deux temps de vol
   avant de les comparer, et bascule sur les points en cas d'égalité. Rien à
   écrire ici. Le temps exact reste stocké et affiché ; seul le **tri** est
   arrondi. Sans cet arrondi, deux sommes de pas de temps flottants ne sont
   jamais égales et la seconde clé de tri ne sert jamais à rien.
3. Créer `packages/game/src/hof.ts` :
   - `CLE_HOF = "lem.hof.v1"` et `TAILLE_HOF = 100` ;
   - `type EntreeHof = { trigramme: string; points: number; tempsDeVol: number; manchesReussies: number; niveauDepart: number; date: string }` ;
   - `normaliseTrigramme(brut: unknown): string` — exactement 3 caractères
     `A`–`Z`, tout le reste remplacé par `A` ;
   - `entreeValide(brut: unknown): brut is EntreeHof` — garde de type complète.
     **Signature réelle** : elle n'impose **rien** sur la forme du
     `trigramme` (toute chaîne passe) — c'est `lisHof` qui normalise ensuite
     chaque entrée lue, pas `entreeValide` qui la rejette. Un trigramme
     strictement validé par `entreeValide` (`/^[A-Z]{3}$/`) jetterait toute la
     performance d'un joueur pour une seule lettre éditée à la main dans le
     stockage. En revanche `entreeValide` **exige** `manchesReussies` entier
     `>= 1` : une ligne à 0 manche fabriquée à la main dans le stockage
     contournerait sinon la garde « zéro posé, jamais classé » à la lecture, et
     c'est le seul point où `entreeValide` tient une règle stricte ;
   - `CandidatHof` : type exporté, **non prévu par cette fiche à l'écriture**,
     ajouté pour donner un type à l'argument `resultat` d'`estQualifie` ci-dessous
     — `interface CandidatHof extends CleClassement { readonly manchesReussies:
     number }`. Structural, pas nominal : `ResultatPartie` (T9) et `EntreeHof`
     le satisfont tous les deux sans conversion, et `hof.ts` ne dépend donc pas
     de `state.ts` ;
   - `lisHof(stockage): readonly EntreeHof[]` — lecture, validation, tri,
     **puis troncature à `TAILLE_HOF`** : c'est la fonction que tout appelant
     (dont `estQualifie`) utilise pour connaître la liste, elle ne doit donc
     jamais rendre plus de 100 entrées même si le stockage sous-jacent en
     contient davantage (édition manuelle, version antérieure du format) ;
   - `estQualifie(stockage, resultat: CandidatHof): boolean` — `false` si
     `manchesReussies < 1` ; sinon, à partir du résultat **déjà tronqué** de
     `lisHof`, `true` si la liste compte moins de `TAILLE_HOF` entrées, ou si
     l'entrée bat `liste[TAILLE_HOF - 1]` selon `comparePartie` — jamais « la
     dernière » d'une liste non bornée ;
   - `ajouteAuHof(stockage, entree): readonly EntreeHof[]` — insère, trie,
     tronque à `TAILLE_HOF`, écrit, rend la liste ;
   - `videHof(stockage): void`.
4. **Enrichir** la variante `{ nom: "hof" }` de `Transition` (T5) avec
   `params?: { misEnAvant: EntreeHof }` : la variante existe déjà, on lui ajoute
   sa charge utile maintenant que `EntreeHof` existe. Le champ est optionnel
   parce qu'on ouvre aussi le hall of fame depuis l'accueil, sans entrée à
   mettre en avant ; l'écran (T16) traite explicitement le cas absent, il ne le
   force pas par un cast.
   **Signature réelle, complétée en T15** :
   `params?: { misEnAvant: EntreeHof; liste?: readonly EntreeHof[] }`. Le champ
   `liste` a été ajouté après revue de T15 : c'est la valeur de retour
   d'`ajouteAuHof`, portée jusqu'à l'écran du hall of fame pour qu'il n'ait pas
   à relire le stockage (voir task-15-fin-de-partie.md et
   task-16-hof-ecran.md) — sans quoi une divergence entre l'écriture et une
   relecture pouvait faire disparaître, sans message, la partie que le joueur
   vient de valider.

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
- **Troncature à la lecture, pas seulement à l'écriture** : `lisHof` tronque
  elle-même à `TAILLE_HOF` après le tri — jamais plus de 100 entrées rendues à
  un appelant, y compris depuis un stockage qui en contenait 300. `ajouteAuHof`
  tronque aussi avant d'écrire, mais c'est `lisHof` qui protège tout le monde,
  y compris `estQualifie` : sans cette troncature en lecture, `estQualifie`
  comparerait à la 300ᵉ entrée d'un stockage de 300, pas à la 100ᵉ, et
  laisserait entrer une partie qui ne le mérite pas.
- **Tri stable** : deux parties strictement identiques ne changent pas d'ordre
  entre deux lectures.
- **Clé versionnée** (`lem.hof.v1`) : un futur changement de format n'écrase pas
  les données d'une autre version.
- Arrondi du tri : `59.4 s` et `59.6 s` ne sont **pas** égaux (59 contre 60) ;
  `59.4 s` et `59.5 s` le sont. Le comportement au demi-point est celui de
  `Math.round`, et c'est écrit.

## Tests attendus

> Rapport (run D) : les tests de `storage.ts` vivent dans `hof.test.ts`, pas
> dans un `storage.test.ts` séparé — cette fiche ne liste qu'un seul fichier
> de test, celui-ci le respecte plutôt que d'en ajouter un.

- `estQualifie` : faux avec `manchesReussies: 0` et un temps de vol de
  99 999 s ; vrai sur une liste vide avec une manche réussie ; faux quand la
  liste est pleine et que l'entrée est moins bonne que la centième.
- `ajouteAuHof` refuse aussi une entrée à zéro manche réussie appelée
  directement.
- Tri : temps de vol le plus long en tête ; **à temps arrondi égal** (120,2 s et
  119,9 s), les points les plus bas passent devant — c'est le test qui prouve que
  la seconde clé est vivante.
- Troncature à 100 depuis un stockage qui en contient 300, testée **sur
  `lisHof` elle-même** (`lisHof(stockage300).length === 100`) et pas seulement
  sur `ajouteAuHof` : le test sur `ajouteAuHof` seul ne prouve rien sur ce que
  `estQualifie` voit.
- `estQualifie` sur un stockage de 300 entrées : qualifié seulement si l'entrée
  bat la 100ᵉ après tri, pas la 300ᵉ.
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
