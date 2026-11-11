import { describe, expect, it } from "vitest";
import type { FilaProduccion, FilaProduccionPanel, VentaDiaria, VentaPresentacion } from "../types";
import {
  claveCosto,
  DEFINICIONES,
  fraseMargenGrande,
  gramosVendidosCsv,
  ingresosDelTramo,
  leerProduccion,
  leerProduccionPanel,
  leerVentasDiarias,
  leerVentasPresentacion,
  librasVsPromedio,
  lineaPanel,
  margenBruto,
  mixPorPresentacion,
  produccionDelMes,
  tipoDeExportacion,
  urlExportacion,
  variacionPct,
} from "./kpis";

describe("lineaPanel (misma regla que cafe.linea_panel de SQL)", () => {
  it("marca propia", () => expect(lineaPanel("marca_propia", [])).toBe("marca_propia"));
  it("servicio con solo trilla → trilla", () => expect(lineaPanel("servicio", ["trilla"])).toBe("trilla"));
  it("trilla + maquila → maquila (no se cuenta dos veces)", () => expect(lineaPanel("servicio", ["trilla", "tostion", "empaque"])).toBe("maquila"));
});

describe("exportación (CO-35)", () => {
  it("tipo por línea y enlace con el periodo", () => {
    expect(tipoDeExportacion("trilla")).toBe("solo_trilla");
    expect(urlExportacion("2026-03-09", "2026-03-11")).toBe("/api/export/cafe-lotes?desde=2026-03-09&hasta=2026-03-11");
  });
});

describe("DEFINICIONES", () => {
  it("cada indicador tiene título y texto, y ninguno habla de cartera", () => {
    for (const d of Object.values(DEFINICIONES)) {
      expect(d.titulo.length).toBeGreaterThan(3);
      expect(d.texto.length).toBeGreaterThan(30);
      expect(/por cobrar|cartera/i.test(d.texto)).toBe(false);
    }
  });
});

describe("lecturas", () => {
  it("producción diaria: descarta líneas o tipos desconocidos", () => {
    expect(leerProduccion([{ fecha: "2026-03-09", linea: "x", tipo: "trilla", kg_entrada: 1, kg_salida: 1, merma_pct: 0, valor: 0 }])).toEqual([]);
  });
  it("ventas diarias", () => {
    expect(leerVentasDiarias([{ fecha: "2026-03-10", total: 98000, n_ventas: 1, unidades_cortesia: 2 }])[0]).toEqual({ fecha: "2026-03-10", total: 98000, nVentas: 1, unidadesCortesia: 2 });
  });
  it("producción del periodo: sin empaque", () => {
    const f = leerProduccionPanel([
      { tipo: "empaque", linea: "marca_propia", procesos: 1, kg_entrada: 5, kg_entrada_medida: 5, kg_salida: 5 },
      { tipo: "tostion", linea: "marca_propia", procesos: 2, kg_entrada: "200", kg_entrada_medida: 100, kg_salida: 81 } as never,
    ]);
    expect(f).toHaveLength(1);
    expect(f[0].kgEntrada).toBe(200);
  });
  it("ventas por presentación: descarta lo que no se puede ubicar", () => {
    expect(leerVentasPresentacion([{ articulo_pt_id: "a", nombre: "X", tipo_cafe_id: null, presentacion_g: 500, unidades: 1, libras: 1, ingreso: 1 }])).toEqual([]);
  });
});

const dia = (fecha: string, total: number): VentaDiaria => ({ fecha, total, nVentas: 1, unidadesCortesia: 0 });
const proc = (fecha: string, linea: FilaProduccion["linea"], valor: number): FilaProduccion => ({ fecha, linea, tipo: "trilla", kgEntrada: 0, kgSalida: 0, mermaPct: null, valor });

describe("KPI ingresos", () => {
  it("suma marca propia y servicios del tramo, sin contar el valor de marca propia", () => {
    const r = ingresosDelTramo([dia("2026-10-02", 100), dia("2026-09-02", 50)], [proc("2026-10-03", "maquila", 400), proc("2026-10-03", "marca_propia", 9999)], "2026-10-01", "2026-10-11");
    expect(r).toEqual({ marcaPropia: 100, servicios: 400, total: 500 });
  });
  it("variación con 1 decimal; sin tramo anterior, null", () => {
    expect(variacionPct(1042, 1000)).toBe(4.2);
    expect(variacionPct(900, 1000)).toBe(-10);
    expect(variacionPct(5, 0)).toBeNull();
  });
});

