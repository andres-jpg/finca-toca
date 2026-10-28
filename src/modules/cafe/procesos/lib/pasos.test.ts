import { describe, expect, it } from "vitest";
import type { TipoProceso } from "../../lotes/types";
import {
  MOTIVO_EMPAQUE_MARCA_PROPIA,
  evaluarBulto,
  evaluarPaso,
  evaluarPasos,
  origenPeso,
  pasoInicial,
  pasoPrevio,
  pasosDelLote,
  pasosRequeridos,
  procesadosPorTipo,
  siguientePaso,
  textoSiguientePaso,
  type BultoPasos,
  type LotePasos,
} from "./pasos";

const COMPLETO: LotePasos = { linea: "servicio", servicios: ["trilla", "tostion", "molienda", "empaque"] };
const SOLO_TRILLA: LotePasos = { linea: "servicio", servicios: ["trilla"] };
const TRILLA_Y_TUESTE: LotePasos = { linea: "servicio", servicios: ["trilla", "tostion", "empaque"] };
const MARCA: LotePasos = { linea: "marca_propia", servicios: [] };

function bultos(n: number, pasos: (i: number) => TipoProceso[] = () => []): BultoPasos[] {
  return Array.from({ length: n }, (_, i) => ({ id: `b${i + 1}`, numero: i + 1, pasos: pasos(i + 1) }));
}

describe("pasosDelLote / pasoPrevio: las mismas reglas que cafe.pasos_del_lote() y cafe.paso_previo()", () => {
  it("servicio: los contratados, en orden; marca propia: nunca trilla", () => {
    expect(pasosDelLote(COMPLETO)).toEqual(["trilla", "tostion", "molienda", "empaque"]);
    expect(pasosDelLote(SOLO_TRILLA)).toEqual(["trilla"]);
    expect(pasosDelLote(MARCA)).toEqual(["tostion", "molienda", "empaque"]);
  });

  it("servicio: el previo es el contratado anterior (se salta lo no contratado)", () => {
    expect(pasoPrevio(COMPLETO, "trilla")).toBeNull();
    expect(pasoPrevio(COMPLETO, "tostion")).toBe("trilla");
    expect(pasoPrevio(COMPLETO, "empaque")).toBe("molienda");
    expect(pasoPrevio(TRILLA_Y_TUESTE, "empaque")).toBe("tostion");
    expect(pasoPrevio({ linea: "servicio", servicios: ["tostion", "empaque"] }, "tostion")).toBeNull();
  });

  it("marca propia: la molienda sigue a la tostión y el empaque a la molienda solo si el bulto la hizo", () => {
    expect(pasoPrevio(MARCA, "tostion")).toBeNull();
    expect(pasoPrevio(MARCA, "molienda")).toBe("tostion");
    expect(pasoPrevio(MARCA, "empaque", ["tostion"])).toBe("tostion");
    expect(pasoPrevio(MARCA, "empaque", ["tostion", "molienda"])).toBe("molienda");
  });
});

describe("siguientePaso: la cola de trabajo", () => {
  it("excelso de 6 bultos: tostar 2 deja 4 pendientes, y al tostar todos pasa al siguiente paso", () => {
    const req = pasosRequeridos(MARCA, false);
    expect(siguientePaso(req, 6, {})).toEqual({ tipo: "tostion", pendientes: 6, total: 6 });
    const dos = siguientePaso(req, 6, { tostion: 2 });
    expect(dos).toEqual({ tipo: "tostion", pendientes: 4, total: 6 });
    expect(textoSiguientePaso(dos!)).toBe("Tostión · 4 de 6 bultos pendientes");
    // Con los 6 tostados, el lote de marca propia espera el empaque: sale de la cola de tostión.
    expect(siguientePaso(req, 6, { tostion: 6 })).toEqual({ tipo: "empaque", pendientes: 6, total: 6 });
  });

  it("sin pendientes en ningún paso requerido no hay siguiente", () => {
    expect(siguientePaso(["trilla", "tostion"], 3, { trilla: 3, tostion: 3 })).toBeNull();
  });

  it("la molienda a medias (marca propia) la hace requerida", () => {
    expect(pasosRequeridos(MARCA, true)).toEqual(["tostion", "molienda", "empaque"]);
    expect(siguientePaso(pasosRequeridos(MARCA, true), 4, { tostion: 4, molienda: 1 })).toEqual({
      tipo: "molienda",
      pendientes: 3,
      total: 4,
    });
  });

  it("un solo bulto se lee en singular", () => {
    expect(textoSiguientePaso({ tipo: "trilla", pendientes: 1, total: 1 })).toBe("Trilla · 1 bulto pendiente");
  });

  it("procesadosPorTipo cuenta bultos, no procesos", () => {
    expect(procesadosPorTipo(bultos(3, (n) => (n < 3 ? ["trilla", "tostion"] : ["trilla"])))).toEqual({ trilla: 3, tostion: 2 });
  });
});

