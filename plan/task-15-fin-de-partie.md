---
id: T15
titre: Fin de partie — récapitulatif et saisie du trigramme à l'arcade
fichiers: packages/game/src/screens/gameover.ts, packages/game/src/screens/gameover.test.ts, packages/game/src/trigramme.ts, packages/game/src/trigramme.test.ts, packages/game/src/design/ui.css, packages/game/src/main.ts
sensible: false
---

# T15 — Fin de partie et trigramme

## Objectif

Présenter le résultat de la partie, et si — et seulement si — il mérite une place
au hall of fame, faire saisir un trigramme à la manière d'une borne d'arcade.

## Ce qui existe

- `hof.ts` : `estQualifie`, `ajouteAuHof`, `EntreeHof`, `normaliseTrigramme`
  (T14). Cet écran importe directement les **fonctions** de `hof.ts` — il n'y a
  aucune injection de dépendance à mettre en place pour elles. Ce n'est **pas**
  vrai pour l'instance de `Stockage` (voir §À faire point 2) : elle est
  fabriquée une seule fois dans `main.ts` et reçue en option, pas recréée ici.
- `state.ts` : `Globals` avec `manchesReussies`, `ecarts`, `tempsDeVol`,
  `niveauDepart`, `statut` (T9).
- `score.ts` : `totalPoints` et `comparePartie` (T9, T14).
- `GestionnaireEcrans`, `Ecran`, la couche `#ui`, le snapshot d'entrée unique
  (T5).
- `storage.ts` : `Stockage`, `stockageDisponible` (T14).
- `render/hud.ts` : `formateTemps` (T11), réutilisée telle quelle pour le
  format `m:ss` du bilan plutôt que d'en réécrire une seconde version qui
  finirait par diverger du tableau de bord.
- `main.ts` : construit `ui`, `fond`, `surface`, `gestionnaire`, et enregistre
  aujourd'hui `bouchonDom("fin", () => ({ nom: "hof" }))` à la place de cet
  écran — c'est ce bouchon que cette tâche retire.
- `design/ui.css` et la palette (T1, T13).

## À faire

1. Créer `packages/game/src/trigramme.ts` : la logique de saisie, pure et
   testable sans DOM.
   - `LETTRES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"` ;
   - `interface Trigramme { readonly lettres: readonly [number, number, number]; readonly position: PositionTrigramme }`
     — trois index dans `LETTRES`, plus la position courante. **Signature
     réelle** : `Trigramme` est une `interface`, pas un alias `type` (même
     forme, exportée différemment), et le type de la position est nommé et
     exporté à part — `type PositionTrigramme = 0 | 1 | 2` — parce que
     `bornePosition` en a besoin comme type de retour ;
   - `trigrammeInitial(): Trigramme` — `AAA`, position 0 ;
   - `monte(t)` / `descend(t)` — font défiler la lettre courante, **en boucle**
     (Z puis A) ;
   - `gauche(t)` / `droite(t)` — changent de position, **bornées** ;
   - `texte(t): string` — les trois lettres ;
   - `lettreDe(index: number): string` — **ajoutée, non prévue par cette
     fiche à l'écriture** : la lettre d'un seul index, avec le même repli sur
     `A` que `texte`. `gameover.ts` en a besoin pour peindre une case de la
     saisie sans reformater tout le texte à chaque frappe.