describe("KPI libras vs promedio", () => {
  it("mes completo: 2.907 lb sobre 2.850 → 102 %", () => {
    const r = librasVsPromedio(2907, 2850, "2026-10-01", "2026-10-31");
    expect(r.pct).toBe(102);
    expect(r.mesCompleto).toBe(true);
  });
  it("mes en curso: se compara con la parte proporcional", () => {
    const r = librasVsPromedio(1000, 3100, "2026-10-01", "2026-10-10");
    expect(r.promedioPeriodo).toBe(1000);
    expect(r.pct).toBe(100);
    expect(r.mesCompleto).toBe(false);
  });
  it("sin promedio, sin porcentaje", () => expect(librasVsPromedio(10, 0, "2026-10-01", "2026-10-10").pct).toBeNull());
});

const v = (tipoCafeId: string, presentacionG: number, unidades: number, ingreso: number): VentaPresentacion => ({
  articuloId: `${tipoCafeId}${presentacionG}`,
  nombre: `${tipoCafeId} ${presentacionG}`,
  tipoCafeId,
  presentacionG,
  unidades,
  libras: (unidades * presentacionG) / 500,
  ingreso,
});

describe("margen bruto y mix", () => {
  // Excelso: costo 500 g $18.969, 2.500 g $18.213 por libra; precio $29.000 por 500 g y $145.000 por 2.500 g.
  const ventas = [v("ex", 500, 10, 290000), v("ex", 2500, 3, 435000), v("co", 500, 2, 40000)];
  const costos = new Map<string, number | null>([[claveCosto("ex", 500), 18969], [claveCosto("ex", 2500), 18213], [claveCosto("co", 500), null]]);

  it("margen = ingreso − libras × costo, solo sobre lo que tiene costo, y avisa lo que no", () => {
    const m = margenBruto(ventas, costos);
    expect(m.ingreso).toBe(725000);
    expect(m.costo).toBe(Math.round(10 * 18969 + 15 * 18213));
    expect(m.margen).toBe(725000 - m.costo);
    expect(m.parcial).toBe(true);
    expect(m.ingresoSinCosto).toBe(40000);
    expect(m.margenPct).toBe(Math.round(((725000 - m.costo) / 725000) * 1000) / 10);
  });
  it("sin ventas con costo no hay margen", () => {
    expect(margenBruto([v("co", 500, 2, 40000)], costos)).toMatchObject({ margenPct: null, parcial: true, ingreso: 0 });
  });
  it("mix: libras, parte, margen por libra, de menor a mayor presentación", () => {
    const mix = mixPorPresentacion(ventas, costos);
    expect(mix.map((f) => f.presentacionG)).toEqual([500, 2500]);
    expect(mix[0].libras).toBe(12);
    expect(mix[1].libras).toBe(15);
    expect(mix[0].partePct + mix[1].partePct).toBeCloseTo(100, 0);
    expect(mix[1].margenPorLibra).toBe(Math.round((435000 - 15 * 18213) / 15));
  });
  it("frase de la bolsa grande: solo si deja más margen por libra", () => {
    const f = fraseMargenGrande(mixPorPresentacion(ventas, costos));
    expect(f?.gramos).toBe(2500);
    expect(f?.masMargen).toBeGreaterThan(0);
    expect(fraseMargenGrande(mixPorPresentacion([v("ex", 500, 1, 29000)], costos))).toBeNull();
  });
  it("gramos vendidos para pedir los costos", () => expect(gramosVendidosCsv(ventas)).toBe("500,2500"));
});

const fp = (tipo: FilaProduccionPanel["tipo"], linea: FilaProduccionPanel["linea"], kgEntrada: number, kgEntradaMedida = kgEntrada, kgSalida = 0): FilaProduccionPanel => ({
  tipo,
  linea,
  procesos: 1,
  kgEntrada,
  kgEntradaMedida,
  kgSalida,
});

describe("produccionDelMes", () => {
  it("kg que entran por proceso y línea; la merma solo sobre tandas cerradas de marca propia", () => {
    const p = produccionDelMes([fp("trilla", "maquila", 500), fp("trilla", "marca_propia", 100), fp("tostion", "marca_propia", 200, 100, 81), fp("tostion", "maquila", 50), fp("molienda", "marca_propia", 30)]);
    expect(p.trillaKg).toBe(600);
    expect(p.tostion).toEqual({ marcaPropiaKg: 200, maquilaKg: 50 });
    expect(p.molienda).toEqual({ marcaPropiaKg: 30, maquilaKg: 0 });
    expect(p.mermaTostionMarcaPropia).toEqual({ entradaKg: 100, mermaKg: 19, pct: 19 });
  });
  it("sin tandas cerradas no hay merma", () => {
    expect(produccionDelMes([fp("tostion", "marca_propia", 100, 0, 0)]).mermaTostionMarcaPropia).toBeNull();
  });
});
