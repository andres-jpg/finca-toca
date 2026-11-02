import { describe, expect, it } from "vitest";
import {
  agruparPorCliente,
  lineaBolsasCliente,
  lineaLlegada,
  lineaPerfil,
  lineaSuelto,
  resumirEntrega,
  soloDigitos,
  validarQuienRecibe,
  type LoteEntregable,
} from "./entregar";

function lote(p: Partial<LoteEntregable> & Pick<LoteEntregable, "id" | "codigo">): LoteEntregable {
  return {
    terceroId: "t1",
    cliente: "Juan Pérez",
    fechaRecepcion: "2026-11-10",
    pesoRecibidoKg: 100,
    pesoEntregadoKg: 80,
    servicios: [
      { tipo: "trilla", valor: 100000, kgEntrada: 100, kgSalida: 80 },
      { tipo: "empaque", valor: 0, kgEntrada: 80, kgSalida: 80 },
    ],
    ...p,
  };
}

describe("agruparPorCliente", () => {
  it("agrupa por cliente, ordena clientes por nombre y lotes por código", () => {
    const g = agruparPorCliente([
      lote({ id: "b", codigo: "MQ-2026-0002" }),
      lote({ id: "x", codigo: "MQ-2026-0003", terceroId: "t0", cliente: "Álvaro Gil" }),
      lote({ id: "a", codigo: "MQ-2026-0001" }),
    ]);
    expect(g.map((c) => c.nombre)).toEqual(["Álvaro Gil", "Juan Pérez"]);
    expect(g[1]?.lotes.map((l) => l.codigo)).toEqual(["MQ-2026-0001", "MQ-2026-0002"]);
  });
});

describe("resumirEntrega", () => {
  it("dos lotes salen con un solo total (suma del valor real de sus servicios)", () => {
    const r = resumirEntrega([
      lote({ id: "a", codigo: "MQ-1" }),
      lote({ id: "b", codigo: "MQ-2", pesoEntregadoKg: 50, servicios: [{ tipo: "trilla", valor: 40000, kgEntrada: 60, kgSalida: 50 }] }),
    ]);
    expect(r.lotes.map((l) => l.valor)).toEqual([100000, 40000]);
    expect(r.total).toBe(140000);
    expect(r.pesoEntregadoKg).toBe(130);
  });

  it("sin lotes: total 0", () => {
    expect(resumirEntrega([])).toEqual({ lotes: [], total: 0, pesoEntregadoKg: 0 });
  });
});

describe("validarQuienRecibe", () => {
  it("nombre y cédula son obligatorios", () => {
    expect(validarQuienRecibe("", "")).toEqual({ nombre: "Escribe el nombre de quien recibe.", documento: "Escribe la cédula de quien recibe." });
    expect(validarQuienRecibe("  ", "1020304050").nombre).toBeDefined();
  });

  it("la cédula se mide por dígitos (puntos y guiones no cuentan)", () => {
    expect(validarQuienRecibe("Ana Ruiz", "1.020.304.050")).toEqual({});
    expect(validarQuienRecibe("Ana Ruiz", "123").documento).toMatch(/entre 5 y 15/);
    expect(validarQuienRecibe("Ana Ruiz", "1".repeat(16)).documento).toMatch(/entre 5 y 15/);
  });

  it("soloDigitos", () => {
    expect(soloDigitos("1.020-304 050a")).toBe("1020304050");
  });
});

describe("textos del tiquete", () => {
  it("bolsas del cliente y suelto", () => {
    expect(lineaBolsasCliente([])).toBeNull();
    expect(lineaBolsasCliente([{ tamano: "5 kg", unidades: 2 }, { tamano: "500 g", unidades: 3 }])).toBe("2 × 5 kg · 3 × 500 g");
    expect(lineaSuelto(0)).toBeNull();
    expect(lineaSuelto(3.5)).toBe("3,5 kg");
  });

  it("perfil pedido: nada sin tostión", () => {
    expect(lineaPerfil({ nivelTueste: null, perfilTempC: null, perfilTiempoMin: null })).toBeNull();
    expect(lineaPerfil({ nivelTueste: "medio", perfilTempC: 205, perfilTiempoMin: 12 })).toBe("medio · 205 °C · 12 min");
  });

  it("llegada: fecha, hora en la zona del cliente, kilos y bultos", () => {
    const t = lineaLlegada({ llegadaEn: "2026-11-12T13:42:00Z", fechaRecepcion: "2026-11-12", numBultos: 8 }, 500, "America/Bogota");
    expect(t).toContain("8:42");
    expect(t).toContain("500,0 kg · 8 bultos");
  });
});
