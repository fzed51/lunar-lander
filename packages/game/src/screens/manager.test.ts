// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Scene, type GameState, type InputSnapshot, type InputSource } from "@lem/engine";
import { GestionnaireEcrans } from "./manager.ts";
import type { Ecran, NomEcran, Transition } from "./types.ts";
import type { Command, Globals, LemEvent } from "../types.ts";
import type { Particle } from "../entities/Particle.ts";

/** Transition vers le jeu, params compris : la variante la plus chargée. */
function versJeu(graine = 42): Transition {
  return { nom: "jeu", params: { niveau: 0, graine } };
}

/**
 * Source de commandes instrumentée. Reproduit la sémantique de
 * `KeyboardInput` — `poll()` **vide** le tampon des fronts montants — et compte
 * ses appels, pour prouver qu'il n'y en a qu'un par image.
 */
class SourceTest implements InputSource<Command> {
  appels = 0;
  private readonly fronts = new Set<Command>();
  private readonly actives = new Set<Command>();

  presse(c: Command): void {
    this.fronts.add(c);
    this.actives.add(c);
  }

  relache(c: Command): void {
    this.actives.delete(c);
  }

  poll(): InputSnapshot<Command> {
    this.appels++;
    const fronts = new Set(this.fronts);
    const actives = new Set(this.actives);
    this.fronts.clear();
    return {
      isActive: (c) => actives.has(c),
      justPressed: (c) => fronts.has(c),
    };
  }
}

interface OptionsBouchon {
  /** Transition notée au front montant de `confirm`. */
  readonly suivante?: () => Transition;
  /** Crochet exécuté à la fin de chaque `tick`, pour observer l'instant précis. */
  readonly auTick?: (b: Bouchon, input: InputSnapshot<Command>) => void;
  /** Crochet exécuté à la fin de `entre`, pour y noter une demande. */
  readonly auEntre?: (b: Bouchon) => void;
}

/**
 * Écran bouchon instrumenté : journalise ses appels et note sa demande au front
 * montant de `confirm`. **Une seule case d'attente**, comme l'exige le contrat.
 */
class Bouchon implements Ecran {
  readonly journal: string[] = [];
  private demande: Transition | null = null;

  constructor(
    readonly nom: NomEcran,
    private readonly options: OptionsBouchon = {},
  ) {}

  entre(t: Transition): void {
    this.journal.push(`entre:${t.nom}`);
    this.options.auEntre?.(this);
  }

  sort(): void {
    this.journal.push("sort");
    // Une demande non appliquée ne doit pas ressortir au passage suivant.
    this.demande = null;
  }

  tick(_dt: number, input: InputSnapshot<Command>): void {
    this.journal.push("tick");
    if (this.options.suivante && input.justPressed("confirm")) {
      this.note(this.options.suivante());
    }
    this.options.auTick?.(this, input);
  }

  rend(): void {
    this.journal.push("rend");
  }

  prendTransition(): Transition | null {
    const t = this.demande;
    this.demande = null;
    return t;
  }

  /** Note une demande, comme le ferait une touche. La première notée gagne. */
  note(t: Transition): void {
    if (this.demande === null) this.demande = t;
  }

  compte(appel: string): number {
    return this.journal.filter((e) => e === appel).length;
  }
}

/** Écran bouchon en DOM : injecte un nœud dans `#ui`, le retire en sortant. */
class BouchonDom implements Ecran {
  readonly nom: NomEcran = "hof";
  private noeud: HTMLElement | null = null;

  constructor(private readonly hote: HTMLElement) {}

  entre(): void {
    const bloc = document.createElement("p");
    bloc.textContent = "HALL OF FAME";
    this.hote.append(bloc);
    this.noeud = bloc;
  }

  sort(): void {
    this.noeud?.remove();
    this.noeud = null;
  }

  tick(): void {}
  rend(): void {}
  prendTransition(): Transition | null {
    return null;
  }
}

let source: SourceTest;
let gestionnaire: GestionnaireEcrans;

beforeEach(() => {
  source = new SourceTest();
  gestionnaire = new GestionnaireEcrans({ source });
});
afterEach(() => {
  gestionnaire.dispose();
  document.body.innerHTML = "";
});

describe("GestionnaireEcrans — activation", () => {
  it("appelle sort puis entre, une fois chacun, à chaque changement", () => {
    const accueil = new Bouchon("accueil");
    const jeu = new Bouchon("jeu");
    gestionnaire.enregistre(accueil).enregistre(jeu);

    gestionnaire.active({ nom: "accueil" });
    expect(accueil.journal).toEqual(["entre:accueil"]);

    gestionnaire.active(versJeu());
    expect(accueil.journal).toEqual(["entre:accueil", "sort"]);
    expect(jeu.journal).toEqual(["entre:jeu"]);
    expect(gestionnaire.nomCourant).toBe("jeu");
  });

  it("réactiver l'écran courant le fait vraiment sortir puis entrer", () => {
    const jeu = new Bouchon("jeu");
    gestionnaire.enregistre(jeu);

    gestionnaire.active(versJeu(1));
    gestionnaire.active(versJeu(2));

    expect(jeu.journal).toEqual(["entre:jeu", "sort", "entre:jeu"]);
  });

  it("refuse un nom sans écran enregistré, sans lâcher l'écran courant", () => {
    const accueil = new Bouchon("accueil");
    gestionnaire.enregistre(accueil);
    gestionnaire.active({ nom: "accueil" });

    expect(() => gestionnaire.active({ nom: "hof" })).toThrow(/hof/);
    // L'écran courant n'a pas été quitté : pas d'écran noir muet.
    expect(accueil.journal).toEqual(["entre:accueil"]);
    expect(gestionnaire.nomCourant).toBe("accueil");
  });
});

