import { GameLoop, Vector2 } from "@lem/engine";
import { PIXEL } from "./constants.ts";
import { PALETTE } from "./design/palette.ts";
import { dessineTexte } from "./design/font.ts";
import { creeSurface } from "./render/surface.ts";
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
const surface = creeSurface(exige<HTMLCanvasElement>("#game"));
const gestionnaire = new GestionnaireEcrans();

/**
 * Écran bouchon en DOM : affiche son nom dans `#ui`, et demande l'écran suivant
 * au **front montant** de `confirm`. Les vrais écrans d'accueil, de fin de
 * partie et de hall of fame prendront cette place.
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
      // Un écran en DOM n'occupe pas la couche de jeu : on la repeint, sinon la
      // dernière image de la partie resterait affichée derrière le HTML. Les
      // vrais écrans en DOM dessineront leur fond animé sur la couche `#fond`,
      // qui est sous celle-ci.
      surface.renderer.clear(PALETTE.espace);
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

/**
 * Écran bouchon au canvas : le nom dessiné à la police bitmap, sur la couche de
 * jeu. La vraie partie prendra cette place.
 */
function bouchonCanvas(nom: NomEcran, suivante: () => Transition): Ecran {
  let demande: Transition | null = null;

  return {
    nom,
    entre(): void {},
    sort(): void {
      demande = null;
    },
    tick(_dt, input): void {
      if (demande === null && input.justPressed("confirm")) {
        demande = suivante();
      }
    },
    rend(): void {
      const r = surface.renderer;
      r.clear(PALETTE.espace);
      dessineTexte(
        r,
        nom,
        new Vector2(PIXEL.width / 2, 70),
        PALETTE.blanc,
        { align: "center", echelle: 2 },
      );
      dessineTexte(
        r,
        "ENTREE : ECRAN SUIVANT",
        new Vector2(PIXEL.width / 2, 100),
        PALETTE.grisPale,
        { align: "center" },
      );
    },
    prendTransition(): Transition | null {
      const t = demande;
      demande = null;
      return t;
    },
  };
}

// Les quatre bouchons en cycle : accueil → jeu → fin → hof → accueil. Seul le
// jeu vit sur le canvas ; les trois autres écrans sont en DOM, comme le seront
// les vrais.
gestionnaire
  .enregistre(
    bouchonDom("accueil", () => ({
      // Unique entropie extérieure du jeu : tous les tirages de la partie en
      // descendront. Le vrai écran d'accueil la tirera au même endroit.
      nom: "jeu",
      params: { niveau: 0, graine: Date.now() },
    })),
  )
  .enregistre(bouchonCanvas("jeu", () => ({ nom: "fin" })))
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
