/**
 * Écran de fin de partie : le bilan de la partie qui vient de finir, et — si
 * elle mérite une place — la saisie du trigramme à la manière d'une borne
 * d'arcade.
 *
 * ## Ce que cet écran possède, et ce qu'il reçoit
 *
 * Il reçoit son hôte HTML et son `Stockage`. Le magasin est **fabriqué une seule
 * fois par `main.ts`** et distribué : cet écran ne rappelle jamais
 * `stockageDisponible()` de son côté. En navigation privée, un second appel
 * rendrait certes le même repli mémorisé, mais la discipline ne coûte rien et
 * elle survit à une évolution de `storage.ts` — sans elle, cet écran écrirait
 * dans un magasin que l'écran du classement ne lirait pas.
 *
 * Il ne pose aucun écouteur clavier : il lit le snapshot que le gestionnaire lui
 * passe, comme tous les écrans.
 *
 * ## Ce que cet écran ne décide pas
 *
 * La qualification est l'affaire de `hof.ts` : « au moins une manche réussie »
 * et « meilleur que la centième » sont dans `estQualifie`, et cet écran ne les
 * recopie pas. Une partie sans le moindre posé n'affiche donc aucun bloc de
 * saisie, quel que soit son temps de vol.
 *
 * ## Rien à dessiner
 *
 * Cet écran est entièrement en HTML. Il ne reçoit pas de `Renderer` et son
 * `rend()` ne fait rien : l'écran de jeu efface la couche `#game` dans son
 * `sort()`, donc le fond animé de `#fond` reste visible sous le bilan.
 */

import type { InputSnapshot } from "@lem/engine";
import { NIVEAUX } from "../constants.ts";
import { ajouteAuHof, estQualifie, type EntreeHof } from "../hof.ts";
import { formateTemps } from "../render/hud.ts";
import type { ResultatPartie } from "../state.ts";
import type { Stockage } from "../storage.ts";
import {
  descend,
  droite,
  gauche,
  lettreDe,
  monte,
  texte,
  trigrammeInitial,
  type Trigramme,
} from "../trigramme.ts";
import type { Command } from "../types.ts";
import type { Ecran, Transition } from "./types.ts";

/** Chiffres du total de points, zéros de tête compris. Un total plus grand n'est pas tronqué. */
const CHIFFRES_POINTS = 3;

/** Les lignes fixes de l'écran. */
const LIGNES = {
  /** Deux fins possibles, deux titres : la partie perdue, et celle qu'on quitte. */
  titre: { epuisement: "FIN DE PARTIE", abandon: "ABANDON" },
  /** Le rappel de la règle du score, qui surprend toujours à la première partie. */
  rappel: "MOINS DE POINTS = MIEUX",
  saisie: "HAUT BAS LETTRE — GAUCHE DROITE POSITION — ENTREE VALIDER",
  retour: "ENTREE — RETOUR ACCUEIL",
} as const;

/**
 * Étiquette des trois niveaux de départ. Les valeurs viennent de `NIVEAUX`,
 * jamais recopiées : `NIVEAU 0` ne veut rien dire pour un joueur, et une table
 * indexée par un littéral divergerait le jour où les niveaux changent de valeur.
 */
const ETIQUETTES_NIVEAU: readonly (readonly [number, string])[] = [
  [NIVEAUX.facile, "FACILE"],
  [NIVEAUX.moyen, "MOYEN"],
  [NIVEAUX.difficile, "DIFFICILE"],
];

export interface OptionsEcranFin {
  /** Hôte des nœuds HTML de l'écran, créé par `main.ts`. */
  readonly hote: HTMLElement;
  /** Magasin du hall of fame, **reçu** et jamais recréé ici. */
  readonly stockage: Stockage;
}

/** Élément de paragraphe, classe et texte posés d'un coup. */
function paragraphe(classe: string, contenu: string): HTMLElement {
  const p = document.createElement("p");
  p.className = classe;
  p.textContent = contenu;
  return p;
}

