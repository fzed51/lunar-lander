/**
 * Écran d'accueil : le fond animé sur la couche `#fond`, le titre et le choix du
 * niveau en HTML dans `#ui`.
 *
 * ## Ce que cet écran possède, et ce qu'il reçoit
 *
 * Il reçoit son `Renderer` — celui de la couche `#fond`, créée par `main.ts` — et
 * lit le snapshot des commandes que le gestionnaire lui passe. Il ne crée ni
 * surface, ni `KeyboardInput`, et ne pose **aucun** écouteur clavier : il n'y a
 * qu'un sondage du clavier par image, et c'est le gestionnaire qui le fait. Un
 * écouteur posé ici ferait réagir l'accueil pendant la partie.
 *
 * ## Ce qui survit à une sortie, et ce qui ne survit pas
 *
 * Le niveau choisi est **retenu** entre deux parties : c'est une variable de la
 * fermeture, et l'instance de l'écran est enregistrée une fois pour toutes.
 * Rien n'est écrit sur disque, la mémoire du dernier choix meurt avec l'onglet.
 *
 * La demande de transition, elle, ne survit pas : `prendTransition` la consomme
 * et `sort()` la remet à `null`. Sans ça, l'accueil réactivé après une partie
 * relancerait aussitôt une partie, sans qu'on touche à une touche.
 *
 * ## L'unique graine du jeu
 *
 * `Date.now()` est appelé **ici et nulle part ailleurs** : c'est la seule
 * entropie extérieure d'une partie, et tous les tirages de la partie en
 * descendent.
 */

import { createRng, type InputSnapshot, type Renderer } from "@lem/engine";
import { NIVEAUX } from "../constants.ts";
import { dessineFond } from "../render/background.ts";
import { genereEtoiles, type Etoile } from "../render/stars.ts";
import type { Command } from "../types.ts";
import type { Ecran, Transition } from "./types.ts";

/**
 * Graine du ciel de l'accueil : fixe, pour que le fond soit exactement le même à
 * chaque ouverture. Le 20 juillet 1969, en chiffres.
 */
const GRAINE_CIEL = 19690720;

/**
 * Les trois niveaux, dans l'ordre d'affichage. Les difficultés de départ sont
 * lues dans `NIVEAUX`, jamais recopiées.
 */
const CHOIX = [
  { etiquette: "FACILE", niveau: NIVEAUX.facile },
  { etiquette: "MOYEN", niveau: NIVEAUX.moyen },
  { etiquette: "DIFFICILE", niveau: NIVEAUX.difficile },
] as const;

/** Les lignes de texte du bloc, hors titre et hors sélection de niveau. */
const LIGNES = {
  invite: "ENTREE — DECOLLER",
  hof: "H — HALL OF FAME",
  aide: [
    "FLECHES GAUCHE DROITE — INCLINER",
    "FLECHES HAUT BAS — POUSSEE    ECHAP — PAUSE",
  ],
} as const;

export interface OptionsEcranAccueil {
  /** Primitives de dessin de la couche de fond, créées par `main.ts`. */
  readonly renderer: Renderer;
  /**
   * Hôte des nœuds HTML de l'écran. Par défaut `#ui`, résolu **à chaque
   * activation** et pas au chargement du module : c'est ce qui rend l'écran
   * montable sur un DOM de test.
   */
  readonly hote?: HTMLElement;
}

/** Élément de paragraphe, classe et texte posés d'un coup. */
function paragraphe(classe: string, texte: string): HTMLElement {
  const p = document.createElement("p");
  p.className = classe;
  p.textContent = texte;
  return p;
}

/** Hôte des nœuds de l'écran : celui fourni, sinon `#ui`. */
function hoteDe(explicite: HTMLElement | undefined): HTMLElement {
  const trouve = explicite ?? document.querySelector<HTMLElement>("#ui");
  if (!trouve) {
    throw new Error("élément #ui introuvable : l'accueil n'a pas d'hôte HTML");
  }
  return trouve;
}

/** Le bloc HTML de l'accueil, et les trois options de niveau à marquer. */
interface Bloc {
  readonly racine: HTMLElement;
  readonly options: readonly HTMLElement[];
}

