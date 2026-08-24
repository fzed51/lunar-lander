/**
 * Écran du hall of fame : les cent meilleures parties, en tableau, sur le fond
 * animé de l'accueil.
 *
 * ## Ce que cet écran possède, et ce qu'il reçoit
 *
 * Il reçoit son hôte HTML, son `Renderer` — celui de la couche `#fond` — et son
 * `Stockage`. Le magasin est **fabriqué une seule fois par `main.ts`** et
 * distribué : cet écran ne rappelle jamais `stockageDisponible()` de son côté.
 * En navigation privée, un second appel rendrait le repli mémorisé, donc le bon
 * magasin, mais la discipline survit à une évolution de `storage.ts` — sans
 * elle, cet écran lirait un magasin où l'écran de fin n'a rien écrit.
 *
 * Il ne pose aucun écouteur clavier : il lit le snapshot que le gestionnaire lui
 * passe, comme tous les écrans.
 *
 * ## Une fenêtre de lignes, pas cent lignes empilées
 *
 * Le tableau ne monte que `LIGNES_VISIBLES` lignes dans le DOM, et le
 * défilement **réécrit** leur contenu. Cent lignes posées d'un coup dans une
 * boîte de 180 px seraient à 90 % hors du cadre, et le défilement deviendrait
 * une affaire de position CSS plutôt qu'un simple index.
 *
 * ## Tout se lit au front montant
 *
 * `raz`, `back`, `confirm` et les quatre commandes de défilement passent toutes
 * par `justPressed`. Une commande lue à `isActive` resterait vraie sur toutes les
 * images où la touche est enfoncée : la liste défilerait à la vitesse de
 * l'écran, et surtout un appui un peu long sur `R` vaudrait confirmation de la
 * remise à zéro 16 ms après l'avoir demandée — avant même que le message ait pu
 * être lu.
 *
 * ## Ce qui sort du stockage n'est pas de confiance
 *
 * Le `localStorage` s'édite à la main. `lisHof` valide et normalise déjà tout ce
 * qu'il rend ; cet écran ajoute la seule garde qui le concerne, celle du DOM :
 * chaque cellule est posée par `textContent`, jamais par `innerHTML`. Et une
 * date que `Date` ne sait pas lire s'affiche en tirets, pas en `Invalid Date`.
 */

import { createRng, type InputSnapshot, type Renderer } from "@lem/engine";
import { lisHof, videHof, type EntreeHof } from "../hof.ts";
import { dessineFond, GRAINE_CIEL } from "../render/background.ts";
import { formateTemps } from "../render/hud.ts";
import { genereEtoiles, type Etoile } from "../render/stars.ts";
import type { Stockage } from "../storage.ts";
import type { Command } from "../types.ts";
import { etiquetteNiveau } from "./gameover.ts";
import type { Ecran, Transition } from "./types.ts";

/**
 * Nombre de lignes montées dans le tableau, en-tête non comprise. Neuf lignes de
 * 10 px, plus l'en-tête, le titre et les deux lignes de pied tiennent dans les
 * 180 px de la scène ; une de plus déborderait du cadre.
 *
 * C'est aussi la hauteur d'une page : `←` et `→` sautent d'une fenêtre entière.
 */
export const LIGNES_VISIBLES = 9;

/** Les lignes fixes de l'écran. */
const LIGNES = {
  titre: "HALL OF FAME",
  vide: "AUCUNE PARTIE ENREGISTREE",
  defilement: "HAUT BAS — LIGNE     GAUCHE DROITE — PAGE",
  touches: "R — REMISE A ZERO     ECHAP — RETOUR",
  confirmation: "R A NOUVEAU POUR CONFIRMER — ECHAP POUR ANNULER",
} as const;

/**
 * Date illisible : le champ est une chaîne libre du stockage, et rien ne promet
 * qu'elle vienne d'un `toISOString`. Dix caractères, comme une date valide, pour
 * que la colonne ne bouge pas.
 */
const DATE_INCONNUE = "--/--/----";

/**
 * Une colonne du tableau : son en-tête, son alignement, et la façon d'en tirer
 * une chaîne à partir d'une entrée.
 *
 * L'ordre de ce tableau est celui des colonnes à l'écran, et son nombre
 * d'éléments doit rester celui de la grille de `ui.css` — les largeurs, elles,
 * sont fixées là-bas, en caractères.
 */
