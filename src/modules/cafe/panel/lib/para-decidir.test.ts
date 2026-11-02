import { describe, expect, it } from "vitest";
import { calcularParaDecidir, type EntradaDecidir } from "./para-decidir";

const base: EntradaDecidir = {
  linea: null,
  insumosBajoMinimo: ["Bolsa 500 g", "Etiqueta 500 g"],
  presentaciones: [
    { nombre: "Excelso 500 g", estado: "agotado" },
    { nombre: "Consumo 500 g", estado: "bajo" },
    { nombre: "Excelso 2.500 g", estado: "ok" },
  ],
  lotesSinRecoger: [
    { codigo: "MQ-2026-0001", linea: "trilla" },
    { codigo: "MQ-2026-0002", linea: "maquila" },
  ],
  diasSinRecoger: 7,
};

describe("calcularParaDecidir", () => {
  it("sin filtro de línea reúne los tres avisos, con enlace", () => {
    const items = calcularParaDecidir(base);
    expect(items.map((i) => i.id)).toEqual(["insumos", "presentaciones", "sin_recoger"]);
    expect(items[0]).toMatchObject({ titulo: "2 insumos bajo el mínimo", href: "/dashboard/cafe/inventario?tab=insumos" });
    expect(items[1]).toMatchObject({ titulo: "1 presentación agotada y 1 baja", tono: "rojo", cantidad: 2 });
    expect(items[2].detalle).toBe("MQ-2026-0001, MQ-2026-0002 · más de 7 días");
  });

  it("solo aparece lo que tiene algo que decidir", () => {
    expect(calcularParaDecidir({ ...base, insumosBajoMinimo: [], presentaciones: [], lotesSinRecoger: [] })).toEqual([]);
  });

  it("marca propia: insumos y presentaciones, sin servicios", () => {
    expect(calcularParaDecidir({ ...base, linea: "marca_propia" }).map((i) => i.id)).toEqual(["insumos", "presentaciones"]);
  });

  it("una línea de servicio: insumos y solo sus lotes sin recoger, sin presentaciones", () => {
    const items = calcularParaDecidir({ ...base, linea: "maquila" });
    expect(items.map((i) => i.id)).toEqual(["insumos", "sin_recoger"]);
    expect(items[1].cantidad).toBe(1);
    expect(items[1].detalle).toContain("MQ-2026-0002");
  });

  it("resume con «y N más» pasados tres nombres", () => {
    const items = calcularParaDecidir({ ...base, insumosBajoMinimo: ["a", "b", "c", "d", "e"] });
    expect(items[0].detalle).toBe("a, b, c y 2 más");
  });

  it("solo agotadas: tono rojo y texto en singular", () => {
    const items = calcularParaDecidir({ ...base, presentaciones: [{ nombre: "X", estado: "agotado" }] });
    expect(items.find((i) => i.id === "presentaciones")?.titulo).toBe("1 presentación agotada");
  });
});
