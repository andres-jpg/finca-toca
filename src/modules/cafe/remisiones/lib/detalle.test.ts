import { describe, expect, it } from "vitest";
import { leerDetalle } from "./detalle";

describe("leerDetalle", () => {
  it("lee el detalle que arma generar_remision y lo deja en el orden de la planta", () => {
    const detalle = leerDetalle([
      { servicio: "molienda", kg_entrada: 332, kg_salida: 330, merma_kg: 2, tarifa_kg: 1000, valor: 332000, nivel_tueste: null, incluido: false, pendiente: false },
      { servicio: "trilla", kg_entrada: 500, kg_salida: 405, merma_kg: 95, tarifa_kg: 1400, valor: 700000, nivel_tueste: null, incluido: false, pendiente: false },
      { servicio: "tostion", kg_entrada: 405, kg_salida: 332, merma_kg: 73, tarifa_kg: 2200, valor: 891000, nivel_tueste: "medio", incluido: false, pendiente: false },
    ]);
    expect(detalle.map((d) => d.servicio)).toEqual(["trilla", "tostion", "molienda"]);
    expect(detalle[1]).toEqual({
      servicio: "tostion",
      kgEntrada: 405,
      kgSalida: 332,
      mermaKg: 73,
      tarifaKg: 2200,
      valor: 891000,
      nivelTueste: "medio",
      incluido: false,
      pendiente: false,
    });
  });

  it("un servicio pendiente trae sus cifras en null", () => {
    const [d] = leerDetalle([{ servicio: "tostion", pendiente: true, incluido: false }]);
    expect(d).toMatchObject({ servicio: "tostion", kgEntrada: null, kgSalida: null, valor: null, pendiente: true });
  });

  it("acepta números como texto (numeric de PostgREST) y descarta lo que no es un número", () => {
    const [d] = leerDetalle([{ servicio: "trilla", kg_entrada: "500.000", kg_salida: "abc", valor: null }]);
    expect(d.kgEntrada).toBe(500);
    expect(d.kgSalida).toBeNull();
    expect(d.valor).toBeNull();
  });

  it("descarta lo que no encaja en vez de romper el tiquete", () => {
    expect(leerDetalle(null)).toEqual([]);
    expect(leerDetalle({ servicio: "trilla" })).toEqual([]);
    expect(leerDetalle([null, 3, "x", [], { servicio: "secado" }, { servicio: 1 }, {}])).toEqual([]);
  });

  it("un nivel de tueste desconocido queda en null", () => {
    const [d] = leerDetalle([{ servicio: "tostion", nivel_tueste: "oscuro" }]);
    expect(d.nivelTueste).toBeNull();
  });
});
