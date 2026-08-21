import {
  KeyboardInput,
  type InputSnapshot,
  type InputSource,
} from "@lem/engine";
import { KEY_MAP } from "../input/mapping.ts";
import type { Command } from "../types.ts";
import type { Ecran, NomEcran, Transition } from "./types.ts";

/**
 * Snapshot sans aucune commande. Sert de valeur de départ, avant le premier
 * `tick` : la source partagée doit répondre quelque chose de sain même si on la
 * sonde hors d'un tick.
 */
const SNAPSHOT_VIDE: InputSnapshot<Command> = {
  isActive: () => false,
  justPressed: () => false,
};

export interface OptionsGestionnaire {
  /**
   * Source de commandes à utiliser. Par défaut le gestionnaire crée lui-même
   * l'unique clavier du jeu, et c'est lui qui le libère. Injecter une source
   * sert aux tests : le gestionnaire ne la libère alors pas, elle ne lui
   * appartient pas.
   */
  readonly source?: InputSource<Command>;
}

/**
 * Machine à écrans : un seul écran a la main, un seul sondage du clavier par
 * image.
 *
 * Le gestionnaire **possède** l'unique `KeyboardInput` du jeu et fait le seul
 * `poll()` de l'image. C'est une nécessité, pas une préférence :
 * `KeyboardInput.poll()` **vide** son tampon de fronts montants, et `Scene.tick`
 * appelle `poll()` lui-même. Deux consommateurs dans la même image et le second
 * ne voit plus aucun front — le cran de poussée, la navigation et la saisie du
 * trigramme, qui reposent tous sur `justPressed`, deviendraient aléatoires.
 * D'où `sourcePartagee()` : un adaptateur qui relit le snapshot déjà capturé.
 */
export class GestionnaireEcrans {
  private readonly ecrans = new Map<NomEcran, Ecran>();
  private readonly source: InputSource<Command>;
  /** Non nul seulement si le gestionnaire a créé le clavier : il le libère alors. */
  private readonly clavier: KeyboardInput<Command> | null;
  private courant: Ecran | null = null;
  private snapshot: InputSnapshot<Command> = SNAPSHOT_VIDE;

  constructor(options: OptionsGestionnaire = {}) {
    const injectee = options.source;
    if (injectee) {
      this.source = injectee;
      this.clavier = null;
    } else {
      const clavier = new KeyboardInput<Command>(KEY_MAP);
      this.source = clavier;
      this.clavier = clavier;
    }
  }

  /** Nom de l'écran actif, ou `null` avant la première activation. */
  get nomCourant(): NomEcran | null {
    return this.courant?.nom ?? null;
  }

  /** Ajoute un écran au registre, sous son propre nom. */
  enregistre(ecran: Ecran): this {
    this.ecrans.set(ecran.nom, ecran);
    return this;
  }

  /**
   * Adaptateur de commandes à passer à une `Scene` : son `poll()` rend le
   * snapshot **déjà capturé** pour l'image en cours, sans retoucher au clavier.
   * La `Scene` croit sonder le clavier ; elle relit le snapshot commun.
   */
  sourcePartagee(): InputSource<Command> {
    return { poll: () => this.snapshot };
  }

  /**
   * Donne la main à l'écran désigné par `t`. `sort()` sur l'écran courant
   * **avant** `entre(t)` sur le nouveau.
   *
   * Un seul argument, la transition entière : c'est ce qui garde le nom et les
   * params appariés de bout en bout. Activer l'écran déjà courant est une vraie
   * réactivation (`sort` puis `entre`), pour que les params soient repris.
   */
  active(t: Transition): void {
    const suivant = this.ecrans.get(t.nom);
    // Contrôle AVANT de sortir de l'écran courant : un nom absent du registre
    // ne doit pas laisser le jeu sans écran du tout. Le typage de `Transition`
    // couvre la faute de frappe, cette garde couvre l'écran oublié au registre.
    if (!suivant) {
      throw new Error(`aucun écran enregistré sous le nom « ${t.nom} »`);
    }
    this.courant?.sort();
    this.courant = suivant;
    suivant.entre(t);
  }

  /**
   * Une image de logique : sondage unique du clavier, puis l'écran courant, puis
   * au plus **une** transition.
   *
   * La demande est consommée **avant** d'être appliquée. L'ordre compte : une
   * demande formulée depuis le `entre()` du nouvel écran ne doit pas être avalée
   * par la même image, elle part au tick suivant.
   */
  tick(dt: number): void {
    // L'unique sondage de l'image. Tout le reste du jeu relit ce snapshot.
    this.snapshot = this.source.poll();

    const courant = this.courant;
    if (!courant) return;

    courant.tick(dt, this.snapshot);

    const demande = courant.prendTransition();
    if (demande) this.active(demande);
  }

  /** Dessine l'écran courant, et lui seul. */
  rend(): void {
    this.courant?.rend();
  }

  /** Libère le clavier, si c'est le gestionnaire qui l'a créé. */
  dispose(): void {
    this.clavier?.dispose();
  }
}
