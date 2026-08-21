export interface GameLoopOptions {
  /** Durée minimale d'un tick (s). En dessous, la frame est skippée. Défaut 1/60. */
  minFrameTime?: number;
  /** Borne haute du dt (s), anti-tunneling en cas de lag. Défaut 1/30. */
  maxDt?: number;
  /** Horloge en millisecondes (injectable pour les tests). Défaut performance.now. */
  now?: () => number;
  /** Planificateur de frame (injectable). Défaut requestAnimationFrame. */
  schedule?: (cb: (t: number) => void) => number;
  /** Annulation de frame (injectable). Défaut cancelAnimationFrame. */
  cancel?: (id: number) => void;
}

/**
 * Boucle de jeu générique sur l'état `S` (ne connaît même pas les entités).
 *
 * Frame limiter : si l'écoulé depuis le dernier tick traité < minFrameTime, la
 * frame est skippée SANS mettre à jour l'horloge de référence (sinon le dt
 * resterait toujours sous le seuil sur écran 120 Hz et rien ne s'exécuterait).
 * Le dt effectif est clampé à maxDt.
 */
export class GameLoop<S> {
  private readonly minFrameTime: number;
  private readonly maxDt: number;
  private readonly now: () => number;
  private readonly schedule: (cb: (t: number) => void) => number;
  private readonly cancel: (id: number) => void;

  private current!: S;
  private lastMs = 0;
  private frameId: number | null = null;
  private running = false;

  constructor(
    private readonly onTick: (s: S, dt: number) => S,
    private readonly onRender: (s: S) => void,
    opts: GameLoopOptions = {},
  ) {
    this.minFrameTime = opts.minFrameTime ?? 1 / 60;
    this.maxDt = opts.maxDt ?? 1 / 30;
    this.now = opts.now ?? (() => performance.now());
    this.schedule =
      opts.schedule ?? ((cb) => requestAnimationFrame(cb));
    this.cancel = opts.cancel ?? ((id) => cancelAnimationFrame(id));
  }

  get state(): S {
    return this.current;
  }

  start(initial: S): void {
    this.current = initial;
    this.lastMs = this.now();
    this.running = true;
    this.onRender(this.current);
    this.frameId = this.schedule((t) => this.frame(t));
  }

  stop(): void {
    this.running = false;
    if (this.frameId !== null) {
      this.cancel(this.frameId);
      this.frameId = null;
    }
  }

  private frame(nowMs: number): void {
    if (!this.running) return;
    this.frameId = this.schedule((t) => this.frame(t));

    const elapsed = (nowMs - this.lastMs) / 1000;
    if (elapsed < this.minFrameTime) return; // skip — NE PAS toucher lastMs

    this.lastMs = nowMs;
    const dt = Math.min(elapsed, this.maxDt);
    this.current = this.onTick(this.current, dt);
    this.onRender(this.current);
  }
}