/**
 * Nom du niveau de départ, ou sa valeur brute si elle ne correspond à aucun.
 *
 * Exportée pour l'écran du hall of fame, qui affiche le même niveau dans sa
 * colonne : deux tables d'étiquettes finiraient par diverger, et le classement
 * nommerait alors autrement le niveau que le bilan qui vient de s'afficher.
 */
export function etiquetteNiveau(niveau: number): string {
  const trouve = ETIQUETTES_NIVEAU.find(([valeur]) => valeur === niveau);
  return trouve ? trouve[1] : String(niveau);
}

/** Le total de points, à largeur fixe. */
function formatePoints(points: number): string {
  const entier = Math.max(0, Math.round(points));
  return String(entier).padStart(CHIFFRES_POINTS, "0");
}

/**
 * Les deux lignes du récapitulatif, toujours affichées.
 *
 * Deux lignes et non quatre : à 16 px chacune plus les gouttières de `.ecran`,
 * quatre lignes distinctes poussent le bloc de saisie hors des 180 px de la
 * scène au facteur d'agrandissement 1 (voir le budget de hauteur testé dans
 * `gameover.test.ts`). Regrouper deux mesures par ligne, comme `LIGNES.saisie`
 * regroupe déjà ses trois consignes sur une seule, tient le budget sans rien
 * abréger.
 */
function lignesRecapitulatif(resultat: ResultatPartie): readonly string[] {
  return [
    `MANCHES REUSSIES ${String(resultat.manchesReussies)} — TOTAL ${formatePoints(resultat.points)} POINTS`,
    `TEMPS DE VOL ${formateTemps(resultat.tempsDeVol)} — NIVEAU ${etiquetteNiveau(resultat.niveauDepart)}`,
  ];
}

/** Le bloc de saisie monté, et les trois cases dont l'affichage suit l'état. */
interface Saisie {
  readonly racine: HTMLElement;
  readonly cases: readonly HTMLElement[];
  readonly lettres: readonly HTMLElement[];
}

/**
 * Construit le bloc des trois lettres. Chaque case porte sa lettre et un curseur
 * placé **dessous** : c'est le curseur qui dit où l'on écrit, la lettre courante
 * n'est ni clignotante ni de couleur différente — un caractère qui change de
 * teinte se confond avec le retour d'une validation.
 */
function construitSaisie(): Saisie {
  const racine = document.createElement("ul");
  racine.className = "trigramme";
  const cases: HTMLElement[] = [];
  const lettres: HTMLElement[] = [];

  for (let i = 0; i < 3; i++) {
    const item = document.createElement("li");
    item.className = "trigramme-case";
    const lettre = document.createElement("span");
    lettre.className = "trigramme-lettre";
    const curseur = document.createElement("span");
    curseur.className = "trigramme-curseur";
    item.append(lettre, curseur);
    racine.append(item);
    cases.push(item);
    lettres.push(lettre);
  }
  return { racine, cases, lettres };
}

/** Le bloc HTML de l'écran, et sa saisie quand la partie est classable. */
interface Bloc {
  readonly racine: HTMLElement;
  readonly saisie: Saisie | null;
}

/**
 * Construit le bloc de l'écran. Un bloc neuf à chaque activation, comme à
 * l'accueil : `sort()` retire une racine et il ne reste rien à remettre à zéro.
 */
function construitBloc(resultat: ResultatPartie, qualifie: boolean): Bloc {
  const racine = document.createElement("div");
  racine.className = "ecran ecran-fin";
  racine.append(
    paragraphe(
      "ecran-titre",
      resultat.abandonnee ? LIGNES.titre.abandon : LIGNES.titre.epuisement,
    ),
    ...lignesRecapitulatif(resultat).map((ligne) =>
      paragraphe("ecran-ligne", ligne),
    ),
    paragraphe("ecran-aide", LIGNES.rappel),
  );

  const saisie = qualifie ? construitSaisie() : null;
  if (saisie) {
    racine.append(saisie.racine, paragraphe("ecran-aide", LIGNES.saisie));
  } else {
    racine.append(paragraphe("ecran-invite", LIGNES.retour));
  }
  return { racine, saisie };
}

