import { describe, it, expect } from "vitest";
import { Vector2 } from "@lem/engine";
import {
  GLYPHES,
  HAUTEUR_GLYPHE,
  LARGEUR_GLYPHE,
  dessineTexte,
  mesureTexte,
  type CibleDessin,
} from "./font.ts";

interface Rect {
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
  couleur: string;
}

/** Cible espionne : elle retient les rectangles au lieu de peindre. */
function espion(): CibleDessin & { rects: Rect[] } {
  const rects: Rect[] = [];
  return {
    rects,
    fillRect(at, largeur, hauteur, couleur) {
      rects.push({ x: at.x, y: at.y, largeur, hauteur, couleur });
    },
  };
}

/** Développe des rectangles en ensemble de pixels « x,y ». */
function pixelsDeRects(rects: readonly Rect[]): Set<string> {
  const pixels = new Set<string>();
  for (const r of rects) {
    for (let dy = 0; dy < r.hauteur; dy++) {
      for (let dx = 0; dx < r.largeur; dx++) {
        pixels.add(`${r.x + dx},${r.y + dy}`);
      }
    }
  }
  return pixels;
}

/** Rendu naïf de référence : un pixel allumé = un pixel dans l'ensemble. */
function pixelsNaifs(
  glyphe: readonly string[],
  echelle = 1,
  ox = 0,
  oy = 0,
): Set<string> {
  const pixels = new Set<string>();
  glyphe.forEach((motif, ligne) => {
    for (let col = 0; col < motif.length; col++) {
      if (motif[col] !== "#") continue;
      for (let dy = 0; dy < echelle; dy++) {
        for (let dx = 0; dx < echelle; dx++) {
          pixels.add(`${ox + col * echelle + dx},${oy + ligne * echelle + dy}`);
        }
      }
    }
  });
  return pixels;
}

