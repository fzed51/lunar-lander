import { describe, it, expect } from "vitest";
import { PALETTE } from "./palette.ts";
import {
  litCssCommite,
  litPalette,
  rendCss,
  versKebab,
} from "../../scripts/gen-palette-css.mjs";

/** Palette relue sur disque : c'est elle, et non le module, qui fait foi. */
const surDisque: Record<string, string> = litPalette();

describe("palette.json", () => {
  it("compte exactement 16 entrées", () => {
    expect(Object.keys(surDisque)).toHaveLength(16);
  });

  it("n'utilise que des hexadécimaux #rrggbb en minuscules", () => {
    for (const [cle, valeur] of Object.entries(surDisque)) {
      expect(valeur, `couleur ${cle}`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("ne contient aucun doublon de valeur", () => {
    const valeurs = Object.values(surDisque);
    expect(new Set(valeurs).size).toBe(valeurs.length);
  });
});

describe("PALETTE", () => {
  it("reflète le JSON de la source, clé pour clé et dans l'ordre", () => {
    expect(Object.entries(PALETTE)).toEqual(Object.entries(surDisque));
  });

  it("est figée : aucune couleur ne se réécrit à l'exécution", () => {
    expect(Object.isFrozen(PALETTE)).toBe(true);
  });
});

describe("versKebab", () => {
  it("découpe le camelCase en kebab-case", () => {
    expect(versKebab("espace")).toBe("espace");
    expect(versKebab("reliefSombre")).toBe("relief-sombre");
    expect(versKebab("terreOcean")).toBe("terre-ocean");
  });
});

describe("rendCss", () => {
  it("est idempotent : deux appels, la même chaîne octet pour octet", () => {
    expect(rendCss(surDisque)).toBe(rendCss(surDisque));
  });

  it("déclare une variable --lem-… par couleur, et rien de plus", () => {
    const css = rendCss(surDisque);
    const declarees = [...css.matchAll(/--lem-[a-z-]+/g)].map((m) => m[0]);
    expect(declarees).toEqual(
      Object.keys(surDisque).map((cle) => `--lem-${versKebab(cle)}`),
    );
  });

  it("porte l'avertissement « fichier généré »", () => {
    expect(rendCss(surDisque)).toContain("GÉNÉRÉ");
  });
});

describe("palette.css commité", () => {
  it("est à jour vis-à-vis de palette.json", () => {
    // Lecture seule des deux fichiers : ce test ne régénère RIEN, sinon il
    // réparerait la désynchronisation qu'il doit détecter.
    const commite: string = litCssCommite();
    expect(commite).toBe(rendCss(surDisque));
  });
});
