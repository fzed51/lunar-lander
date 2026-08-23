/**
 * Écran de jeu : la manche jouée, sa caméra et son dessin.
 *
 * ## Ce que cet écran possède, et ce qu'il reçoit
 *
 * Il reçoit son `Renderer` et sa source de commandes en paramètres de fabrique.
 * Il ne crée ni surface ni `KeyboardInput` : le gestionnaire d'écrans possède
 * l'unique clavier du jeu et fait le seul sondage de l'image, et `main.ts` est le
 * seul à créer la surface. C'est aussi ce qui rend cet écran testable avec un
 * faux contexte, sans DOM.
 *
 * ## La pause vit ici, entrée **et** sortie
 *
 * `surPause`, `surReprise` et `surAbandon` sont appliqués par cet écran, à chaque
 * image et **y compris en pause**, avant toute décision de ticker la scène. Ce
 * n'est pas un choix de rangement : une `TickRule` est évaluée à l'intérieur de
 * `Scene.tick`, et la scène ne tourne plus dès que la pause est posée. La seule
 * fonction capable de lire `confirm` et `back` ne tournerait donc plus, le voile
 * n'obéirait à rien et la partie serait perdue.
 *
 * Corollaire : la pause n'est pas « on saute le tick », c'est « on saute le tick
 * **et** on continue de lire l'entrée ». Et c'est bien le fait de ne pas ticker la
 * scène qui gèle la physique : `Scene.tick` déplace toutes les entités avant
 * d'évaluer les règles, et `step` ne voit pas les globals, donc aucune règle ni
 * aucun reducer ne pourrait geler le monde à sa place.
 */

import {
  avecZoom,
  borne,
  byKind,
  createRng,
  creeCamera,
  melangeGraine,
  Scene,
  suit,
  surfaceEn,
  Vector2,
  type Camera,
  type InputSnapshot,
  type InputSource,
  type Limites,
  type Renderer,
} from "@lem/engine";
import {
  BIAIS_CAMERA_Y,
  CAMERA_REACTIVITE,
  DELAI_ENCHAINEMENT,
  MONDE,
  PIXEL,
} from "../constants.ts";
import type { Lander } from "../entities/Lander.ts";
import {
  dessineCiel,
  dessineDrapeau,
  dessineEtoiles,
  dessineFlamme,
  dessineIndicateurCible,
  dessineLem,
  dessineParticules,
  dessinePause,
  dessineReplis,
  dessineTerrain,
  zoomSuivant,
} from "../render/draw.ts";
import { dessineHud } from "../render/hud.ts";
import { genereEtoiles, type Etoile } from "../render/stars.ts";
import {
  surAbandon,
  surContact,
  surGaz,
  surHorsLimites,
  surMancheSuivante,
  surParticuleMorte,
  surPause,
  surReprise,
  surTempsVol,
} from "../reducers.ts";
import {
  regleContact,
  regleEnchainement,
  regleGaz,
  regleParticules,
  regleTempsDeVol,
} from "../rules.ts";
import {
  nouvellePartie,
  resultatPartie,
  type EtatPartie,
  type Globals,
} from "../state.ts";
import type { Command, LemEntity, LemEvent } from "../types.ts";
import type { Ecran, Transition } from "./types.ts";

/** La vue de la caméra, c'est la résolution interne du jeu. */
const VUE = { largeur: PIXEL.width, hauteur: PIXEL.height } as const;

/** La caméra ne sort jamais du monde jouable. */
const LIMITES_MONDE: Limites = {
  xMin: 0,
  xMax: MONDE.largeur,
  yMin: 0,
  yMax: MONDE.hauteur,
};

export interface OptionsEcranJeu {
  /** Primitives de dessin de la couche de jeu, créées par `main.ts`. */
  readonly renderer: Renderer;
  /**
   * Source de commandes de la `Scene`. En production c'est
   * `GestionnaireEcrans.sourcePartagee()`, qui relit le snapshot déjà capturé :
   * un second sondage du clavier dans la même image viderait le tampon des
   * fronts montants et le cran de poussée deviendrait aléatoire.
   */
  readonly input: InputSource<Command>;
}

/**
 * L'écran de jeu, avec deux lectures en plus du contrat `Ecran`.
 *
 * Elles ne servent qu'à observer, jamais à écrire : la partie et la caméra
 * restent la propriété de l'écran. Sans elles, « la pause gèle la physique » ou
 * « la caméra suit une cible biaisée » ne se prouveraient qu'en relisant des
 * pixels, ce qui testerait le dessin au lieu de la règle.
 */