describe("GestionnaireEcrans — tick et rendu", () => {
  it("ne ticke et ne rend que l'écran courant", () => {
    const accueil = new Bouchon("accueil");
    const jeu = new Bouchon("jeu");
    gestionnaire.enregistre(accueil).enregistre(jeu);
    gestionnaire.active({ nom: "accueil" });

    gestionnaire.tick(1 / 60);
    gestionnaire.rend();

    expect(accueil.compte("tick")).toBe(1);
    expect(accueil.compte("rend")).toBe(1);
    expect(jeu.journal).toEqual([]);
  });

  it("applique la transition après le tick, jamais pendant", () => {
    const jeu = new Bouchon("jeu");
    let journalPendant: string[] = [];
    const accueil = new Bouchon("accueil", {
      suivante: () => versJeu(),
      auTick: () => {
        journalPendant = [...jeu.journal];
      },
    });
    gestionnaire.enregistre(accueil).enregistre(jeu);
    gestionnaire.active({ nom: "accueil" });

    source.presse("confirm");
    gestionnaire.tick(1 / 60);

    expect(journalPendant).toEqual([]); // rien pendant le tick d'accueil
    expect(jeu.journal).toEqual(["entre:jeu"]); // tout après
    expect(gestionnaire.nomCourant).toBe("jeu");
  });

  it("n'applique qu'une transition par tick", () => {
    const fin = new Bouchon("fin");
    const hof = new Bouchon("hof");
    const accueil = new Bouchon("accueil", {
      auTick: (b) => {
        b.note({ nom: "fin" });
        b.note({ nom: "hof" }); // ignorée : la case est prise
      },
    });
    gestionnaire.enregistre(accueil).enregistre(fin).enregistre(hof);
    gestionnaire.active({ nom: "accueil" });

    gestionnaire.tick(1 / 60);

    expect(gestionnaire.nomCourant).toBe("fin");
    expect(hof.journal).toEqual([]);
  });

  it("laisse partir au tick suivant une transition demandée depuis entre()", () => {
    const fin = new Bouchon("fin");
    // `jeu` note sa demande dès son activation : elle ne doit pas partir en
    // récursion pendant l'activation, mais au tick suivant.
    const jeu = new Bouchon("jeu", {
      auEntre: (b) => b.note({ nom: "fin" }),
    });
    const accueil = new Bouchon("accueil", { suivante: () => versJeu() });
    gestionnaire.enregistre(accueil).enregistre(jeu).enregistre(fin);
    gestionnaire.active({ nom: "accueil" });

    source.presse("confirm");
    gestionnaire.tick(1 / 60);
    expect(gestionnaire.nomCourant).toBe("jeu"); // pas de cascade dans l'image
    expect(fin.journal).toEqual([]);

    source.relache("confirm");
    gestionnaire.tick(1 / 60);
    expect(gestionnaire.nomCourant).toBe("fin");
  });
});

