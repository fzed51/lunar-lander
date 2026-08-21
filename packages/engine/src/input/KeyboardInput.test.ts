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