2. Créer `packages/game/src/screens/gameover.ts`.
   - `creeEcranFin(options: OptionsEcranFin): Ecran`, avec
     `interface OptionsEcranFin { readonly hote: HTMLElement; readonly stockage: Stockage }`
     — le magasin est **reçu**, jamais recréé ni redemandé via
     `stockageDisponible()` à l'intérieur de l'écran : c'est `main.ts` qui
     appelle `stockageDisponible()` une fois (voir point 4) et distribue la
     même instance à cet écran et à celui du hall of fame (T16). Sans ça, en
     navigation privée, cet écran écrirait dans un repli mémoire que l'écran du
     hall of fame ne lit pas.
   - `entre(t)` reçoit la variante `{ nom: "fin"; params: ResultatPartie }` de
     `Transition`, enrichie par T9 : manches réussies, total de points, temps de
     vol, niveau de départ, et si la partie s'est terminée par un abandon
     (Échap) ou par épuisement des vies.
   - Un **titre**, non prévu à l'écriture de cette fiche mais nécessaire pour
     donner un usage au champ `abandonnee` de `ResultatPartie` : `FIN DE
     PARTIE` par défaut, `ABANDON` si `resultat.abandonnee`. Sans lui, l'écran
     n'avait aucune en-tête et `abandonnee` restait un champ mort — un abandon
     reste classable exactement comme un dernier crash, l'en-tête ne change
     que le mot affiché.
   - **Récapitulatif** toujours affiché, sur **deux lignes** et non quatre —
     `MANCHES REUSSIES n — TOTAL nnn POINTS` puis
     `TEMPS DE VOL m:ss — NIVEAU x`, et le rappel `MOINS DE POINTS = MIEUX` en
     troisième ligne d'aide. **Contrainte de hauteur, constatée après revue** :
     quatre lignes de 16 px, plus le titre, le bloc de saisie et les deux
     lignes d'aide, dépassaient les 180 px de la scène au facteur
     d'agrandissement 1 (le budget de `docs/design-system.md` — « tout écran
     en DOM tient dans 320 × 180 px CSS »). Deux lignes ramènent l'écran sous
     ce budget ; `gameover.test.ts` en fixe la hauteur totale.
   - `NIVEAU x` affiche l'**étiquette** du niveau (`FACILE` / `MOYEN` /
     `DIFFICILE`), jamais le chiffre brut : `NIVEAUX` vaut `{ facile: 0, moyen:
     1, difficile: 2 }`, et « NIVEAU 0 » ne veut rien dire pour un joueur. La
     table d'étiquettes lit `NIVEAUX`, elle ne recopie pas les littéraux, et
     retombe sur la valeur brute si elle ne correspond à aucun niveau connu.
     Cette fonction (`etiquetteNiveau`) est **exportée** : l'écran du hall of
     fame (T16) la réutilise pour sa colonne `NIVEAU`, plutôt que de tenir une
     seconde table qui finirait par diverger.
   - Appelle `estQualifie(stockage, resultat)`.
   - Si qualifié : bloc de saisie du trigramme, trois lettres, curseur sous la
     position courante, invite
     `HAUT BAS LETTRE — GAUCHE DROITE POSITION — ENTREE VALIDER`. `Entrée`
     appelle `ajouteAuHof`, qui **rend la liste à jour** — cette valeur de
     retour est **conservée**, pas jetée : la transition notée est
     `{ nom: "hof", params: { misEnAvant: entree, liste } }`, `liste` étant
     exactement ce que `ajouteAuHof` vient de rendre. **Correctif décidé après
     revue** : un premier jet ignorait cette valeur de retour et laissait
     l'écran du hall of fame refaire un `lisHof(stockage)` à l'entrée ; en cas
     de divergence entre l'écriture et la relecture (quota qui bascule entre
     les deux appels, sonde de disponibilité qui valide un `localStorage`
     presque plein alors que l'écriture réelle pèse ~15 ko), le joueur validait
     son trigramme et découvrait un classement où sa partie n'apparaît pas,
     sans le moindre message. Porter la liste dans la transition élimine cette
     seconde lecture pour le cas qui vient de l'écran de fin.
   - Si non qualifié : invite `ENTREE — RETOUR ACCUEIL`, aucune saisie.
   - `sort()` vide `#ui`, ne laisse aucun état de saisie, et **remet la demande
     de transition à `null`** : sinon un retour ultérieur sur cet écran
     renverrait au hall of fame tout seul.
3. Ajouter au style `ui.css` le bloc de saisie : lettres en 32 px, curseur en
   `accent`, reste en `blanc` et `grisPale`.
4. **Rebrancher `main.ts`** : construire l'instance de `Stockage`
   (`const stockage = stockageDisponible();`), remplacer
   `.enregistre(bouchonDom("fin", () => ({ nom: "hof" })))` par
   `.enregistre(creeEcranFin({ hote: ui, stockage }))`, et supprimer la ligne du
   bouchon. Le bouchon `"hof"` reste en place pour l'instant (T16 le retire) :
   ne pas le toucher ici. Sans cette étape, `gameover.ts` est testé mais
   injoignable en jeu — le bouchon DOM `"fin"` continue de s'afficher.

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
- [ ] `main.ts` enregistre `creeEcranFin` à la place du bouchon `"fin"` — le
      bouchon DOM ne s'affiche plus jamais en fin de partie.
- [ ] La commande de vérification du README du plan passe au vert.
- [ ] **Non fait dans cet environnement** : le contrôle à l'œil via `yarn dev`.
      Le récapitulatif a été redécoupé sur deux lignes précisément pour tenir
      dans les 180 px de la scène au facteur 1 (voir le point 2 ci-dessus), mais
      la mesure exacte n'a été vérifiée que par le budget calculé et
      `gameover.test.ts`, jamais dans un navigateur réel. À faire par un humain
      avant la PR.
