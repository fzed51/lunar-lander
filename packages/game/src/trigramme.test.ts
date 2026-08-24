import { createRng } from "@lem/engine";
import { describe, expect, it } from "vitest";
import {
  descend,
  droite,
  gauche,
  LETTRES,
  lettreDe,
  monte,
  texte,
  trigrammeInitial,
  type Trigramme,
} from "./trigramme.ts";

/** Applique une suite d'opérations, de la première à la dernière. */
function enchaine(
  depart: Trigramme,
  ...operations: readonly ((t: Trigramme) => Trigramme)[]
): Trigramme {
  return operations.reduce((courant, operation) => operation(courant), depart);
}

/** Répète une opération `n` fois. */
function repete(
  depart: Trigramme,
  n: number,
  operation: (t: Trigramme) => Trigramme,
): Trigramme {
  let courant = depart;
  for (let i = 0; i < n; i++) courant = operation(courant);
  return courant;
}

describe("trigrammeInitial", () => {
  it("part de AAA, curseur sur la première lettre", () => {
    const t = trigrammeInitial();
    expect(texte(t)).toBe("AAA");
    expect(t.position).toBe(0);
    expect(t.lettres).toEqual([0, 0, 0]);
  });

  it("rend un trigramme neuf à chaque appel", () => {
    const premier = monte(trigrammeInitial());
    expect(texte(premier)).toBe("BAA");
    expect(texte(trigrammeInitial())).toBe("AAA");
  });
});

describe("monte et descend — défilement en boucle", () => {
  it("avance d'une lettre", () => {
    expect(texte(monte(trigrammeInitial()))).toBe("BAA");
  });

  it("revient sur A après 26 montées", () => {
    expect(texte(repete(trigrammeInitial(), 26, monte))).toBe("AAA");
    expect(texte(repete(trigrammeInitial(), 25, monte))).toBe("ZAA");
  });

  it("passe de A à Z en descendant", () => {
    expect(texte(descend(trigrammeInitial()))).toBe("ZAA");
    expect(texte(repete(trigrammeInitial(), 26, descend))).toBe("AAA");
  });

  it("ne touche qu'à la lettre courante", () => {
    const t = enchaine(trigrammeInitial(), monte, droite, monte, monte);
    expect(texte(t)).toBe("BCA");
    expect(t.position).toBe(1);
  });

  it("laisse le trigramme de départ intact", () => {
    // État immuable : `monte` rend un nouveau trigramme, il ne modifie pas
    // celui qu'on lui donne.
    const depart = trigrammeInitial();
    monte(depart);
    descend(depart);
    expect(texte(depart)).toBe("AAA");
  });
});

describe("gauche et droite — positions bornées", () => {
  it("se déplace d'une position à la fois", () => {
    expect(droite(trigrammeInitial()).position).toBe(1);
    expect(enchaine(trigrammeInitial(), droite, droite).position).toBe(2);
    expect(enchaine(trigrammeInitial(), droite, droite, gauche).position).toBe(
      1,
    );
  });

  it("reste en position 0 quand on va à gauche depuis la première lettre", () => {
    expect(repete(trigrammeInitial(), 5, gauche).position).toBe(0);
  });

  it("reste en position 2 quand on va à droite depuis la dernière lettre", () => {
    // Pas de rebouclage des positions : une droite qui ramènerait en première
    // lettre ferait valider par accident le trigramme qu'on corrige.
    expect(repete(trigrammeInitial(), 5, droite).position).toBe(2);
  });

  it("ne change aucune lettre en changeant de position", () => {
    const t = enchaine(trigrammeInitial(), monte, monte, droite, gauche);
    expect(texte(t)).toBe("CAA");
  });
});

describe("texte — trois majuscules, quoi qu'il arrive", () => {
  it("rend les trois lettres dans l'ordre", () => {
    const t = enchaine(
      trigrammeInitial(),
      descend, // Z
      droite,
      monte, // B
      droite,
      monte,
      monte, // C
    );
    expect(texte(t)).toBe("ZBC");
  });

  it("ne rend que des lettres de A à Z après un millier d'appuis", () => {
    // Tirage à graine fixée : la suite d'appuis est aléatoire mais reproductible
    // à l'identique d'une exécution à l'autre.
    const rng = createRng(19690720);
    const operations = [monte, descend, gauche, droite] as const;
    let t = trigrammeInitial();
    for (let i = 0; i < 1000; i++) {
      const operation = operations[rng.int(0, operations.length - 1)];
      if (!operation) throw new Error("tirage hors des opérations connues");
      t = operation(t);
      expect(texte(t)).toMatch(/^[A-Z]{3}$/);
    }
    for (const index of t.lettres) {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(LETTRES.length);
    }
    expect([0, 1, 2]).toContain(t.position);
  });

  it("parcourt tout l'alphabet, sans trou ni doublon", () => {
    let t = trigrammeInitial();
    const vues: string[] = [];
    for (let i = 0; i < LETTRES.length; i++) {
      vues.push(texte(t)[0] ?? "");
      t = monte(t);
    }
    expect(vues.join("")).toBe(LETTRES);
  });
});

describe("lettreDe — repli sur un index impossible", () => {
  it("rend la lettre de l'index", () => {
    expect(lettreDe(0)).toBe("A");
    expect(lettreDe(25)).toBe("Z");
  });

  it("ne sort jamais de l'alphabet, même sur une valeur aberrante", () => {
    // Un état fabriqué à la main plutôt que construit par le module : `texte`
    // doit rendre trois majuscules quand même.
    expect(lettreDe(-1)).toBe("Z");
    expect(lettreDe(26)).toBe("A");
    expect(lettreDe(Number.NaN)).toBe("A");
    const bricole: Trigramme = { lettres: [99, -4, Number.NaN], position: 0 };
    expect(texte(bricole)).toMatch(/^[A-Z]{3}$/);
  });
});
