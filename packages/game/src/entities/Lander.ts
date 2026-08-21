import {
  Vector2,
  type EntityBase,
  type InputSnapshot,
  type Steppable,
} from "@lem/engine";
import type { Command } from "../types.ts";
import {
  ASSIETTE_MAX,
  CONSO_PAR_CRAN,
  CRANS_MAX,
  LEM,
  MOON_GRAVITY,
  POUSSEE_MAX,
  VITESSE_ROTATION,
} from "../constants.ts";

/** Ramène `v` dans `[min, max]`. */
function pince(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Le module lunaire piloté par le joueur. Immuable : `step` rend une nouvelle
 * instance et ne touche jamais celle qu'on lui appelle dessus.
 *
 * Repère : `y` croît **vers le bas**, comme le `Heightfield` du moteur. Une
 * `assiette` de 0 est un LEM debout, tuyère vers le bas ; une assiette positive
 * penche vers la droite. La poussée sort donc selon l'axe du LEM, soit le
 * vecteur `(sin assiette, -cos assiette)`.
 *
 * Le pilotage de la puissance est **mémorisé** : six crans (0 à 5) qu'on monte
 * et descend d'un coup de flèche, pas une pédale à tenir.
 */
export class Lander implements EntityBase, Steppable<Lander, Command> {
  readonly kind = "lander" as const;

  constructor(
    readonly id: number,
    readonly position: Vector2,
    readonly velocity: Vector2 = Vector2.ZERO,
    /** Inclinaison (rad) : 0 = debout, positif = penché vers la droite. */
    readonly assiette: number = 0,
    /** Cran de poussée, entier de 0 à `CRANS_MAX`. */
    readonly cran: number = 0,
    /** Carburant restant (unités). Réservoir vide par défaut : c'est la manche
     * qui fournit la dotation. */
    readonly carburant: number = 0,
    readonly radius: number = LEM.rayon,
    /**
     * LEM **inerte** : la manche est jugée, il ne bouge plus, ne brûle plus rien
     * et n'obéit plus aux flèches.
     *
     * Le drapeau est posé par le reducer du verdict (T9) et remis à faux par le
     * LEM neuf de la manche suivante. Il vit dans l'entité parce que `Scene.tick`
     * appelle `step` sur **toutes** les entités, sans condition et avant
     * d'évaluer les règles, et que `step` ne reçoit pas les globals : c'est le
     * seul endroit où le LEM peut savoir que sa manche est terminée. Un état
     * porté par l'entité reste dans le `GameState`, donc dans le périmètre pur.
     */
    readonly inerte: boolean = false,
  ) {}

  step(dt: number, input: InputSnapshot<Command>): Lander {
    // Manche jugée : plus de gravité, plus de poussée, plus de consommation. Sans
    // ce court-circuit, les deux secondes du bandeau de fin de manche
    // enfonceraient le LEM dans la roche et videraient son réservoir.
    if (this.inerte) return this;

    // 1. Assiette. Les deux flèches tenues en même temps s'annulent, et la
    //    rotation bute à ±ASSIETTE_MAX : le LEM ne se retourne jamais.
    let sens = 0;
    if (input.isActive("tilt-left")) sens -= 1;
    if (input.isActive("tilt-right")) sens += 1;
    const assiette = pince(
      this.assiette + sens * VITESSE_ROTATION * dt,
      -ASSIETTE_MAX,
      ASSIETTE_MAX,
    );

    // 2. Cran. Front montant uniquement : une flèche maintenue ne fait pas
    //    défiler la puissance image après image. Le cran reste entier.
    let cran = this.cran;
    if (input.justPressed("throttle-up")) cran += 1;
    if (input.justPressed("throttle-down")) cran -= 1;
    cran = pince(cran, 0, CRANS_MAX);

    // 3. Carburant. On ne brûle que ce qui reste dans le réservoir : le
    //    plancher est 0, jamais de dette.
    const demande = cran * CONSO_PAR_CRAN * dt;
    const consomme = Math.min(this.carburant, demande);
    const carburant = this.carburant - consomme;

    // 4. Poussée. Elle est proportionnée au carburant **réellement** brûlé : un
    //    réservoir qui se vide au milieu du pas ne délivre pas une poussée
    //    pleine sur tout le pas, et un réservoir déjà vide ne délivre rien. Le
    //    cran choisi par le joueur, lui, ne bouge pas pour autant.
    const fraction = demande > 0 ? consomme / demande : 0;
    const acceleration = fraction * ((cran / CRANS_MAX) * POUSSEE_MAX);
    const axe = Vector2.fromAngle(assiette - Math.PI / 2);

    // 5. Gravité, toujours vers le bas, réservoir plein ou vide.
    const velocity = this.velocity
      .add(axe.scale(acceleration * dt))
      .add(new Vector2(0, MOON_GRAVITY * dt));

    // 6. Position, intégrée depuis la vitesse mise à jour.
    const position = this.position.add(velocity.scale(dt));

    return new Lander(
      this.id,
      position,
      velocity,
      assiette,
      cran,
      carburant,
      this.radius,
      this.inerte,
    );
  }
}

/** Vrai quand le réservoir est à sec : plus aucune poussée possible. */
export function sansCarburant(lem: Lander): boolean {
  return lem.carburant <= 0;
}

/**
 * Poussée (m/s²) que le LEM délivre dans l'état où il est, 0 réservoir vide.
 *
 * C'est la valeur instantanée, celle qu'affiche le HUD. Sur le pas de temps
 * précis où le réservoir se vide, `step` intègre moins que ça : la poussée y est
 * proportionnée au carburant qui restait.
 */
export function poussee(lem: Lander): number {
  if (sansCarburant(lem)) return 0;
  return (lem.cran / CRANS_MAX) * POUSSEE_MAX;
}
