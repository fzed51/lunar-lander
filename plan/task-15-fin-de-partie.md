---
id: T15
titre: Fin de partie — récapitulatif et saisie du trigramme à l'arcade
fichiers: packages/game/src/screens/gameover.ts, packages/game/src/trigramme.ts, packages/game/src/trigramme.test.ts, packages/game/src/design/ui.css
sensible: false
---

# T15 — Fin de partie et trigramme

## Objectif

Présenter le résultat de la partie, et si — et seulement si — il mérite une place
au hall of fame, faire saisir un trigramme à la manière d'une borne d'arcade.

## Ce qui existe

- `hof.ts` : `estQualifie`, `ajouteAuHof`, `EntreeHof`, `normaliseTrigramme`
  (T14). Cet écran les **importe directement** — il n'y a aucune injection de
  dépendance à mettre en place.
- `state.ts` : `Globals` avec `manchesReussies`, `ecarts`, `tempsDeVol`,
  `niveauDepart`, `statut` (T9).
- `score.ts` : `totalPoints` et `comparePartie` (T9, T14).
- `GestionnaireEcrans`, `Ecran`, la couche `#ui`, le snapshot d'entrée unique
  (T5).
- `design/ui.css` et la palette (T1, T13).

## À faire

1. Créer `packages/game/src/trigramme.ts` : la logique de saisie, pure et
   testable sans DOM.
   - `LETTRES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"` ;
   - `type Trigramme = { readonly lettres: readonly [number, number, number]; readonly position: 0 | 1 | 2 }`
     — trois index dans `LETTRES`, plus la position courante ;
   - `trigrammeInitial(): Trigramme` — `AAA`, position 0 ;
   - `monte(t)` / `descend(t)` — font défiler la lettre courante, **en boucle**
     (Z puis A) ;
   - `gauche(t)` / `droite(t)` — changent de position, **bornées** ;
   - `texte(t): string` — les trois lettres.
2. Créer `packages/game/src/screens/gameover.ts`.
   - `entre(params)` reçoit le résultat de la partie : manches réussies, total de
     points, temps de vol, niveau de départ, et si la partie s'est terminée par
     un abandon (Échap) ou par épuisement des vies.
   - **Récapitulatif** toujours affiché : `MANCHES REUSSIES n`,
     `TOTAL nnn POINTS`, `TEMPS DE VOL m:ss`, `NIVEAU x`, et le rappel
     `MOINS DE POINTS = MIEUX`.
   - Appelle `estQualifie(stockage, resultat)`.
   - Si qualifié : bloc de saisie du trigramme, trois lettres, curseur sous la
     position courante, invite
     `HAUT BAS LETTRE — GAUCHE DROITE POSITION — ENTREE VALIDER`. `Entrée` appelle
     `ajouteAuHof`, puis demande la transition vers `"hof"` en passant l'entrée
     enregistrée pour qu'elle y soit mise en évidence.
   - Si non qualifié : invite `ENTREE — RETOUR ACCUEIL`, aucune saisie.
   - `sort()` vide `#ui` et ne laisse aucun état de saisie.
3. Ajouter au style `ui.css` le bloc de saisie : lettres en 32 px, curseur en
   `accent`, reste en `blanc` et `grisPale`.

## Gardes et cas limites

- **Zéro manche réussie = jamais au hall of fame.** Une partie où le joueur ne
  s'est jamais posé n'est pas classable, quel que soit son temps de vol : la
  garde est dans `estQualifie` (T14), et cet écran ne la contourne pas. Test avec
  un temps de vol volontairement énorme.
- **Un abandon (Échap) est classable comme un dernier crash**, s'il reste au
  moins un posé : le temps de vol ne tourne pas en pause, donc il n'y a pas
  d'exploit à abandonner pour figer un chrono.
- **Défilement des lettres en boucle**, mais **positions bornées** : les deux
  comportements sont différents et volontaires. `droite` en position 2 ne ramène
  pas à 0, sinon on valide par accident.
- **Entrée maintenue depuis l'écran de jeu** : la validation ne doit pas partir
  sur l'appui qui a servi ailleurs. Front montant, sur le snapshot partagé.
- **Trigramme non modifié** : `AAA` est valable, on ne force personne à changer.
- **Aucun caractère hors `A`–`Z`** ne peut sortir de `texte()` : les index
  restent dans `[0, 25]` après des centaines de `monte`.
- **Une seule écriture** : `Entrée` enfoncé deux fois ne doit pas insérer deux
  entrées. La transition demandée au premier appui protège le second, et un test
  le vérifie.
- `totalPoints` d'une partie sans écart vaut 0 — ce zéro ne doit pas passer pour
  un score parfait : il est écarté par la garde « zéro manche réussie ».

## Tests attendus

- `trigrammeInitial()` vaut `AAA`, position 0.
- `monte` 26 fois sur la première lettre revient à `A` ; `descend` depuis `A`
  donne `Z`.
- `gauche` en position 0 reste en 0 ; `droite` en position 2 reste en 2.
- `texte` ne rend que des majuscules après 1 000 `monte` (tirage à graine fixée).
- `manchesReussies === 0` → non qualifié, même avec 9 999 s de vol ; aucun bloc
  de saisie affiché.
- `manchesReussies === 1` → soumis au classement.
- Deux `Entrée` consécutifs n'écrivent qu'une entrée.
- Après `sort()`, `#ui` est vide et les flèches ne modifient plus le trigramme.

## Fini quand

- [ ] Le récapitulatif affiche manches, total, temps, niveau.
- [ ] Une partie sans aucun posé ne propose jamais de saisir un trigramme.
- [ ] La saisie fonctionne aux quatre flèches, validation à Entrée, une seule
      écriture.
- [ ] La commande de vérification du README du plan passe au vert.