interface Colonne {
  readonly entete: string;
  /** Vrai pour une colonne de nombres : elle s'aligne à droite. */
  readonly nombre: boolean;
  /** Contenu de la cellule. `rang` est le rang affiché, à partir de 1. */
  readonly valeur: (entree: EntreeHof, rang: number) => string;
}

const COLONNES: readonly Colonne[] = [
  { entete: "RG", nombre: true, valeur: (_e, rang) => String(rang) },
  { entete: "TRI", nombre: false, valeur: (e) => e.trigramme },
  { entete: "TEMPS", nombre: true, valeur: (e) => formateTemps(e.tempsDeVol) },
  { entete: "PTS", nombre: true, valeur: (e) => String(Math.round(e.points)) },
  { entete: "MAN", nombre: true, valeur: (e) => String(e.manchesReussies) },
  {
    entete: "NIVEAU",
    nombre: false,
    valeur: (e) => etiquetteNiveau(e.niveauDepart),
  },
  { entete: "DATE", nombre: false, valeur: (e) => formateDate(e.date) },
];

export interface OptionsEcranHof {
  /** Hôte des nœuds HTML de l'écran, créé par `main.ts`. */
  readonly hote: HTMLElement;
  /** Primitives de dessin de la couche de fond, créées par `main.ts`. */
  readonly renderer: Renderer;
  /** Magasin du hall of fame, **reçu** et jamais recréé ici. */
  readonly stockage: Stockage;
}

/**
 * Date au format `JJ/MM/AAAA`, ou des tirets si la chaîne n'est pas une date.
 *
 * `new Date("n'importe quoi")` ne lève pas : il rend une date dont le temps vaut
 * `NaN`, et dont le `toLocaleDateString` affiche `Invalid Date` en toutes
 * lettres. Une entrée bricolée à la main dans le stockage écrirait donc ce
 * message au milieu du classement.
 */
function formateDate(iso: string): string {
  const date = new Date(iso);
  const instant = date.getTime();
  if (Number.isNaN(instant)) return DATE_INCONNUE;
  const jour = String(date.getDate()).padStart(2, "0");
  const mois = String(date.getMonth() + 1).padStart(2, "0");
  return `${jour}/${mois}/${String(date.getFullYear())}`;
}

/**
 * Vrai si les deux entrées décrivent la même partie.
 *
 * La comparaison porte sur tous les champs et pas sur l'identité des objets :
 * l'entrée à mettre en avant arrive par la transition, celles de la liste
 * sortent d'un `JSON.parse`, et deux objets de même contenu n'y sont jamais le
 * même objet.
 */
function memeEntree(a: EntreeHof, b: EntreeHof | null): boolean {
  return (
    b !== null &&
    a.trigramme === b.trigramme &&
    a.points === b.points &&
    a.tempsDeVol === b.tempsDeVol &&
    a.manchesReussies === b.manchesReussies &&
    a.niveauDepart === b.niveauDepart &&
    a.date === b.date
  );
}

/** Élément de paragraphe, classe et texte posés d'un coup. */
function paragraphe(classe: string, contenu: string): HTMLElement {
  const p = document.createElement("p");
  p.className = classe;
  p.textContent = contenu;
  return p;
}

/** Une ligne montée, et ses cellules dans l'ordre des colonnes. */
interface LigneDom {
  readonly racine: HTMLElement;
  readonly cellules: readonly HTMLElement[];
}

/**
 * Monte une ligne de sept cellules. `contenus` sert à l'en-tête ; les lignes de
 * données naissent vides et sont remplies par le rafraîchissement.
 */
function construitLigne(contenus: readonly string[] | null): LigneDom {
  const racine = document.createElement("div");
  racine.className = "hof-ligne";
  const cellules = COLONNES.map((colonne, i) => {
    const cellule = document.createElement("span");
    cellule.className = colonne.nombre ? "hof-col hof-col-nombre" : "hof-col";
    // `textContent` et jamais `innerHTML` : le trigramme vient du stockage, donc
    // d'un tiers, et il finit dans le DOM.
    cellule.textContent = contenus?.[i] ?? "";
    racine.append(cellule);
    return cellule;
  });
  return { racine, cellules };
}

/** Le bloc HTML de l'écran, et ce que le rafraîchissement doit retrouver. */
interface Bloc {
  readonly racine: HTMLElement;
  /** Les lignes de la fenêtre, vides si le classement l'est aussi. */
  readonly lignes: readonly LigneDom[];
  /** Le pied : rappel des touches, ou demande de confirmation. */
  readonly pied: HTMLElement;
}