describe("GestionnaireEcrans — consommation de la demande", () => {
  it("consomme la demande : réactiver l'écran ne la rejoue pas", () => {
    const jeu = new Bouchon("jeu");
    const accueil = new Bouchon("accueil", { suivante: () => versJeu() });
    gestionnaire.enregistre(accueil).enregistre(jeu);
    gestionnaire.active({ nom: "accueil" });

    source.presse("confirm");
    gestionnaire.tick(1 / 60);
    expect(gestionnaire.nomCourant).toBe("jeu");

    // Retour sur l'accueil, sans nouvel appui : rien ne doit repartir.
    source.relache("confirm");
    gestionnaire.active({ nom: "accueil" });
    gestionnaire.tick(1 / 60);
    expect(gestionnaire.nomCourant).toBe("accueil");
  });

  it("sort() efface la demande notée mais jamais appliquée", () => {
    const jeu = new Bouchon("jeu");
    const accueil = new Bouchon("accueil");
    gestionnaire.enregistre(accueil).enregistre(jeu);
    gestionnaire.active({ nom: "accueil" });

    accueil.note({ nom: "hof" });
    gestionnaire.active(versJeu()); // sort() sur accueil, sans ticker
    gestionnaire.active({ nom: "accueil" });

    gestionnaire.tick(1 / 60);
    expect(gestionnaire.nomCourant).toBe("accueil");
  });

  it("un tour complet des quatre écrans, un appui par écran, puis plus rien", () => {
    const accueil = new Bouchon("accueil", { suivante: () => versJeu() });
    const jeu = new Bouchon("jeu", { suivante: () => ({ nom: "fin" }) });
    const fin = new Bouchon("fin", { suivante: () => ({ nom: "hof" }) });
    const hof = new Bouchon("hof", { suivante: () => ({ nom: "accueil" }) });
    gestionnaire
      .enregistre(accueil)
      .enregistre(jeu)
      .enregistre(fin)
      .enregistre(hof);
    gestionnaire.active({ nom: "accueil" });

    const attendus: NomEcran[] = ["jeu", "fin", "hof", "accueil"];
    for (const attendu of attendus) {
      source.presse("confirm");
      gestionnaire.tick(1 / 60);
      source.relache("confirm");
      expect(gestionnaire.nomCourant).toBe(attendu);
    }

    // Aucun front montant : les écrans ne défilent pas tout seuls.
    gestionnaire.tick(1 / 60);
    gestionnaire.tick(1 / 60);
    expect(gestionnaire.nomCourant).toBe("accueil");
    expect(accueil.compte("entre:accueil")).toBe(2);
    expect(jeu.compte("entre:jeu")).toBe(1);
  });
});

describe("GestionnaireEcrans — sondage unique du clavier", () => {
  it("sonde la source exactement une fois par tick", () => {
    const accueil = new Bouchon("accueil");
    gestionnaire.enregistre(accueil);
    gestionnaire.active({ nom: "accueil" });

    gestionnaire.tick(1 / 60);
    expect(source.appels).toBe(1);
    gestionnaire.rend();
    expect(source.appels).toBe(1);
    gestionnaire.tick(1 / 60);
    expect(source.appels).toBe(2);
  });

  it("reste à un seul sondage quand une Scene consomme la source partagée", () => {
    const scene = new Scene<Particle, LemEvent, Globals, Command>({
      input: gestionnaire.sourcePartagee(),
    });
    let etat: GameState<Particle, Globals> = {
      entities: [],
      globals: { nextId: 0 },
      time: 0,
    };
    const jeu = new Bouchon("jeu", {
      auTick: (_b, _input) => {
        etat = scene.tick(etat, 1 / 60);
      },
    });
    gestionnaire.enregistre(jeu);
    gestionnaire.active(versJeu());

    gestionnaire.tick(1 / 60);

    expect(source.appels).toBe(1);
    expect(etat.time).toBeCloseTo(1 / 60);
  });

  it("la source partagée rend le même snapshot que l'écran, fronts compris", () => {
    const partagee = gestionnaire.sourcePartagee();
    // Des tableaux plutôt que des variables nullables : ce qui est écrit dans
    // une fermeture reste lisible sans que le typage se rétrécisse.
    const recus: InputSnapshot<Command>[] = [];
    const relus: InputSnapshot<Command>[] = [];
    const jeu = new Bouchon("jeu", {
      auTick: (_b, input) => {
        recus.push(input);
        relus.push(partagee.poll());
      },
    });
    gestionnaire.enregistre(jeu);
    gestionnaire.active(versJeu());

    source.presse("confirm");
    gestionnaire.tick(1 / 60);

    const relu = relus[0];
    expect(relu).toBe(recus[0]);
    expect(relu?.justPressed("confirm")).toBe(true);
    expect(relu?.isActive("confirm")).toBe(true);
    expect(relu?.justPressed("back")).toBe(false);
    // La relecture ne consomme rien : la source réelle n'a été sondée qu'une fois.
    expect(source.appels).toBe(1);
  });

  it("possède son propre clavier quand aucune source n'est injectée", () => {
    const seul = new GestionnaireEcrans();
    const fronts: boolean[] = [];
    const accueil = new Bouchon("accueil", {
      auTick: (_b, input) => fronts.push(input.justPressed("confirm")),
    });
    seul.enregistre(accueil);
    seul.active({ nom: "accueil" });

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter" }));
    seul.tick(1 / 60);
    seul.tick(1 / 60);
    expect(fronts).toEqual([true, false]);

    // Après `dispose`, le clavier ne répond plus.
    seul.dispose();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
    seul.tick(1 / 60);
    expect(fronts).toEqual([true, false, false]);
  });
});

describe("GestionnaireEcrans — écrans en DOM", () => {
  it("après sort(), #ui ne contient plus aucun nœud", () => {
    const ui = document.createElement("div");
    ui.id = "ui";
    document.body.append(ui);

    const hof = new BouchonDom(ui);
    const accueil = new Bouchon("accueil");
    gestionnaire.enregistre(hof).enregistre(accueil);

    gestionnaire.active({ nom: "hof" });
    expect(ui.childNodes.length).toBe(1);

    gestionnaire.active({ nom: "accueil" });
    expect(ui.childNodes.length).toBe(0);
  });
});
