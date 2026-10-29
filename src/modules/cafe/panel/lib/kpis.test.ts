import { describe, expect, it } from "vitest";
import { DEFINICIONES, leerKpis, leerProduccion, leerVentasDiarias, lineaPanel, tipoDeExportacion, urlExportacion } from "./kpis";

describe("lineaPanel (misma regla que cafe.linea_panel de SQL)", () => {
  it("marca propia", () => expect(lineaPanel("marca_propia", [])).toBe("marca_propia"));
  it("servicio con solo trilla → trilla", () => expect(lineaPanel("servicio", ["trilla"])).toBe("trilla"));
  it("trilla + maquila → maquila (no se cuenta dos veces)", () => expect(lineaPanel("servicio", ["trilla", "tostion", "empaque"])).toBe("maquila"));
  it("maquila → maquila", () => expect(lineaPanel("servicio", ["tostion", "molienda", "empaque"])).toBe("maquila"));
});

describe("exportación (CO-35)", () => {
  it("cada línea del panel pide el tipo que reproduce sus lotes", () => {
    expect(tipoDeExportacion("marca_propia")).toBe("marca_propia");
    expect(tipoDeExportacion("trilla")).toBe("solo_trilla");
    expect(tipoDeExportacion("maquila")).toBe("maquila");
    expect(tipoDeExportacion(null)).toBeNull();
  });
  it("el enlace lleva el periodo y, si hay, la línea", () => {
    expect(urlExportacion("2026-03-09", "2026-03-11", null)).toBe("/api/export/cafe-lotes?desde=2026-03-09&hasta=2026-03-11");
    expect(urlExportacion("2026-03-09", "2026-03-11", "trilla")).toBe("/api/export/cafe-lotes?tipo=solo_trilla&desde=2026-03-09&hasta=2026-03-11");
  });
});

describe("DEFINICIONES", () => {
  it("cada indicador tiene título y texto (son el tooltip de la tarjeta)", () => {
    for (const d of Object.values(DEFINICIONES)) {
      expect(d.titulo.length).toBeGreaterThan(3);
      expect(d.texto.length).toBeGreaterThan(30);
    }
  });
});

const JSON_BASE = {
  desde: "2026-03-09",
  hasta: "2026-03-10",
  hoy: "2026-03-11",
  linea: null,
  recibido: [
    { linea: "marca_propia", kg: 120, lotes: 2 },
    { linea: "trilla", kg: 350, lotes: 3 },
    { linea: "maquila", kg: 500, lotes: 1 },
  ],
  mermas: [
    { tipo: "trilla", procesos: 3, kg_entrada: 800, kg_salida: 635, merma_kg: 165, merma_pct: 20.625, desvios: 1 },
    { tipo: "tostion", procesos: 0, kg_entrada: 0, kg_salida: 0, merma_kg: 0, merma_pct: null, desvios: 0 },
  ],
  desvios: 1,
  ingreso_marca_propia: { total: 121000, ventas: 2, cortesias: 1, unidades_cortesia: 2 },
  ingreso_servicios: { total: 2343000, por_linea: [{ linea: "trilla", valor: 420000 }, { linea: "maquila", valor: 1923000 }] },
  inventario_propio: { cafe_en_planta_kg: 182, lotes_en_planta: 2, producto_terminado_kg: 22.5 },
  inventario_terceros: {
    kg_en_planta: 600,
    lotes: 8,
    clientes: 7,
    por_cliente: [{ tercero_id: "7c0e6f9e-0000-4000-8000-000000000001", nombre: "Cliente A", kg: 380, lotes: 2 }],
  },
  insumos_bajo_minimo: 3,
};

describe("leerKpis", () => {
  it("pasa el json de la base a la forma del panel", () => {
    const k = leerKpis(JSON_BASE);
    expect(k.desde).toBe("2026-03-09");
    expect(k.linea).toBeNull();
    expect(k.recibido[2]).toEqual({ linea: "maquila", kg: 500, lotes: 1 });
    expect(k.mermas[0]).toEqual({ tipo: "trilla", procesos: 3, kgEntrada: 800, kgSalida: 635, mermaKg: 165, mermaPct: 20.625, desvios: 1 });
    expect(k.mermas[1].mermaPct).toBeNull();
    expect(k.ingresoMarcaPropia).toEqual({ total: 121000, ventas: 2, cortesias: 1, unidadesCortesia: 2 });
    expect(k.ingresoServicios?.porLinea).toEqual([{ linea: "trilla", valor: 420000 }, { linea: "maquila", valor: 1923000 }]);
    expect(k.inventarioPropio).toEqual({ cafeEnPlantaKg: 182, lotesEnPlanta: 2, productoTerminadoKg: 22.5 });
    expect(k.inventarioTerceros?.porCliente[0]).toEqual({ terceroId: "7c0e6f9e-0000-4000-8000-000000000001", nombre: "Cliente A", kg: 380, lotes: 2 });
    expect(k.insumosBajoMinimo).toBe(3);
  });

  it("null en una sección es «no aplica», no cero", () => {
    const k = leerKpis({ ...JSON_BASE, linea: "marca_propia", ingreso_servicios: null, inventario_terceros: null });
    expect(k.linea).toBe("marca_propia");
    expect(k.ingresoServicios).toBeNull();
    expect(k.inventarioTerceros).toBeNull();
    expect(k.ingresoMarcaPropia).not.toBeNull();
  });

  it("descarta líneas y tipos desconocidos y lee 0 donde falte un número", () => {
    const k = leerKpis({ ...JSON_BASE, recibido: [{ linea: "otra", kg: 1 }, { linea: "trilla" }], mermas: [{ tipo: "secado", procesos: 1 }] });
    expect(k.recibido).toEqual([{ linea: "trilla", kg: 0, lotes: 0 }]);
    expect(k.mermas).toEqual([]);
  });

  it("acepta números como texto (numeric de Postgres)", () => {
    const k = leerKpis({ ...JSON_BASE, desvios: "2" });
    expect(k.desvios).toBe(2);
  });

  it("lanza si la respuesta no es un objeto", () => {
    expect(() => leerKpis(null)).toThrow();
    expect(() => leerKpis([])).toThrow();
    expect(() => leerKpis("x")).toThrow();
  });
});

describe("leerProduccion y leerVentasDiarias", () => {
  it("tipa las filas y descarta las de línea o tipo desconocidos", () => {
    const filas = leerProduccion([
      { fecha: "2026-03-09", linea: "maquila", tipo: "trilla", kg_entrada: 500, kg_salida: 405, merma_pct: 19, valor: 700000 },
      { fecha: "2026-03-09", linea: "x", tipo: "trilla", kg_entrada: 1, kg_salida: 1, merma_pct: 0, valor: 0 },
    ]);
    expect(filas).toEqual([{ fecha: "2026-03-09", linea: "maquila", tipo: "trilla", kgEntrada: 500, kgSalida: 405, mermaPct: 19, valor: 700000 }]);
  });
  it("ventas diarias", () => {
    expect(leerVentasDiarias([{ fecha: "2026-03-10", total: 98000, n_ventas: 1, unidades_cortesia: 2 }])).toEqual([
      { fecha: "2026-03-10", total: 98000, nVentas: 1, unidadesCortesia: 2 },
    ]);
  });
});