describe("evaluarPasos: orden y motivos", () => {
  it("lote recién recibido: solo el primer paso está disponible y los demás dicen qué falta", () => {
    const r = evaluarPasos(COMPLETO, bultos(8));
    expect(r.map((e) => [e.tipo, e.disponible])).toEqual([
      ["trilla", true],
      ["tostion", false],
      ["molienda", false],
      ["empaque", false],
    ]);
    expect(r[0].elegibles).toHaveLength(8);
    expect(r[1].motivo).toBe("Primero registra la trilla (bultos 1, 2, 3, 4, 5, 6, 7, 8).");
  });

  it("con un solo bulto el motivo no lista números", () => {
    expect(evaluarPaso(TRILLA_Y_TUESTE, "tostion", bultos(1)).motivo).toBe("Primero registra la trilla.");
  });

  it("proceso parcial: tostar 2 bultos un día y 4 otro", () => {
    const dosTostados = bultos(6, (n) => (n <= 2 ? ["tostion"] : []));
    const tostion = evaluarPaso(MARCA, "tostion", dosTostados);
    expect(tostion.disponible).toBe(true);
    expect(tostion.elegibles).toEqual(["b3", "b4", "b5", "b6"]);
    expect(tostion.hechos).toBe(2);
    // La molienda ya admite los 2 tostados.
    expect(evaluarPaso(MARCA, "molienda", dosTostados).elegibles).toEqual(["b1", "b2"]);

    const todos = bultos(6, () => ["tostion"]);
    const final = evaluarPaso(MARCA, "tostion", todos);
    expect(final).toMatchObject({ disponible: false, motivo: "Ya se registró en todos los bultos.", hechos: 6 });
  });

  it("un bulto que ya pasó por un paso posterior no puede volver a uno anterior", () => {
    expect(evaluarBulto(COMPLETO, "trilla", { id: "x", numero: 1, pasos: ["tostion"] })).toEqual({
      estado: "bloqueado",
      motivo: "Ya pasó por un paso posterior",
    });
    const r = evaluarPaso(COMPLETO, "trilla", bultos(2, () => ["tostion"]));
    expect(r.disponible).toBe(false);
    expect(r.motivo).toBe("Los bultos pendientes ya pasaron por un paso posterior.");
  });

  it("el empaque de marca propia no se registra en la planta, aunque haya bultos tostados", () => {
    const r = evaluarPaso(MARCA, "empaque", bultos(2, () => ["tostion"]));
    expect(r).toMatchObject({ disponible: false, motivo: MOTIVO_EMPAQUE_MARCA_PROPIA, elegibles: [] });
  });

  it("el empaque de maquila sí (sin insumos)", () => {
    const todos = bultos(2, () => ["trilla", "tostion", "molienda"]);
    expect(evaluarPaso(COMPLETO, "empaque", todos).disponible).toBe(true);
  });

  it("molienda opcional de marca propia: el empaque de un bulto molido exige la molienda", () => {
    expect(evaluarBulto(MARCA, "empaque", { id: "x", numero: 1, pasos: ["tostion"] }).estado).toBe("elegible");
    expect(evaluarBulto(MARCA, "empaque", { id: "x", numero: 1, pasos: ["tostion", "molienda"] }).estado).toBe("elegible");
  });
});

describe("pasoInicial", () => {
  it("preselecciona el siguiente paso de la cola", () => {
    expect(pasoInicial(COMPLETO, bultos(8), COMPLETO.servicios)).toBe("trilla");
    expect(pasoInicial(COMPLETO, bultos(8, () => ["trilla"]), COMPLETO.servicios)).toBe("tostion");
  });

  it("marca propia con todo tostado: el empaque no es registrable aquí, se ofrece la molienda", () => {
    expect(pasoInicial(MARCA, bultos(3, () => ["tostion"]), pasosRequeridos(MARCA, false))).toBe("molienda");
  });

  it("sin nada disponible devuelve null", () => {
    expect(pasoInicial(SOLO_TRILLA, bultos(2, () => ["trilla"]), ["trilla"])).toBeNull();
  });
});

describe("origenPeso: «Viene de la trilla del 06/11»", () => {
  const conFecha = (pasos: TipoProceso[], fecha: string) => ({
    id: "x",
    numero: 1,
    pasos,
    hechos: Object.fromEntries(pasos.map((p) => [p, { fecha }])),
  });

  it("devuelve el paso previo y sus fechas, ordenadas y sin repetir", () => {
    const r = origenPeso(COMPLETO, "tostion", [conFecha(["trilla"], "2026-11-08"), conFecha(["trilla"], "2026-11-06"), conFecha(["trilla"], "2026-11-06")]);
    expect(r).toEqual({ previo: "trilla", fechas: ["2026-11-06", "2026-11-08"] });
  });

  it("el primer paso no viene de ninguno", () => {
    expect(origenPeso(COMPLETO, "trilla", [{ id: "x", numero: 1, pasos: [] }])).toEqual({ previo: null, fechas: [] });
  });
});
