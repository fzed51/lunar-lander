import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ajouteAuHof,
  CLE_HOF,
  entreeValide,
  estQualifie,
  lisHof,
  normaliseTrigramme,
  TAILLE_HOF,
  videHof,
  type CandidatHof,
  type EntreeHof,
} from "./hof.ts";
import {
  stockageDisponible,
  stockageMemoire,
  stockageNavigateur,
  type Stockage,
} from "./storage.ts";

/** Entrée valide de référence, dont les tests ne changent que ce qui les intéresse. */
function entree(p: Partial<EntreeHof> = {}): EntreeHof {
  return {
    trigramme: "ABC",
    points: 10,
    tempsDeVol: 100,
    manchesReussies: 1,
    niveauDepart: 0,
    date: "2026-08-23T12:00:00.000Z",
    ...p,
  };
}

/** Copie de l'entrée de référence privée d'un de ses champs. */
function sansChamp(cle: keyof EntreeHof): Record<string, unknown> {
  const copie: Record<string, unknown> = { ...entree() };
  delete copie[cle];
  return copie;
}

/** Partie candidate au classement, réduite à ce qu'`estQualifie` regarde. */
function candidat(
  tempsDeVol: number,
  points: number,
  manchesReussies = 1,
): CandidatHof {
  return { tempsDeVol, points, manchesReussies };
}

/** Stockage préchargé avec ce texte brut sous la clé du hall of fame. */
function stockageAvec(brut: string): Stockage {
  const magasin = stockageMemoire();
  magasin.ecrit(CLE_HOF, brut);
  return magasin;
}

/**
 * Stockage préchargé avec `n` entrées de temps de vol décroissant, écrites dans
 * un ordre mélangé : la lecture doit les trier elle-même.
 */
function stockageDe(n: number): Stockage {
  const entrees: EntreeHof[] = [];
  for (let i = 0; i < n; i++) {
    entrees.push(entree({ tempsDeVol: n - i, points: i }));
  }
  return stockageAvec(JSON.stringify([...entrees].reverse()));
}

describe("normaliseTrigramme — trois lettres, quoi qu'on lui donne", () => {
  it("met en capitales et complète les chaînes trop courtes", () => {
    expect(normaliseTrigramme("ab")).toBe("ABA");
    expect(normaliseTrigramme("")).toBe("AAA");
  });

  it("tronque les chaînes trop longues", () => {
    expect(normaliseTrigramme("abcd")).toBe("ABC");
  });

  it("remplace tout ce qui n'est pas une lettre par A", () => {
    expect(normaliseTrigramme("a1!")).toBe("AAA");
    expect(normaliseTrigramme("é9z")).toBe("AAZ");
  });

  it("ne laisse pas passer une balise, même tronquée", () => {
    // `<script>` : le `<` devient un `A`, et il ne reste que trois caractères.
    expect(normaliseTrigramme("<script>")).toBe("ASC");
  });

  it("accepte n'importe quelle valeur, pas seulement une chaîne", () => {
    expect(normaliseTrigramme(null)).toBe("AAA");
    expect(normaliseTrigramme(undefined)).toBe("AAA");
    expect(normaliseTrigramme(42)).toBe("AAA");
    expect(normaliseTrigramme({ trigramme: "XYZ" })).toBe("AAA");
  });

  it("rend toujours exactement trois lettres de A à Z", () => {
    const cas: unknown[] = ["ab", "abcd", "a1!", "<script>", null, 42, [], ""];
    for (const brut of cas) {
      expect(normaliseTrigramme(brut)).toMatch(/^[A-Z]{3}$/);
    }
  });
});

describe("entreeValide — garde sur des données de tiers", () => {
  it("accepte une entrée complète", () => {
    expect(entreeValide(entree())).toBe(true);
  });

  it("refuse ce qui n'est pas un objet", () => {
    expect(entreeValide(null)).toBe(false);
    expect(entreeValide("ABC")).toBe(false);
    expect(entreeValide(42)).toBe(false);
    expect(entreeValide(undefined)).toBe(false);
  });

  it("refuse une entrée sans trigramme ou sans date", () => {
    expect(entreeValide(sansChamp("trigramme"))).toBe(false);
    expect(entreeValide(sansChamp("date"))).toBe(false);
    expect(entreeValide(sansChamp("tempsDeVol"))).toBe(false);
  });

  it("refuse les nombres qui ne sont pas des nombres finis", () => {
    expect(entreeValide(entree({ points: Number.NaN }))).toBe(false);
    expect(entreeValide(entree({ points: Number.POSITIVE_INFINITY }))).toBe(
      false,
    );
    expect(entreeValide({ ...entree(), points: "douze" })).toBe(false);
    expect(entreeValide(entree({ tempsDeVol: -1 }))).toBe(false);
    expect(entreeValide(entree({ niveauDepart: Number.NaN }))).toBe(false);
  });

  it("refuse une entrée sans aucune manche réussie", () => {
    // La règle « aucun posé, aucune place » vaut aussi pour une ligne écrite à
    // la main dans le stockage : la refuser à la lecture est le seul moyen de la
    // tenir sur des données qu'on n'a pas produites.
    expect(entreeValide(entree({ manchesReussies: 0 }))).toBe(false);
    expect(entreeValide(entree({ manchesReussies: 1.5 }))).toBe(false);
  });
});

