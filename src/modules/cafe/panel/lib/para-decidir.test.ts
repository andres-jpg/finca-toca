import { describe, expect, it } from "vitest";
import { calcularParaDecidir, ritmoSemanal, type EntradaDecidir } from "./para-decidir";

const base: EntradaDecidir = {
  presentacionesAgotadas: [{ nombre: "Consumo 2.500 g", unidades4Semanas: 48 }],
  insumosBajoMinimo: ["Bolsa 500 g", "Etiqueta 500 g"],
  lotesSinRecoger: ["MQ-2026-0001", "MQ-2026-0002"],
  diasSinRecoger: 7,
  proveedoresFuera: [{ terceroId: "t1", nombre: "Finca Uno", detalles: ["humedad 13,2 % (rango 10–12 %)"] }],
};

describe("calcularParaDecidir", () => {
  it("reúne agotados, insumos, lotes sin recoger y proveedores, con enlace y sin cartera", () => {
    const items = calcularParaDecidir(base);
    expect(items.map((i) => i.tipo)).toEqual(["presentacion", "insumos", "sin_recoger", "proveedor"]);
    expect(items[0]).toMatchObject({ titulo: "Consumo 2.500 g agotado. Programar empaque.", detalle: "Se venden unas 12 bolsas por semana.", tono: "rojo" });
    expect(items[1]).toMatchObject({ titulo: "2 insumos bajo el mínimo", href: "/dashboard/cafe/inventario?tab=insumos" });
    expect(items[2].detalle).toBe("MQ-2026-0001, MQ-2026-0002 · más de 7 días");
    expect(items[3]).toMatchObject({ titulo: "Finca Uno: fuera de rango", href: "/dashboard/cafe/lotes?tercero=t1" });
    expect(items.some((i) => /cobrar|cartera|pago/i.test(`${i.titulo} ${i.detalle}`))).toBe(false);
  });
  it("una fila por presentación agotada", () => {
    const items = calcularParaDecidir({ ...base, presentacionesAgotadas: [{ nombre: "A", unidades4Semanas: 0 }, { nombre: "B", unidades4Semanas: 1 }] });
    expect(items.filter((i) => i.tipo === "presentacion").map((i) => i.detalle)).toEqual(["Sin ventas en las últimas 4 semanas.", "Se vende menos de 1 bolsa por semana."]);
  });
  it("solo aparece lo que tiene algo que decidir", () => {
    expect(calcularParaDecidir({ ...base, presentacionesAgotadas: [], insumosBajoMinimo: [], lotesSinRecoger: [], proveedoresFuera: [] })).toEqual([]);
  });
  it("resume con «y N más» pasados tres nombres", () => {
    expect(calcularParaDecidir({ ...base, insumosBajoMinimo: ["a", "b", "c", "d", "e"] })[1].detalle).toBe("a, b, c y 2 más");
  });
});

describe("ritmoSemanal", () => {
  it("promedio de 4 semanas", () => {
    expect(ritmoSemanal(48)).toBe("se venden unas 12 bolsas por semana");
    expect(ritmoSemanal(4)).toBe("se vende 1 bolsa por semana");
    expect(ritmoSemanal(0)).toBeNull();
  });
});