/** Compte les suites maximales de pixels allumés, ligne par ligne. */
function nombreDeSegments(glyphe: readonly string[]): number {
  let total = 0;
  for (const motif of glyphe) {
    total += (motif.match(/#+/g) ?? []).length;
  }
  return total;
}

const PONCTUATION = [
  ".",
  ",",
  ":",
  ";",
  "-",
  "+",
  "/",
  "%",
  "°",
  "'",
  '"',
  "!",
  "?",
  "(",
  ")",
  "[",
  "]",
  "<",
  ">",
  "=",
  "*",
];

describe("GLYPHES", () => {
  it("n'a que des glyphes de 7 lignes de 5 caractères", () => {
    for (const [cle, glyphe] of Object.entries(GLYPHES)) {
      expect(glyphe, `glyphe ${cle}`).toHaveLength(HAUTEUR_GLYPHE);
      for (const ligne of glyphe) {
        expect(ligne.length, `glyphe ${cle} : « ${ligne} »`).toBe(
          LARGEUR_GLYPHE,
        );
      }
    }
  });

  it("n'utilise que « # » et l'espace", () => {
    for (const [cle, glyphe] of Object.entries(GLYPHES)) {
      for (const ligne of glyphe) {
        const propre = /^[# ]+$/.test(ligne);
        expect(propre, `glyphe ${cle} : « ${ligne} »`).toBe(true);
      }
    }
  });

  it("couvre A–Z, 0–9, l'espace et la ponctuation attendue", () => {
    const lettres = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    const chiffres = "0123456789".split("");
    for (const c of [...lettres, ...chiffres, " ", ...PONCTUATION]) {
      expect(GLYPHES[c], `glyphe attendu pour « ${c} »`).toBeDefined();
    }
  });
});

describe("mesureTexte", () => {
  it("compte 1 pixel d'espacement entre les glyphes", () => {
    expect(mesureTexte("AB")).toBe(11);
    expect(mesureTexte("A")).toBe(5);
    expect(mesureTexte("ABC")).toBe(17);
  });

  it("rend 0 sur un texte vide", () => {
    expect(mesureTexte("")).toBe(0);
    expect(mesureTexte("", { echelle: 4 })).toBe(0);
  });

  it("double la largeur à l'échelle 2", () => {
    expect(mesureTexte("AB", { echelle: 2 })).toBe(22);
    expect(mesureTexte("ALTITUDE", { echelle: 2 })).toBe(
      mesureTexte("ALTITUDE") * 2,
    );
  });

  it("ramène à 1 une échelle non entière ou inférieure à 1", () => {
    for (const echelle of [0, -3, 0.5, 1.5, Number.NaN]) {
      expect(mesureTexte("AB", { echelle })).toBe(11);
    }
  });

  it("tient compte d'un espacement personnalisé", () => {
    expect(mesureTexte("AB", { espacement: 0 })).toBe(10);
    expect(mesureTexte("AB", { espacement: 2 })).toBe(12);
  });
});

describe("dessineTexte", () => {
  it("ne dessine rien sur un texte vide", () => {
    const cible = espion();
    dessineTexte(cible, "", Vector2.ZERO, "#fff");
    expect(cible.rects).toHaveLength(0);
  });

  it("passe le texte en majuscules", () => {
    const minuscule = espion();
    const majuscule = espion();
    dessineTexte(minuscule, "lem", Vector2.ZERO, "#fff");
    dessineTexte(majuscule, "LEM", Vector2.ZERO, "#fff");
    expect(minuscule.rects).toEqual(majuscule.rects);
  });

  it("remplace un caractère inconnu par « ? » sans lever", () => {
    const inconnu = espion();
    const attendu = espion();
    expect(() =>
      dessineTexte(inconnu, "€", Vector2.ZERO, "#fff"),
    ).not.toThrow();
    dessineTexte(attendu, "?", Vector2.ZERO, "#fff");
    expect(inconnu.rects).toEqual(attendu.rects);
    expect(inconnu.rects.length).toBeGreaterThan(0);
  });

  it("reporte la couleur demandée sur chaque rectangle", () => {
    const cible = espion();
    dessineTexte(cible, "A", Vector2.ZERO, "#e33d3d");
    expect(cible.rects.every((r) => r.couleur === "#e33d3d")).toBe(true);
  });

  it("aligne à gauche par défaut, et respecte center et right", () => {
    const gauche = espion();
    const droite = espion();
    const centre = espion();
    dessineTexte(gauche, "AB", new Vector2(0, 0), "#fff");
    dessineTexte(droite, "AB", new Vector2(100, 0), "#fff", { align: "right" });
    dessineTexte(centre, "AB", new Vector2(100, 0), "#fff", {
      align: "center",
    });
    // 89 = 100 - mesureTexte("AB")
    expect(droite.rects.map((r) => r.x - 89)).toEqual(
      gauche.rects.map((r) => r.x),
    );
    // 95 = round(100 - 11 / 2)
    expect(centre.rects.map((r) => r.x - 95)).toEqual(
      gauche.rects.map((r) => r.x),
    );
  });

  it("n'émet que des coordonnées entières", () => {
    const cible = espion();
    dessineTexte(cible, "ALTITUDE 0000 M", new Vector2(12.4, 7.6), "#fff", {
      align: "center",
      echelle: 2,
    });
    for (const r of cible.rects) {
      expect(Number.isInteger(r.x)).toBe(true);
      expect(Number.isInteger(r.y)).toBe(true);
    }
  });
});

describe("rendu par segments", () => {
  for (const caractere of ["H", "%", "8", "E", "A"]) {
    it(`couvre les pixels du rendu naïf sur « ${caractere} »`, () => {
      const glyphe = GLYPHES[caractere];
      expect(glyphe).toBeDefined();
      const cible = espion();
      dessineTexte(cible, caractere, Vector2.ZERO, "#fff");
      expect([...pixelsDeRects(cible.rects)].sort()).toEqual(
        [...pixelsNaifs(glyphe ?? [])].sort(),
      );
    });

    it(`émet un rectangle par segment sur « ${caractere} »`, () => {
      const glyphe = GLYPHES[caractere] ?? [];
      const cible = espion();
      dessineTexte(cible, caractere, Vector2.ZERO, "#fff");
      // Un rectangle par suite maximale de pixels allumés : c'est exactement ce
      // que « dessin par segments » veut dire.
      expect(cible.rects).toHaveLength(nombreDeSegments(glyphe));
      // Aucun rectangle vide, et jamais plus d'un pixel de haut à l'échelle 1.
      for (const r of cible.rects) {
        expect(r.largeur).toBeGreaterThan(0);
        expect(r.hauteur).toBe(1);
      }
    });
  }

  it("réduit le nombre d'appels sur un glyphe à lignes pleines", () => {
    const cible = espion();
    dessineTexte(cible, "E", Vector2.ZERO, "#fff");
    expect(cible.rects.length).toBeLessThan(pixelsDeRects(cible.rects).size);
  });

  it("peint une ligne pleine en un seul rectangle", () => {
    const cible = espion();
    dessineTexte(cible, "T", Vector2.ZERO, "#fff");
    const premiere = cible.rects.filter((r) => r.y === 0);
    expect(premiere).toHaveLength(1);
    expect(premiere[0]?.largeur).toBe(LARGEUR_GLYPHE);
  });

  it("respecte le rendu naïf à l'échelle 2, décalage compris", () => {
    const cible = espion();
    dessineTexte(cible, "8", new Vector2(30, 10), "#fff", { echelle: 2 });
    const glyphe = GLYPHES["8"] ?? [];
    expect([...pixelsDeRects(cible.rects)].sort()).toEqual(
      [...pixelsNaifs(glyphe, 2, 30, 10)].sort(),
    );
  });

  it("place les glyphes suivants au pas attendu", () => {
    const cible = espion();
    dessineTexte(cible, "TT", Vector2.ZERO, "#fff");
    const premieres = cible.rects.filter((r) => r.y === 0);
    expect(premieres.map((r) => r.x)).toEqual([0, LARGEUR_GLYPHE + 1]);
  });
});
