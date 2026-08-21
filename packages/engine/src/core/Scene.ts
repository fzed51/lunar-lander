import type { EntityBase, Steppable } from "./Entity.ts";
import {
  type GameState,
  withEntities,
} from "./GameState.ts";
import type { EventBase } from "../events/GameEvent.ts";
import type { InputSnapshot } from "../input/InputSnapshot.ts";
import type { InputSource } from "../input/InputSource.ts";
import { circlesOverlap, collisionPairs } from "../physics/collision.ts";

/** Contexte fourni aux règles de tick (phase interact). */
export interface TickContext<C extends string> {
  readonly input: InputSnapshot<C>;
  readonly dt: number;
}

/** Handler d'interaction entre deux entités : retourne des événements, ne mute rien. */
export type PairHandler<A, B, S, Ev> = (a: A, b: B, state: S) => readonly Ev[];

/** Règle évaluée à chaque tick (tir, TTL, fin de vague…) : émet des événements. */
export type TickRule<S, Ev, C extends string> = (
  state: S,
  ctx: TickContext<C>,
) => readonly Ev[];

/** Reducer pur appliqué en phase « état final ». */
export type Reducer<S, Ev> = (state: S, event: Ev) => S;

/** Effet de bord (sons…) exécuté APRÈS le calcul de l'état final. Hors état. */
export type Effect<Ev> = (events: readonly Ev[]) => void;

interface PairRegistration<E extends EntityBase, Ev, G> {
  a: string;
  b: string;
  handler: PairHandler<E, E, GameState<E, G>, Ev>;
}

/**
 * Orchestrateur générique d'un tick. Ne connaît aucun type du jeu : celui-ci
 * enregistre ses interactions (`onPair`), ses règles (`onTick`), ses reducers
 * (`on`) et ses effets (`addEffect`).
 *
 * Un tick applique exactement : input → move → interact → état final.
 */
export class Scene<
  E extends EntityBase & Steppable<E, C>,
  Ev extends EventBase,
  G,
  C extends string,
> {
  private readonly input: InputSource<C>;
  private readonly overlaps: (a: E, b: E) => boolean;
  private readonly pairs: PairRegistration<E, Ev, G>[] = [];
  private readonly tickRules: TickRule<GameState<E, G>, Ev, C>[] = [];
  private readonly reducers = new Map<
    string,
    Reducer<GameState<E, G>, Ev>
  >();
  private readonly effects: Effect<Ev>[] = [];

  constructor(opts: {
    input: InputSource<C>;
    /** Prédicat de recouvrement ; défaut = cercles euclidiens. */
    overlaps?: (a: E, b: E) => boolean;
  }) {
    this.input = opts.input;
    this.overlaps = opts.overlaps ?? circlesOverlap;
  }

  /** Enregistre une interaction par paire de `kind` (ordre indifférent). */
  onPair<KA extends E["kind"], KB extends E["kind"]>(
    a: KA,
    b: KB,
    handler: PairHandler<
      Extract<E, { kind: KA }>,
      Extract<E, { kind: KB }>,
      GameState<E, G>,
      Ev
    >,
  ): this {
    this.pairs.push({
      a,
      b,
      handler: handler as unknown as PairHandler<E, E, GameState<E, G>, Ev>,
    });
    return this;
  }

  /** Enregistre une règle évaluée chaque tick. */
  onTick(rule: TickRule<GameState<E, G>, Ev, C>): this {
    this.tickRules.push(rule);
    return this;
  }

  /** Enregistre le reducer d'un type d'événement (phase état final). */
  on<T extends Ev["type"]>(
    type: T,
    reducer: Reducer<GameState<E, G>, Extract<Ev, { type: T }>>,
  ): this {
    this.reducers.set(
      type,
      reducer as unknown as Reducer<GameState<E, G>, Ev>,
    );
    return this;
  }

  /** Enregistre un effet de bord déclenché après l'état final. */
  addEffect(effect: Effect<Ev>): this {
    this.effects.push(effect);
    return this;
  }

  /** Applique les handlers de paire aux collisions détectées. */
  private interactPairs(state: GameState<E, G>): Ev[] {
    if (this.pairs.length === 0) return [];
    const events: Ev[] = [];
    for (const [x, y] of collisionPairs(state.entities, this.overlaps)) {
      for (const reg of this.pairs) {
        if (reg.a === x.kind && reg.b === y.kind) {
          events.push(...reg.handler(x, y, state));
        } else if (reg.a === y.kind && reg.b === x.kind) {
          events.push(...reg.handler(y, x, state));
        }
      }
    }
    return events;
  }

  /** Un tick complet. Pur, hormis les effets de bord enregistrés. */
  tick(state: GameState<E, G>, dt: number): GameState<E, G> {
    // phase input
    const input = this.input.poll();

    // phase move
    let moved = withEntities(
      state,
      state.entities.map((e) => e.step(dt, input)),
    );
    moved = { ...moved, time: state.time + dt };

    // phase interact (ne mute rien : produit des événements)
    const ctx: TickContext<C> = { input, dt };
    const events: Ev[] = [
      ...this.interactPairs(moved),
      ...this.tickRules.flatMap((rule) => rule(moved, ctx)),
    ];

    // phase état final (fold des reducers)
    const final = events.reduce<GameState<E, G>>((s, ev) => {
      const reducer = this.reducers.get(ev.type);
      return reducer ? reducer(s, ev) : s;
    }, moved);

    // effets de bord (sons…), hors état
    for (const effect of this.effects) effect(events);

    return final;
  }
}
