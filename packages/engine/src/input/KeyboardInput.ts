import type { InputSnapshot } from "./InputSnapshot.ts";
import type { InputSource } from "./InputSource.ts";

/**
 * Source clavier générique. Le `mapping` associe des `KeyboardEvent.code`
 * (ex. "ArrowLeft", "Space") aux noms de commandes du jeu.
 *
 * `justPressed` reflète les touches pressées depuis le DERNIER `poll()`, pas
 * depuis la dernière frame : un appui survenu pendant une frame skippée par le
 * frame limiter n'est pas perdu.
 */
export class KeyboardInput<C extends string> implements InputSource<C> {
  private readonly active = new Set<C>();
  private readonly pressedSincePoll = new Set<C>();
  private readonly onKeyDown: (e: KeyboardEvent) => void;
  private readonly onKeyUp: (e: KeyboardEvent) => void;
  private readonly target: EventTarget;

  constructor(
    private readonly mapping: Readonly<Record<string, C>>,
    target: EventTarget = window,
  ) {
    this.target = target;
    this.onKeyDown = (e) => {
      const cmd = this.mapping[(e as KeyboardEvent).code];
      if (cmd === undefined) return;
      (e as KeyboardEvent).preventDefault?.();
      if (!this.active.has(cmd)) this.pressedSincePoll.add(cmd);
      this.active.add(cmd);
    };
    this.onKeyUp = (e) => {
      const cmd = this.mapping[(e as KeyboardEvent).code];
      if (cmd === undefined) return;
      this.active.delete(cmd);
    };
    this.target.addEventListener("keydown", this.onKeyDown as EventListener);
    this.target.addEventListener("keyup", this.onKeyUp as EventListener);
  }

  poll(): InputSnapshot<C> {
    const active = new Set(this.active);
    const pressed = new Set(this.pressedSincePoll);
    this.pressedSincePoll.clear();
    return {
      isActive: (c) => active.has(c),
      justPressed: (c) => pressed.has(c),
    };
  }

  dispose(): void {
    this.target.removeEventListener("keydown", this.onKeyDown as EventListener);
    this.target.removeEventListener("keyup", this.onKeyUp as EventListener);
    this.active.clear();
    this.pressedSincePoll.clear();
  }
}
