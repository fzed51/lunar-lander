import { describe, it, expect, vi } from "vitest";
import { GameLoop } from "./GameLoop.ts";

/**
 * Horloge et planificateur simulés : on contrôle le temps et on déclenche les
 * frames à la main pour tester le frame limiter de façon déterministe.
 */
function harness() {
  let nowMs = 0;
  const callbacks: ((t: number) => void)[] = [];
  const now = () => nowMs;
  const schedule = (cb: (t: number) => void) => {
    callbacks.push(cb);
    return callbacks.length;
  };
  const cancel = vi.fn();
  const setNow = (ms: number) => {
    nowMs = ms;
  };
  /** Déclenche la dernière frame planifiée avec l'horloge courante. */
  const fire = () => {
    const cb = callbacks.pop();
    cb?.(nowMs);
  };
  return { now, schedule, cancel, setNow, fire };
}

describe("GameLoop — frame limiter", () => {
  it("skippe les frames sous minFrameTime SANS geler (pas de reset de lastMs)", () => {
    const h = harness();
    const tick = vi.fn((s: number, dt: number) => s + dt);
    const loop = new GameLoop<number>(tick, () => {}, {
      minFrameTime: 1 / 60, // ~16.67 ms
      now: h.now,
      schedule: h.schedule,
      cancel: h.cancel,
    });
    loop.start(0);
    tick.mockClear();

    // Écran 120 Hz : frames toutes les ~8.33 ms.
    h.setNow(8.33);
    h.fire();
    expect(tick).not.toHaveBeenCalled(); // skippée

    // 20 ms depuis le dernier tick (lastMs resté à 0) → exécute.
    h.setNow(20);
    h.fire();
    expect(tick).toHaveBeenCalledOnce();
    expect(tick.mock.calls[0]![1]).toBeCloseTo(20 / 1000);
  });

  it("clampe le dt à maxDt en cas de gros écart (onglet inactif)", () => {
    const h = harness();
    const tick = vi.fn((s: number, dt: number) => s + dt);
    const loop = new GameLoop<number>(tick, () => {}, {
      minFrameTime: 1 / 60,
      maxDt: 1 / 30, // ~33.3 ms
      now: h.now,
      schedule: h.schedule,
      cancel: h.cancel,
    });
    loop.start(0);
    tick.mockClear();

    h.setNow(5000); // 5 s d'écart
    h.fire();
    expect(tick).toHaveBeenCalledOnce();
    expect(tick.mock.calls[0]![1]).toBeCloseTo(1 / 30);
  });

  it("stop empêche tout tick ultérieur", () => {
    const h = harness();
    const tick = vi.fn((s: number, dt: number) => s + dt);
    const loop = new GameLoop<number>(tick, () => {}, {
      now: h.now,
      schedule: h.schedule,
      cancel: h.cancel,
    });
    loop.start(0);
    tick.mockClear();
    loop.stop();
    h.setNow(1000);
    h.fire();
    expect(tick).not.toHaveBeenCalled();
  });
});