/**
 * Construit le bloc de l'écran. Un bloc neuf à chaque activation, comme à
 * l'accueil : `sort()` retire une racine et il ne reste rien à remettre à zéro.
 *
 * Un classement vide n'affiche pas un tableau de neuf lignes blanches sous une
 * en-tête, mais une phrase.
 */
function construitBloc(vide: boolean): Bloc {
  const racine = document.createElement("div");
  racine.className = "ecran ecran-hof";
  racine.append(paragraphe("hof-titre", LIGNES.titre));

  let lignes: readonly LigneDom[] = [];
  if (vide) {
    racine.append(paragraphe("ecran-ligne", LIGNES.vide));
  } else {
    const table = document.createElement("div");
    table.className = "hof-table";
    const entete = construitLigne(COLONNES.map((c) => c.entete));
    entete.racine.classList.add("hof-entete");
    table.append(entete.racine);
    lignes = construitCorps(table);
    racine.append(table, paragraphe("ecran-aide", LIGNES.defilement));
  }

  const pied = paragraphe("ecran-aide", LIGNES.touches);
  racine.append(pied);
  return { racine, lignes, pied };
}

/** Les `LIGNES_VISIBLES` lignes de données, montées vides dans le tableau. */
function construitCorps(table: HTMLElement): readonly LigneDom[] {
  const lignes: LigneDom[] = [];
  for (let i = 0; i < LIGNES_VISIBLES; i++) {
    const ligne = construitLigne(null);
    table.append(ligne.racine);
    lignes.push(ligne);
  }
  return lignes;
}

/** Dernier index de départ possible : au-delà, la fenêtre sortirait de la liste. */
function departMax(taille: number): number {
  return Math.max(0, taille - LIGNES_VISIBLES);
}

/**
 * Index de la première ligne à afficher en arrivant.
 *
 * Sans entrée à mettre en avant, on ouvre en tête du classement. Avec, on
 * centre la fenêtre sur elle : arriver de l'écran de fin pour découvrir la
 * première page alors qu'on est classé quatre-vingtième n'apprend rien.
 */
function departInitial(
  liste: readonly EntreeHof[],
  misEnAvant: EntreeHof | null,
): number {
  if (misEnAvant === null) return 0;
  const index = liste.findIndex((e) => memeEntree(e, misEnAvant));
  if (index < 0) return 0;
  const centre = index - Math.floor(LIGNES_VISIBLES / 2);
  return Math.min(Math.max(centre, 0), departMax(liste.length));
}