describe("lisHof — survivre à n'importe quel contenu", () => {
  it("rend une liste vide quand la clé n'existe pas", () => {
    expect(lisHof(stockageMemoire())).toEqual([]);
  });

  it("rend une liste vide sur du texte qui n'est pas du JSON", () => {
    expect(lisHof(stockageAvec("pas du json"))).toEqual([]);
  });

  it("rend une liste vide sur un objet au lieu d'un tableau", () => {
    expect(lisHof(stockageAvec("{}"))).toEqual([]);
  });

  it("rend une liste vide sur un tableau vide", () => {
    expect(lisHof(stockageAvec("[]"))).toEqual([]);
  });

  it("garde la seule entrée valide au milieu de quatre invalides", () => {
    const brut = JSON.stringify([
      null,
      { trigramme: "XYZ" },
      { ...entree(), points: "douze" },
      entree({ tempsDeVol: -3 }),
      entree({ trigramme: "BON" }),
    ]);
    const liste = lisHof(stockageAvec(brut));
    expect(liste).toHaveLength(1);
    expect(liste[0]?.trigramme).toBe("BON");
  });

  it("écarte un nombre infini écrit directement en JSON", () => {
    // `JSON.stringify` transforme `Infinity` en `null` : pour le voir arriver
    // tel quel, il faut passer par du texte brut, comme un éditeur manuel le
    // ferait. `1e999` se relit en `Infinity`.
    const brut = `[{"trigramme":"ABC","points":1e999,"tempsDeVol":10,"manchesReussies":1,"niveauDepart":0,"date":"2026-01-01"}]`;
    expect(lisHof(stockageAvec(brut))).toEqual([]);
  });

  it("normalise le trigramme des entrées lues", () => {
    // Une ligne modifiée à la main garde sa performance, mais pas son trigramme :
    // l'écran du classement reçoit toujours trois lettres.
    const brut = JSON.stringify([{ ...entree(), trigramme: "<b>" }]);
    expect(lisHof(stockageAvec(brut))[0]?.trigramme).toBe("ABA");
  });

  it("ne lève pas quand la lecture elle-même lève", () => {
    const casse: Stockage = {
      lit(): string | null {
        throw new Error("stockage inaccessible");
      },
      ecrit(): void {},
      efface(): void {},
    };
    expect(() => lisHof(casse)).not.toThrow();
    expect(lisHof(casse)).toEqual([]);
  });

  it("tronque à 100 un stockage qui en contient 300", () => {
    // La troncature est testée sur `lisHof` elle-même : c'est elle que voient
    // tous les appelants, `estQualifie` comprise.
    const liste = lisHof(stockageDe(300));
    expect(liste).toHaveLength(TAILLE_HOF);
    expect(liste[0]?.tempsDeVol).toBe(300);
    expect(liste[TAILLE_HOF - 1]?.tempsDeVol).toBe(201);
  });

  it("garde l'ordre de deux entrées indiscernables d'une lecture à l'autre", () => {
    const brut = JSON.stringify([
      entree({ trigramme: "PRE", tempsDeVol: 60.1, points: 5 }),
      entree({ trigramme: "SEC", tempsDeVol: 60.4, points: 5 }),
    ]);
    const magasin = stockageAvec(brut);
    const ordre = () => lisHof(magasin).map((e) => e.trigramme);
    expect(ordre()).toEqual(["PRE", "SEC"]);
    expect(ordre()).toEqual(["PRE", "SEC"]);
  });
});

