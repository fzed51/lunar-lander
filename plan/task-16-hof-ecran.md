---
id: T16
titre: Écran du hall of fame — tableau des 100 parties, remise à zéro
fichiers: packages/game/src/screens/hof.ts, packages/game/src/design/ui.css
sensible: false
---

# T16 — Écran du hall of fame

## Objectif

Présenter les 100 meilleures parties sur le même fond animé que l'accueil, avec
défilement au clavier et remise à zéro confirmée.

## Ce qui existe

- `hof.ts` : `lisHof`, `videHof`, `TAILLE_HOF`, `EntreeHof` (T14).
- `render/background.ts` : `dessineFond`, réutilisé tel quel (T13).
- `GestionnaireEcrans`, `Ecran`, la couche `#ui`, le snapshot d'entrée unique
  (T5).
- `design/ui.css` (T13).
- L'écran de fin de partie (T15) demande la transition vers `"hof"` en passant
  l'entrée qui vient d'être enregistrée.

## À faire

1. Créer `packages/game/src/screens/hof.ts`.
   - Fond animé identique à l'accueil (`dessineFond` sur `#fond`).
   - Tableau DOM : rang, trigramme, temps de vol, points, manches, niveau, date.
     Colonnes à largeur fixe, alignées.
   - Défilement au clavier : ↑ / ↓ ligne à ligne, ← / → page par page. Une
     fenêtre de lignes visibles, pas 100 lignes empilées hors écran.
   - Mise en évidence en `accent` de l'entrée passée en paramètre, quand on
     arrive depuis l'écran de fin ; défilement automatique jusqu'à elle.
   - `R` demande la remise à zéro, avec confirmation explicite
     (`R A NOUVEAU POUR CONFIRMER — ECHAP POUR ANNULER`), puis `videHof`.
   - `Échap` ou `Entrée` revient à l'accueil.
   - Liste vide : `AUCUNE PARTIE ENREGISTREE`.
   - `sort()` vide `#ui` et ne laisse aucun état de confirmation en attente.
2. Ajouter les styles de tableau dans `ui.css`, tokens de T1 uniquement.
3. Ajouter les touches `R` (commande `raz`) et le défilement à
   `input/mapping.ts` si elles n'y sont pas encore.

## Gardes et cas limites

- **Trigramme affiché par `textContent`**, jamais `innerHTML` : c'est la seule
  donnée du jeu qui vienne d'un tiers (le `localStorage` est éditable à la main),
  et elle finit dans le DOM.
- **Confirmation de la remise à zéro** : un seul appui sur `R` ne doit jamais
  effacer 100 entrées. La confirmation en attente **expire** au changement
  d'écran — sinon un `R` laissé pendant depuis la visite précédente effacerait la
  liste au retour.
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
- [ ] La commande de vérification du README du plan passe au vert.
