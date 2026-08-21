// Point d'entrée public du moteur.

export { Vector2 } from "./math/Vector2.ts";
export { wrap, toroidalDelta } from "./math/wrap.ts";

export type { EntityBase, Steppable } from "./core/Entity.ts";
export {
  type GameState,
  withEntities,
  withGlobals,
  addEntities,
  removeEntities,
  byKind,
  findById,
} from "./core/GameState.ts";
export {
  Scene,
  type TickContext,
  type PairHandler,
  type TickRule,
  type Reducer,
  type Effect,
} from "./core/Scene.ts";
export { GameLoop, type GameLoopOptions } from "./core/GameLoop.ts";

export type { EventBase } from "./events/GameEvent.ts";

export type { InputSnapshot } from "./input/InputSnapshot.ts";
export type { InputSource } from "./input/InputSource.ts";
export { KeyboardInput } from "./input/KeyboardInput.ts";

export {
  circlesOverlap,
  circlesOverlapToroidal,
  collisionPairs,
} from "./physics/collision.ts";

export {
  Renderer,
  type StrokeFill,
  type TextOptions,
} from "./render/Renderer.ts";