describe("tri du classement", () => {
  it("met le temps de vol le plus long en tête", () => {
    const magasin = stockageMemoire();
    ajouteAuHof(magasin, entree({ trigramme: "MOY", tempsDeVol: 200 }));
    ajouteAuHof(magasin, entree({ trigramme: "LON", tempsDeVol: 300 }));
    ajouteAuHof(magasin, entree({ trigramme: "COU", tempsDeVol: 100 }));
    expect(lisHof(magasin).map((e) => e.trigramme)).toEqual([
      "LON",
      "MOY",
      "COU",
    ]);
  });

  it("à temps arrondi égal, met le plus petit total de points devant", () => {
    // 120,2 s et 119,9 s s'arrondissent tous deux à 120 : c'est le seul cas où
    // la seconde clé de tri décide, et sans l'arrondi il ne se produirait jamais.
    const magasin = stockageMemoire();
    ajouteAuHof(
      magasin,
      entree({ trigramme: "GRO", tempsDeVol: 120.2, points: 40 }),
    );
    ajouteAuHof(
      magasin,
      entree({ trigramme: "FIN", tempsDeVol: 119.9, points: 12 }),
    );
    expect(lisHof(magasin).map((e) => e.trigramme)).toEqual(["FIN", "GRO"]);
  });
});

describe("estQualifie — qui a le droit d'entrer", () => {
  it("refuse une partie sans aucune manche réussie, même très longue", () => {
    expect(estQualifie(stockageMemoire(), candidat(99_999, 0, 0))).toBe(false);
  });

  it("accepte une manche réussie sur un classement vide", () => {
    expect(estQualifie(stockageMemoire(), candidat(12, 30))).toBe(true);
  });

  it("refuse une partie moins bonne que la centième d'un classement plein", () => {
    const magasin = stockageDe(TAILLE_HOF);
    expect(lisHof(magasin)).toHaveLength(TAILLE_HOF);
    // La centième tient 1 s ; 0,4 s s'arrondit à 0, donc en dessous.
    expect(estQualifie(magasin, candidat(0.4, 0))).toBe(false);
    expect(estQualifie(magasin, candidat(50, 0))).toBe(true);
  });

  it("compare à la centième et non à la dernière d'un stockage de 300", () => {
    const magasin = stockageDe(300);
    // La centième tient 201 s, la trois-centième 1 s. Une partie de 150 s bat
    // largement la dernière du stockage, mais n'a rien à faire au classement.
    expect(estQualifie(magasin, candidat(150, 0))).toBe(false);
    expect(estQualifie(magasin, candidat(250, 0))).toBe(true);
  });
});

describe("ajouteAuHof — insertion, troncature, écriture", () => {
  it("refuse une entrée sans manche réussie appelée directement", () => {
    // La garde d'`estQualifie` ne protège que son propre chemin : l'appel direct
    // doit être refusé ici aussi, sans rien écrire.
    let ecritures = 0;
    const magasin = stockageMemoire();
    const espion: Stockage = {
      lit: (cle) => magasin.lit(cle),
      ecrit: (cle, valeur) => {
        ecritures++;
        magasin.ecrit(cle, valeur);
      },
      efface: (cle) => magasin.efface(cle),
    };
    const liste = ajouteAuHof(
      espion,
      entree({ manchesReussies: 0, tempsDeVol: 99_999 }),
    );
    expect(liste).toEqual([]);
    expect(ecritures).toBe(0);
    expect(lisHof(espion)).toEqual([]);
  });

  it("normalise le trigramme avant d'écrire", () => {
    const magasin = stockageMemoire();
    const liste = ajouteAuHof(magasin, entree({ trigramme: "z9" }));
    expect(liste[0]?.trigramme).toBe("ZAA");
    expect(lisHof(magasin)[0]?.trigramme).toBe("ZAA");
  });

  it("tronque à 100 et laisse tomber la moins bonne", () => {
    const magasin = stockageDe(TAILLE_HOF);
    const liste = ajouteAuHof(
      magasin,
      entree({ trigramme: "NEW", tempsDeVol: 250 }),
    );
    expect(liste).toHaveLength(TAILLE_HOF);
    expect(liste[0]?.trigramme).toBe("NEW");
    // La centième d'avant (1 s) est sortie ; la nouvelle centième tient 2 s.
    expect(liste[TAILLE_HOF - 1]?.tempsDeVol).toBe(2);
    expect(lisHof(magasin)).toHaveLength(TAILLE_HOF);
  });

  it("ne remonte aucune exception quand l'écriture lève", () => {
    // Quota dépassé, navigation privée, stockage retiré en cours de route : la
    // liste rendue reste juste, seule la persistance est perdue.
    const quotaPlein: Stockage = {
      lit: () => null,
      ecrit(): void {
        throw new Error("QuotaExceededError");
      },
      efface(): void {},
    };
    const liste = ajouteAuHof(quotaPlein, entree({ trigramme: "QUO" }));
    expect(liste).toHaveLength(1);
    expect(liste[0]?.trigramme).toBe("QUO");
  });

  it("rend une liste relue identique à celle qu'il a rendue", () => {
    const magasin = stockageMemoire();
    ajouteAuHof(magasin, entree({ trigramme: "UNE", tempsDeVol: 42.5 }));
    ajouteAuHof(magasin, entree({ trigramme: "DEU", tempsDeVol: 300 }));
    const ecrite = ajouteAuHof(
      magasin,
      entree({ trigramme: "TRO", tempsDeVol: 12, points: 3 }),
    );
    expect(lisHof(magasin)).toEqual(ecrite);
  });
});