/**
 * Construit le bloc de l'accueil. Un bloc neuf à chaque activation : plus simple
 * à défaire — `sort()` retire une racine et il ne reste rien — qu'un bloc gardé
 * en réserve, dont il faudrait aussi remettre l'état à zéro.
 */
function construitBloc(): Bloc {
  const racine = document.createElement("div");
  racine.className = "ecran ecran-accueil";

  const ligne = document.createElement("ul");
  ligne.className = "choix";
  const options = CHOIX.map((choix) => {
    const item = document.createElement("li");
    item.className = "choix-option";
    item.textContent = choix.etiquette;
    ligne.append(item);
    return item;
  });

  racine.append(
    paragraphe("ecran-titre", "LEM"),
    ligne,
    paragraphe("ecran-invite", LIGNES.invite),
    paragraphe("ecran-entree", LIGNES.hof),
    ...LIGNES.aide.map((texte) => paragraphe("ecran-aide", texte)),
  );
  return { racine, options };
}

/** Crée l'écran d'accueil. Une seule instance suffit : elle est réactivée par nom. */
export function creeEcranAccueil(options: OptionsEcranAccueil): Ecran {
  /**
   * Ciel du fond : tiré **une fois**, sur une graine fixe. Ni le rendu ni les
   * activations suivantes ne retirent quoi que ce soit — l'accueil a toujours le
   * même ciel, et aucun tirage ne dépend du nombre d'images affichées.
   */
  const etoiles: readonly Etoile[] = genereEtoiles(createRng(GRAINE_CIEL));

  /** Niveau sélectionné, **retenu d'une activation à l'autre**. */
  let index = 0;
  /** Temps du fond animé, remis à zéro à chaque ouverture de l'écran. */
  let temps = 0;
  let bloc: Bloc | null = null;
  let demande: Transition | null = null;

  const choixCourant = (): (typeof CHOIX)[number] => CHOIX[index] ?? CHOIX[0];

  /** Marque l'option choisie. Sans effet si le bloc n'est pas monté. */
  const majSelection = (): void => {
    if (!bloc) return;
    for (const [i, option] of bloc.options.entries()) {
      option.classList.toggle("est-choisi", i === index);
      option.setAttribute("aria-current", i === index ? "true" : "false");
    }
  };

  /**
   * Déplace la sélection, **bornée** aux deux extrémités : pas de rebouclage,
   * qui ferait passer du plus dur au plus facile d'un seul appui.
   */
  const deplace = (pas: number): void => {
    const suivant = Math.min(Math.max(index + pas, 0), CHOIX.length - 1);
    if (suivant === index) return;
    index = suivant;
    majSelection();
  };

  return {
    nom: "accueil",

    entre(): void {
      // Une demande jamais appliquée ne doit pas ressortir ici : l'accueil
      // relancerait une partie dès le premier tick.
      demande = null;
      temps = 0;
      bloc = construitBloc();
      majSelection();
      hoteDe(options.hote).append(bloc.racine);
    },

    sort(): void {
      bloc?.racine.remove();
      bloc = null;
      demande = null;
      // Aucun écouteur clavier à retirer : cet écran n'en pose aucun, il lit le
      // snapshot du gestionnaire. C'est la seule façon de garantir qu'il ne
      // réagira pas aux touches pendant la partie.
    },

    tick(dt: number, input: InputSnapshot<Command>): void {
      // Écran non monté : rien à faire. La garde double celle du gestionnaire,
      // qui ne ticke que l'écran courant, et rend l'écran franchement inerte
      // entre son `sort()` et son `entre()` suivant.
      if (!bloc) return;

      temps += dt;

      if (input.justPressed("tilt-left")) deplace(-1);
      if (input.justPressed("tilt-right")) deplace(1);

      // Une seule demande à la fois : la première formulée part, les appuis
      // suivants sont ignorés jusqu'à ce que le gestionnaire la consomme.
      if (demande) return;

      // Front montant, jamais l'état enfoncé : une touche Entrée maintenue
      // depuis l'écran précédent ne doit pas enchaîner deux écrans d'un coup.
      if (input.justPressed("confirm")) {
        demande = {
          nom: "jeu",
          params: { niveau: choixCourant().niveau, graine: Date.now() },
        };
        return;
      }
      if (input.justPressed("hof")) demande = { nom: "hof" };
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
