import type { InputSnapshot } from "@lem/engine";
import type { ResultatPartie } from "../state.ts";
import type { Command } from "../types.ts";

/**
 * Demande de passage d'un écran à un autre, **nom et charge utile appariés**.
 *
 * C'est une seule union discriminée, et pas un nom d'un côté avec des params
 * optionnels de l'autre : sous `strict`, un `{ nom: string; params?: … }`
 * laisserait passer une faute de frappe dans le nom, autoriserait d'apparier
 * `"jeu"` avec les params d'un autre écran, et obligerait à un cast devant un
 * `entre(params)` qui exige son argument.
 *
 * Les variantes sans charge utile sont déclarées ici **sans** `params` : elles
 * sont **enrichies** — pas créées — par les tâches qui produisent leurs types.
 * `fin` porte ainsi le `ResultatPartie` de T9 ; `hof` attend encore l'entrée mise
 * en avant de T14. Pas de `unknown` de complaisance en attendant.
 *
 * La `graine` de la variante `jeu` est la **seule** entropie extérieure du jeu :
 * tous les tirages d'une partie en descendent, et c'est l'écran d'accueil qui la
 * tire au moment de la transition.
 */
export type Transition =
  | { nom: "accueil" }
  | { nom: "jeu"; params: { niveau: 0 | 1 | 2; graine: number } }
  | { nom: "fin"; params: ResultatPartie }
  | { nom: "hof" };

/**
 * Nom d'écran. Dérivé de `Transition`, jamais recopié : une copie littérale
 * dériverait le jour où une variante est ajoutée.
 */
export type NomEcran = Transition["nom"];

/**
 * Un écran du jeu : accueil, partie, fin de partie, hall of fame. Un seul est
 * actif à la fois, et c'est le `GestionnaireEcrans` qui donne la main.
 *
 * Un écran ne possède **rien** de global : ni clavier, ni boucle. Il reçoit le
 * temps et le snapshot des commandes, et il rend sa demande de transition quand
 * on la lui prend.
 */
export interface Ecran {
  /** Identité de l'écran, dans la même union que les transitions. */
  readonly nom: NomEcran;

  /**
   * Activation. Reçoit la transition **entière** : l'écran discrimine sur
   * `t.nom` et récupère ses params déjà typés.
   */
  entre(t: Transition): void;

  /**
   * Désactivation. **Doit** défaire ce que `entre` a fait : nœuds DOM retirés,
   * état de saisie effacé, et **demande de transition en attente remise à
   * `null`** — sans ça, un écran quitté avant que sa demande soit appliquée la
   * ressortirait au passage suivant.
   */
  sort(): void;

  /**
   * Avance l'écran d'un tick. L'écran **reçoit** le snapshot des commandes, il
   * ne le fabrique pas : il n'y a qu'un sondage du clavier par image, et c'est
   * le gestionnaire qui le fait.
   */
  tick(dt: number, input: InputSnapshot<Command>): void;

  /** Dessine l'écran. Aucune logique, aucun tirage aléatoire. */
  rend(): void;

  /**
   * Rend la demande de transition en attente **et la remet à `null` dans le même
   * appel**. C'est une consommation, pas une lecture : les écrans sont des
   * instances enregistrées une fois puis réactivées par nom, donc une demande
   * jamais effacée serait rejouée au passage suivant — les écrans se mettraient
   * à défiler seuls, une image après l'autre, sans qu'on touche une touche.
   */
  prendTransition(): Transition | null;
}