describe("videHof — remise à zéro", () => {
  it("laisse un classement vide derrière lui", () => {
    const magasin = stockageDe(10);
    expect(lisHof(magasin)).toHaveLength(10);
    videHof(magasin);
    expect(lisHof(magasin)).toEqual([]);
  });

  it("ne remonte aucune exception quand l'effacement lève", () => {
    const casse: Stockage = {
      lit: () => null,
      ecrit(): void {},
      efface(): void {
        throw new Error("stockage inaccessible");
      },
    };
    expect(() => videHof(casse)).not.toThrow();
  });
});

/** Les trois seules méthodes de `localStorage` dont `stockageNavigateur` se sert. */
interface FauxLocalStorage {
  getItem(cle: string): string | null;
  setItem(cle: string, valeur: string): void;
  removeItem(cle: string): void;
}

/**
 * Faux `localStorage` posé sur le global : `option.leve` simule la navigation
 * privée, où l'objet existe et où seule l'écriture échoue.
 */
function fauxLocalStorage(option: { leve: boolean }): FauxLocalStorage {
  const magasin = new Map<string, string>();
  return {
    getItem: (cle) => magasin.get(cle) ?? null,
    setItem: (cle, valeur) => {
      if (option.leve) throw new Error("QuotaExceededError");
      magasin.set(cle, valeur);
    },
    removeItem: (cle) => {
      magasin.delete(cle);
    },
  };
}

describe("storage — les trois magasins", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stockageMemoire garde, relit et efface", () => {
    const magasin = stockageMemoire();
    expect(magasin.lit("absente")).toBeNull();
    magasin.ecrit("cle", "valeur");
    expect(magasin.lit("cle")).toBe("valeur");
    magasin.efface("cle");
    expect(magasin.lit("cle")).toBeNull();
  });

  it("deux stockageMemoire sont indépendants", () => {
    const a = stockageMemoire();
    const b = stockageMemoire();
    a.ecrit("cle", "a");
    expect(b.lit("cle")).toBeNull();
  });

  it("stockageNavigateur délègue au localStorage de la page", () => {
    vi.stubGlobal("localStorage", fauxLocalStorage({ leve: false }));
    const magasin = stockageNavigateur();
    magasin.ecrit("cle", "valeur");
    expect(magasin.lit("cle")).toBe("valeur");
    magasin.efface("cle");
    expect(magasin.lit("cle")).toBeNull();
  });

  it("stockageDisponible prend le navigateur quand il fonctionne", () => {
    const faux = fauxLocalStorage({ leve: false });
    vi.stubGlobal("localStorage", faux);
    const magasin = stockageDisponible();
    magasin.ecrit("cle", "valeur");
    expect(faux.getItem("cle")).toBe("valeur");
  });

  it("stockageDisponible ne laisse pas son témoin derrière lui", () => {
    const faux = fauxLocalStorage({ leve: false });
    vi.stubGlobal("localStorage", faux);
    stockageDisponible();
    expect(faux.getItem("lem.temoin")).toBeNull();
  });

  it("stockageDisponible se replie en mémoire quand l'écriture lève", () => {
    vi.stubGlobal("localStorage", fauxLocalStorage({ leve: true }));
    const magasin = stockageDisponible();
    expect(() => magasin.ecrit("cle", "valeur")).not.toThrow();
    expect(magasin.lit("cle")).toBe("valeur");
  });

  it("rend toujours le même repli, sinon les deux écrans ne se verraient pas", () => {
    // L'écran de fin écrit, l'écran du classement lit : deux magasins en mémoire
    // distincts donneraient un classement vide juste après la saisie du
    // trigramme, sans le moindre message pour l'expliquer.
    vi.stubGlobal("localStorage", fauxLocalStorage({ leve: true }));
    const ecranFin = stockageDisponible();
    ajouteAuHof(ecranFin, entree({ trigramme: "MEM" }));
    const ecranHof = stockageDisponible();
    expect(lisHof(ecranHof).map((e) => e.trigramme)).toEqual(["MEM"]);
    videHof(ecranHof);
  });
});
