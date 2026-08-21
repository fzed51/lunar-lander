// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { KeyboardInput } from "./KeyboardInput.ts";

type Cmd = "left" | "fire";

const mapping = { ArrowLeft: "left", Space: "fire" } as const;

let input: KeyboardInput<Cmd>;

beforeEach(() => {
  input = new KeyboardInput<Cmd>(mapping);
});
afterEach(() => {
  input.dispose();
});

function key(type: "keydown" | "keyup", code: string) {
  window.dispatchEvent(new KeyboardEvent(type, { code }));
}

describe("KeyboardInput", () => {
  it("isActive suit l'état enfoncé/relâché", () => {
    key("keydown", "ArrowLeft");
    let snap = input.poll();
    expect(snap.isActive("left")).toBe(true);
    expect(snap.isActive("fire")).toBe(false);

    key("keyup", "ArrowLeft");
    snap = input.poll();
    expect(snap.isActive("left")).toBe(false);
  });

  it("justPressed n'est vrai qu'une fois par appui", () => {
    key("keydown", "Space");
    expect(input.poll().justPressed("fire")).toBe(true);
    // toujours enfoncée mais plus « fraîchement pressée »
    expect(input.poll().justPressed("fire")).toBe(false);
  });

  it("justPressed survit à une frame skippée (drainé par poll, pas par frame)", () => {
    // Appui survenu alors qu'aucun poll n'a eu lieu (frame skippée par le limiter).
    key("keydown", "Space");
    key("keyup", "Space");
    // Le prochain poll (tick réellement exécuté) doit voir l'appui.
    expect(input.poll().justPressed("fire")).toBe(true);
  });

  it("ignore les touches non mappées", () => {
    key("keydown", "KeyZ");
    const snap = input.poll();
    expect(snap.isActive("left")).toBe(false);
    expect(snap.isActive("fire")).toBe(false);
  });
});

/** Variante de `key` qui porte des modificateurs et laisse lire `defaultPrevented`. */
function toucheAvec(
  type: "keydown" | "keyup",
  code: string,
  init: KeyboardEventInit = {},
): KeyboardEvent {
  const e = new KeyboardEvent(type, { code, cancelable: true, ...init });
  window.dispatchEvent(e);
  return e;
}

describe("KeyboardInput — perte de focus", () => {
  it("relâche toutes les commandes actives sur un blur", () => {
    key("keydown", "ArrowLeft");
    key("keydown", "Space");
    expect(input.poll().isActive("left")).toBe(true);

    window.dispatchEvent(new Event("blur"));

    const snap = input.poll();
    expect(snap.isActive("left")).toBe(false);
    expect(snap.isActive("fire")).toBe(false);
  });

  it("refonctionne normalement après le blur", () => {
    key("keydown", "ArrowLeft");
    window.dispatchEvent(new Event("blur"));
    input.poll();

    key("keydown", "ArrowLeft");
    const snap = input.poll();
    expect(snap.isActive("left")).toBe(true);
    expect(snap.justPressed("left")).toBe(true);
  });

  it("conserve un front montant déjà enregistré", () => {
    // L'appui a vraiment eu lieu : le prochain poll doit encore le voir, même
    // si la touche n'est plus considérée comme enfoncée.
    key("keydown", "Space");
    window.dispatchEvent(new Event("blur"));

    const snap = input.poll();
    expect(snap.justPressed("fire")).toBe(true);
    expect(snap.isActive("fire")).toBe(false);
  });
});

describe("KeyboardInput — raccourcis à modificateur", () => {
  for (const modificateur of ["ctrlKey", "metaKey", "altKey"] as const) {
    it(`ignore un keydown avec ${modificateur} et laisse le navigateur agir`, () => {
      const e = toucheAvec("keydown", "ArrowLeft", { [modificateur]: true });

      const snap = input.poll();
      expect(snap.isActive("left")).toBe(false);
      expect(snap.justPressed("left")).toBe(false);
      expect(e.defaultPrevented).toBe(false);
    });
  }

  it("laisse passer shiftKey, qui ne porte aucun raccourci navigateur", () => {
    const e = toucheAvec("keydown", "ArrowLeft", { shiftKey: true });

    expect(input.poll().isActive("left")).toBe(true);
    expect(e.defaultPrevented).toBe(true);
  });

  it("la même touche sans modificateur fonctionne juste après", () => {
    toucheAvec("keydown", "Space", { metaKey: true });
    expect(input.poll().justPressed("fire")).toBe(false);

    key("keydown", "Space");
    expect(input.poll().justPressed("fire")).toBe(true);
  });

  it("un keyup avec modificateur libère quand même la commande", () => {
    // Touche enfoncée seule, relâchée après avoir attrapé un Ctrl en route :
    // sans ce traitement, la commande resterait active pour toujours.
    key("keydown", "ArrowLeft");
    expect(input.poll().isActive("left")).toBe(true);

    toucheAvec("keyup", "ArrowLeft", { ctrlKey: true });
    expect(input.poll().isActive("left")).toBe(false);
  });

  it("empêche l'action par défaut d'une touche mappée sans modificateur", () => {
    const e = toucheAvec("keydown", "Space");
    expect(e.defaultPrevented).toBe(true);
  });
});
