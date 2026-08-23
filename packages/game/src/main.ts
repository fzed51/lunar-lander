import { GameLoop } from "@lem/engine";
import { creeSurface } from "./render/surface.ts";
import { creeEcranJeu } from "./screens/game.ts";
import { creeEcranAccueil } from "./screens/home.ts";
import { GestionnaireEcrans } from "./screens/manager.ts";
import type { Ecran, NomEcran, Transition } from "./screens/types.ts";

/**
 * Récupère un élément obligatoire de la page. Le type de retour n'est pas
 * nullable : les fermetures de ce module s'en servent sans avoir à retester, ce
 * que le rétrécissement de type ne leur garantirait pas.
 */
function exige<T extends Element>(selecteur: string): T {
  const element = document.querySelector<T>(selecteur);
  if (!element) throw new Error(`élément ${selecteur} introuvable`);
  return element;
}

const ui = exige<HTMLElement>("#ui");
// Deux surfaces, deux couches : `#fond` porte le décor animé des écrans en DOM,
// `#game` la partie jouée. `#fond` est sous `#game` dans la page, et `#game` est
// transparent : l'écran de jeu efface sa couche en sortant, sinon sa dernière
// image masquerait le fond de tous les autres écrans.
const fond = creeSurface(exige<HTMLCanvasElement>("#fond"));
const surface = creeSurface(exige<HTMLCanvasElement>("#game"));
const gestionnaire = new GestionnaireEcrans();

/**
 * Écran bouchon en DOM : affiche son nom dans `#ui`, et demande l'écran suivant
 * au **front montant** de `confirm`. Les vrais écrans de fin de partie et de
 * hall of fame prendront cette place.
 *
 * `suivante` est une fonction et non une valeur : la graine d'une partie se tire
 * au moment de la transition, pas au chargement de la page.
 */
function bouchonDom(nom: NomEcran, suivante: () => Transition): Ecran {
  let noeud: HTMLElement | null = null;
  let demande: Transition | null = null;

  return {
    nom,
    entre(): void {
      const bloc = document.createElement("div");
      bloc.className = "bouchon";
      bloc.append(titreBouchon(nom), invitationBouchon());
      ui.append(bloc);
      noeud = bloc;
    },
    sort(): void {
      noeud?.remove();
      noeud = null;
      // Une demande jamais appliquée ne doit pas ressortir au passage suivant.
      demande = null;
    },
    tick(_dt, input): void {
      if (demande === null && input.justPressed("confirm")) {
        demande = suivante();
      }
    },
    rend(): void {
      // Un écran en DOM n'occupe pas la couche de jeu : on l'**efface**, on ne
      // la repeint pas. Un aplat opaque masquerait le fond animé de `#fond`, qui
      // vit sous celle-ci — c'est précisément ce que l'accueil dessine.
      surface.renderer.efface();
    },
    prendTransition(): Transition | null {
      const t = demande;
      demande = null;
      return t;
    },
  };
}

/** Titre d'un bouchon en DOM. Taille 32 px du design system. */
function titreBouchon(nom: NomEcran): HTMLElement {
  const titre = document.createElement("p");
  titre.className = "bouchon-titre";
  titre.textContent = nom.toUpperCase();
  return titre;
}

/** Invitation d'un bouchon en DOM. Taille 16 px du design system. */
function invitationBouchon(): HTMLElement {
  const invite = document.createElement("p");
  invite.className = "bouchon-invite";
  invite.textContent = "ENTREE : ECRAN SUIVANT";
  return invite;
}

// L'accueil, le jeu, et deux bouchons en DOM : accueil → jeu → fin → hof →
// accueil. Les deux vrais écrans reçoivent leur surface de dessin, et l'écran de
// jeu l'unique source de commandes de l'image ; ils ne créent ni l'une ni
// l'autre. `fin` et `hof` resteront des bouchons jusqu'à ce que leurs tâches les
// remplacent.
gestionnaire
  .enregistre(creeEcranAccueil({ renderer: fond.renderer }))
  .enregistre(
    creeEcranJeu({
      renderer: surface.renderer,
      input: gestionnaire.sourcePartagee(),
    }),
  )
  .enregistre(bouchonDom("fin", () => ({ nom: "hof" })))
  .enregistre(bouchonDom("hof", () => ({ nom: "accueil" })));

gestionnaire.active({ nom: "accueil" });

/**
 * `GameLoop<S>` est fonctionnel sur un état immuable, la couche écrans est à
 * objets : on l'instancie en `GameLoop<null>`, l'état de la boucle reste vide et
 * le gestionnaire porte le sien. C'est assumé — il ne faut **pas** écrire une
 * seconde boucle à côté de celle du moteur, sinon deux horloges se partagent le
 * même clavier et le sondage unique par image ne tient plus.
 */
const boucle = new GameLoop<null>(
  (etat, dt) => {
    gestionnaire.tick(dt);
    return etat;
  },
  () => gestionnaire.rend(),
);
boucle.start(null);