/** Crée l'écran du hall of fame. Une seule instance : elle est réactivée par nom. */
export function creeEcranHof(options: OptionsEcranHof): Ecran {
  /**
   * Ciel du fond : tiré **une fois**, sur la graine partagée par les écrans en
   * DOM. Le classement montre donc exactement le ciel de l'accueil, et aucun
   * tirage ne dépend du nombre d'images affichées.
   */
  const etoiles: readonly Etoile[] = genereEtoiles(createRng(GRAINE_CIEL));

  /** Le classement, relu à chaque activation. */
  let liste: readonly EntreeHof[] = [];
  /** L'entrée à souligner, ou `null` quand on arrive de l'accueil. */
  let misEnAvant: EntreeHof | null = null;
  /** Index, dans `liste`, de la première ligne affichée. */
  let depart = 0;
  /** Une remise à zéro a été demandée et attend son second appui sur `R`. */
  let confirmation = false;
  /** Temps du fond animé, remis à zéro à chaque ouverture de l'écran. */
  let temps = 0;
  let bloc: Bloc | null = null;
  let demande: Transition | null = null;

  /** Reporte l'état de la confirmation dans le pied. */
  const majPied = (): void => {
    if (!bloc) return;
    bloc.pied.textContent = confirmation
      ? LIGNES.confirmation
      : LIGNES.touches;
    bloc.pied.classList.toggle("hof-confirme", confirmation);
  };

  /** Réécrit la fenêtre visible depuis `depart`, et le pied avec elle. */
  const rafraichit = (): void => {
    if (!bloc) return;
    for (const [i, ligne] of bloc.lignes.entries()) {
      const index = depart + i;
      const entree = liste[index];
      for (const [j, cellule] of ligne.cellules.entries()) {
        const colonne = COLONNES[j];
        cellule.textContent =
          entree && colonne ? colonne.valeur(entree, index + 1) : "";
      }
      // Une ligne au-delà de la fin de liste reste montée, vide : la retirer
      // ferait remonter le pied de l'écran à chaque fin de classement.
      const enAvant = entree !== undefined && memeEntree(entree, misEnAvant);
      ligne.racine.classList.toggle("est-en-avant", enAvant);
      ligne.racine.setAttribute("aria-current", enAvant ? "true" : "false");
    }
    majPied();
  };

  /** Monte le bloc correspondant à l'état courant et l'accroche à l'hôte. */
  const monte = (): void => {
    const nouveau = construitBloc(liste.length === 0);
    bloc = nouveau;
    rafraichit();
    options.hote.append(nouveau.racine);
  };

  const demonte = (): void => {
    bloc?.racine.remove();
    bloc = null;
  };

  /**
   * Déplace la fenêtre, **bornée** aux deux extrémités : la première ligne ne
   * remonte pas au-dessus du premier, la dernière ne descend pas sous le
   * dernier. Sans liste, `departMax` vaut 0 et rien ne bouge — le défilement ne
   * lève pas pour autant.
   */
  const deplace = (pas: number): void => {
    const suivant = Math.min(Math.max(depart + pas, 0), departMax(liste.length));
    if (suivant === depart) return;
    depart = suivant;
    rafraichit();
  };

  /**
   * Efface le classement, pour de bon. Appelée seulement au **second** appui sur
   * `R` : c'est `tick` qui tient la confirmation.
   */
  const remetAZero = (): void => {
    videHof(options.stockage);
    liste = [];
    // L'entrée mise en avant n'existe plus : rien ne doit rester souligné.
    misEnAvant = null;
    depart = 0;
    confirmation = false;
    demonte();
    monte();
  };

  return {
    nom: "hof",

    entre(t: Transition): void {
      if (t.nom !== "hof") return;
      // Une demande jamais appliquée ne doit pas ressortir ici : l'écran
      // repartirait à l'accueil dès son premier tick.
      demande = null;
      // La confirmation ne survit pas à un changement d'écran : un `R` laissé en
      // attente à la visite précédente effacerait le classement au retour.
      confirmation = false;
      temps = 0;
      // `liste` porte le classement déjà écrit par la validation du trigramme :
      // le relire ici pourrait diverger de ce qui vient d'être écrit (quota,
      // navigation privée) et perdre la partie qu'on vient de saisir sans un
      // mot. Absente, on retombe sur une lecture normale.
      liste = t.params?.liste ?? lisHof(options.stockage);
      misEnAvant = t.params?.misEnAvant ?? null;
      depart = departInitial(liste, misEnAvant);
      monte();
    },

    sort(): void {
      demonte();
      liste = [];
      misEnAvant = null;
      depart = 0;
      confirmation = false;
      demande = null;
    },

    tick(dt: number, input: InputSnapshot<Command>): void {
      // Écran non monté : franchement inerte entre son `sort()` et son `entre()`
      // suivant, y compris pour la remise à zéro.
      if (!bloc) return;

      temps += dt;

      // Une seule demande à la fois : la première formulée part, les appuis
      // suivants sont ignorés jusqu'à ce que le gestionnaire la consomme.
      if (demande) return;

      // Front montant, jamais l'état enfoncé : une touche `R` maintenue vaudrait
      // sinon confirmation à l'image suivante, 16 ms après la demande.
      if (input.justPressed("raz")) {
        if (confirmation) {
          remetAZero();
        } else {
          confirmation = true;
          majPied();
        }
        return;
      }

      if (input.justPressed("back")) {
        // Échap annule la remise à zéro avant de valoir retour : la sortie de
        // secours doit servir à ce qu'on vient de déclencher, pas à autre chose.
        if (confirmation) {
          confirmation = false;
          majPied();
          return;
        }
        demande = { nom: "accueil" };
        return;
      }

      if (input.justPressed("confirm")) {
        demande = { nom: "accueil" };
        return;
      }

      if (input.justPressed("throttle-up")) deplace(-1);
      if (input.justPressed("throttle-down")) deplace(1);
      if (input.justPressed("tilt-left")) deplace(-LIGNES_VISIBLES);
      if (input.justPressed("tilt-right")) deplace(LIGNES_VISIBLES);
    },

    rend(): void {
      dessineFond(options.renderer, temps, etoiles);
    },

    prendTransition(): Transition | null {
      const t = demande;
      demande = null;
      return t;
    },
  };
}