export interface EcranJeu extends Ecran {
  /** Partie en cours, ou `null` hors de l'écran. Lecture seule. */
  etat(): EtatPartie | null;
  /** Caméra courante. Lecture seule. */
  camera(): Camera;
}

/** Le LEM de la manche, ou `null` s'il n'y en a pas (partie non démarrée). */
function lemDe(etat: EtatPartie): Lander | null {
  return byKind(etat, "lander")[0] ?? null;
}

/**
 * Cible suivie par la caméra : le LEM, **décalé vers le bas** de
 * `BIAIS_CAMERA_Y / zoom`. Le biais est exprimé en pixels d'écran, donc il se
 * divise par le zoom pour valoir toujours autant à l'écran.
 */
function cibleCamera(lem: Lander, zoom: number): Vector2 {
  return new Vector2(
    lem.position.x,
    lem.position.y + BIAIS_CAMERA_Y / zoom,
  );
}

/** Altitude du LEM au-dessus de la surface (m) : `y` croît vers le bas. */
function altitudeDe(etat: EtatPartie, lem: Lander): number {
  return surfaceEn(etat.globals.terrain.hf, lem.position.x) - lem.position.y;
}

/** Crée l'écran de jeu. Une seule instance suffit : elle est réactivée par nom. */
export function creeEcranJeu(options: OptionsEcranJeu): EcranJeu {
  // Les cinq règles de tick de la manche et les six reducers de scène.
  // `temps-vol` et `manche-suivante` sont indispensables : sans leur reducer, le
  // chrono ne tourne pas et la manche suivante ne démarre jamais.
  //
  // L'ordre d'enregistrement des règles est l'ordre de repliement des
  // événements : `regleContact` passe **avant** `regleGaz`, si bien qu'un contact
  // et une poussée tombés dans le même tick sortent un LEM jugé et pas de
  // panache. `regleParticules` ferme la marche : c'est elle qui alimente
  // `particle-died`, et sans elle aucune particule ne quitterait jamais la scène.
  const scene = new Scene<LemEntity, LemEvent, Globals, Command>({
    input: options.input,
  })
    .onTick(regleContact)
    .onTick(regleTempsDeVol)
    .onTick(regleEnchainement)
    .onTick(regleGaz)
    .onTick(regleParticules)
    .on("contact", surContact)
    .on("hors-limites", surHorsLimites)
    .on("temps-vol", surTempsVol)
    .on("manche-suivante", surMancheSuivante)
    .on("gaz-moteur", surGaz)
    .on("particle-died", surParticuleMorte);

  let etat: EtatPartie | null = null;
  let cam: Camera = creeCamera(
    new Vector2(MONDE.largeur / 2, MONDE.hauteur / 2),
    VUE,
  );
  let etoiles: readonly Etoile[] = [];
  /** Manche dont le ciel a été tiré. 0 : aucun, les manches comptent depuis 1. */
  let mancheDesEtoiles = 0;
  let demande: Transition | null = null;
  /**
   * Vrai dès que la fin de partie a été publiée. La demande, elle, est consommée
   * par le gestionnaire : sans ce drapeau, un statut `"fini"` qui reste en place
   * la renoterait à chaque image.
   */
  let finPubliee = false;

  /** Ciel de la manche : tiré une fois, à chaque changement de manche. */
  const majEtoiles = (courant: EtatPartie): void => {
    const g = courant.globals;
    if (g.numeroManche === mancheDesEtoiles) return;
    mancheDesEtoiles = g.numeroManche;
    etoiles = genereEtoiles(createRng(melangeGraine(g.graine, g.numeroManche)));
  };

  /** Suivi du LEM, cran de zoom, puis bornage sur le monde. Dans cet ordre. */
  const majCamera = (dt: number, courant: EtatPartie): void => {
    const lem = lemDe(courant);
    if (!lem) return;
    const suivie = suit(
      cam,
      cibleCamera(lem, cam.zoom),
      dt,
      CAMERA_REACTIVITE,
    );
    const zoom = zoomSuivant(altitudeDe(courant, lem), suivie.zoom);
    cam = borne(avecZoom(suivie, zoom), LIMITES_MONDE);
  };

  /**
   * Note la fin de partie, **une seule fois**.
   *
   * Le délai n'est pas une coquetterie. Sur la vie fatale, `enregistrePerte` met
   * `statut` directement à `"fini"`, sans passer par `"crash"` : une demande
   * publiée dans le tick même du passage à `"fini"` serait consommée par
   * `GestionnaireEcrans.tick` juste après, et `GameLoop.frame` n'appelle
   * `onRender` qu'après `onTick` — la frame du verdict fatal ne serait **jamais**
   * dessinée, ni son explosion, ni son bandeau. C'est la seule des trois fins de
   * manche qui sauterait son temps d'affichage.
   *
   * L'abandon depuis la pause, lui, part immédiatement : il n'y a rien à montrer
   * de plus.
   */
  const noteFin = (courant: EtatPartie): void => {
    if (finPubliee) return;
    const g = courant.globals;
    if (g.statut !== "fini") return;
    if (!g.abandonnee && courant.time - g.instantStatut < DELAI_ENCHAINEMENT) {
      return;
    }
    demande = { nom: "fin", params: resultatPartie(courant) };
    finPubliee = true;
  };

  return {
    nom: "jeu",

    entre(t: Transition): void {
      // Le niveau et la graine viennent tous les deux de la transition : rien
      // n'est tiré ici, l'entropie d'une partie est celle de l'accueil.
      if (t.nom !== "jeu") return;
      demande = null;
      finPubliee = false;
      mancheDesEtoiles = 0;
      const partie = nouvellePartie(t.params.niveau, t.params.graine);
      etat = partie;
      const lem = lemDe(partie);
      // Caméra posée directement sur sa cible : le premier tick ne doit pas
      // arriver depuis le centre du monde en traversant tout le relief.
      cam = borne(
        creeCamera(
          lem
            ? cibleCamera(lem, 1)
            : new Vector2(MONDE.largeur / 2, MONDE.hauteur / 2),
          VUE,
        ),
        LIMITES_MONDE,
      );
      majEtoiles(partie);
    },

    sort(): void {
      // `#fond` est **sous** `#game` et `#game` est transparent : sans
      // effacement, la dernière image de la partie resterait peinte sur la
      // couche de jeu et masquerait le fond des autres écrans.
      options.renderer.efface();
      demande = null;
      finPubliee = false;
      etat = null;
      etoiles = [];
      mancheDesEtoiles = 0;
    },

    tick(dt: number, input: InputSnapshot<Command>): void {
      const courant = etat;
      if (!courant) return;

      // 1. La pause d'abord, à chaque image et y compris en pause. Le statut est
      //    lu **avant** d'appliquer quoi que ce soit : `back` ouvre la pause
      //    depuis le vol et abandonne depuis la pause, jamais les deux à la
      //    suite dans la même image.
      let suivant = courant;
      if (input.justPressed("back")) {
        suivant =
          suivant.globals.statut === "pause"
            ? surAbandon(suivant)
            : surPause(suivant);
      }
      if (input.justPressed("confirm")) suivant = surReprise(suivant);

      // 2. La simulation, sauf en pause.
      if (suivant.globals.statut !== "pause") {
        suivant = scene.tick(suivant, dt);
        majCamera(dt, suivant);
        majEtoiles(suivant);
      }

      etat = suivant;
      noteFin(suivant);
    },

    rend(): void {
      const courant = etat;
      if (!courant) return;
      const r = options.renderer;
      const terrain = courant.globals.terrain;

      // Ordre figé : un LEM dessiné avant le terrain disparaît derrière le
      // relief. Les particules s'intercalent entre le drapeau et le LEM : elles
      // passent devant le relief — un débris tombé dans la roche disparaît, ce
      // qui est voulu — et derrière la silhouette du LEM, que le panache de gaz
      // ne doit pas manger. Le tableau de bord passe après tout ce qui est du
      // monde, et l'indicateur de cible passe **après** le tableau de bord : au
      // largage la cible est sous le bord bas de la vue et l'indicateur, écrêté
      // près de ce bord, tomberait sous les jauges s'il était peint avant elles.
      // Le voile de pause vient en dernier, et assombrit tout sans rien cacher.
      dessineCiel(r);
      dessineEtoiles(r, etoiles, cam);
      dessineTerrain(r, terrain, cam);
      dessineReplis(r, terrain, cam);
      dessineDrapeau(r, terrain.cible, cam, courant.time);
      dessineParticules(r, byKind(courant, "particle"), cam);

      const lem = lemDe(courant);
      if (lem) {
        dessineLem(r, lem, cam);
        // Pas de flamme hors du vol : une flamme sur un LEM posé ou crashé est
        // un mensonge visuel.
        if (courant.globals.statut === "vol") {
          dessineFlamme(r, lem, cam, courant.time);
        }
      }
      dessineHud(r, courant);
      dessineIndicateurCible(r, terrain.cible, cam);

      if (courant.globals.statut === "pause") dessinePause(r);
    },

    prendTransition(): Transition | null {
      const t = demande;
      demande = null;
      return t;
    },

    etat(): EtatPartie | null {
      return etat;
    },

    camera(): Camera {
      return cam;
    },
  };
}