/** Crée l'écran de fin de partie. Une seule instance : elle est réactivée par nom. */
export function creeEcranFin(options: OptionsEcranFin): Ecran {
  let resultat: ResultatPartie | null = null;
  let qualifie = false;
  /** Remis à `AAA` à chaque activation : la saisie d'une partie n'appartient qu'à elle. */
  let trigramme: Trigramme = trigrammeInitial();
  let bloc: Bloc | null = null;
  let demande: Transition | null = null;

  /** Reporte l'état de la saisie dans le DOM. Sans effet si le bloc n'est pas monté. */
  const majSaisie = (): void => {
    const saisie = bloc?.saisie;
    if (!saisie) return;
    for (const [i, lettre] of saisie.lettres.entries()) {
      lettre.textContent = lettreDe(trigramme.lettres[i] ?? 0);
    }
    for (const [i, item] of saisie.cases.entries()) {
      const actif = i === trigramme.position;
      item.classList.toggle("est-actif", actif);
      item.setAttribute("aria-current", actif ? "true" : "false");
    }
  };

  /** Applique une opération de saisie et rafraîchit l'affichage. */
  const applique = (operation: (t: Trigramme) => Trigramme): void => {
    trigramme = operation(trigramme);
    majSaisie();
  };

  /**
   * Enregistre la partie et part vers le classement.
   *
   * L'entrée transmise à l'écran du hall of fame est celle qui vient d'être
   * écrite : c'est elle qu'il met en évidence dans la liste. La liste, elle,
   * est celle que `ajouteAuHof` vient de rendre — pas une relecture du
   * stockage : voir le commentaire de `Transition["hof"]` dans `./types.ts`.
   */
  const valide = (courant: ResultatPartie): void => {
    const entree: EntreeHof = {
      trigramme: texte(trigramme),
      points: courant.points,
      tempsDeVol: courant.tempsDeVol,
      manchesReussies: courant.manchesReussies,
      niveauDepart: courant.niveauDepart,
      date: new Date().toISOString(),
    };
    const liste = ajouteAuHof(options.stockage, entree);
    demande = { nom: "hof", params: { misEnAvant: entree, liste } };
  };

  return {
    nom: "fin",

    entre(t: Transition): void {
      if (t.nom !== "fin") return;
      // Une demande jamais appliquée ne doit pas ressortir ici : l'écran
      // filerait au classement dès son premier tick.
      demande = null;
      resultat = t.params;
      qualifie = estQualifie(options.stockage, t.params);
      trigramme = trigrammeInitial();
      bloc = construitBloc(t.params, qualifie);
      majSaisie();
      options.hote.append(bloc.racine);
    },

    sort(): void {
      bloc?.racine.remove();
      bloc = null;
      resultat = null;
      qualifie = false;
      // Aucun état de saisie ne survit : la partie suivante repart de `AAA`.
      trigramme = trigrammeInitial();
      demande = null;
    },

    tick(_dt: number, input: InputSnapshot<Command>): void {
      const courant = resultat;
      // Écran non monté : franchement inerte entre son `sort()` et son `entre()`
      // suivant, y compris pour les flèches de la saisie.
      if (!bloc || !courant) return;
      // Une seule demande, donc une seule écriture : le second appui sur Entrée
      // n'insère pas une deuxième fois la même partie.
      if (demande) return;

      if (!qualifie) {
        // Front montant, jamais l'état enfoncé : une touche Entrée maintenue
        // depuis l'écran de jeu ne doit pas traverser cet écran d'un coup.
        if (input.justPressed("confirm")) demande = { nom: "accueil" };
        return;
      }

      if (input.justPressed("throttle-up")) applique(monte);
      if (input.justPressed("throttle-down")) applique(descend);
      if (input.justPressed("tilt-left")) applique(gauche);
      if (input.justPressed("tilt-right")) applique(droite);
      // `AAA` est un trigramme valable : on ne force personne à changer de
      // lettre avant de valider.
      if (input.justPressed("confirm")) valide(courant);
    },

    rend(): void {
      // Écran en HTML : rien à peindre. La couche `#game` a été effacée par le
      // `sort()` de l'écran de jeu, le fond animé reste visible dessous.
    },

    prendTransition(): Transition | null {
      const t = demande;
      demande = null;
      return t;
    },
  };
}
