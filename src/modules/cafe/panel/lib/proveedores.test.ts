import { describe, expect, it } from "vitest";
import { leerProveedores } from "./proveedores";

describe("leerProveedores", () => {
  it("lee precio, humedad, merma y costo por kg tostado; la merma sale de los kilos", () => {
    const [p] = leerProveedores({
      proveedores: [
        { tercero_id: "t1", nombre: "Proveedor Uno", lotes: 2, kg: 150, valor_compra: 4500000, precio_kg: 30000, humedad_pct: 11.2, kg_tostion_entrada: 405, kg_tostion_salida: 332, merma_tostion_pct: 18.025, costo_kg_tostado: 36600 },
      ],
    });
    expect(p).toMatchObject({ nombre: "Proveedor Uno", lotes: 2, kg: 150, precioKg: 30000, humedadPct: 11.2, costoKgTostado: 36600 });
    expect(p.mermaTostionPct).toBe(18.02);
  });

  it("sin tostión ni humedad no inventa nada", () => {
    const [p] = leerProveedores({ proveedores: [{ tercero_id: "t2", nombre: "Dos", lotes: 1, kg: 20, valor_compra: 600000, precio_kg: 30000, humedad_pct: null, kg_tostion_entrada: 0, kg_tostion_salida: 0, merma_tostion_pct: null, costo_kg_tostado: null }] });
    expect(p).toMatchObject({ humedadPct: null, mermaTostionPct: null, costoKgTostado: null });
  });

  it("sin proveedores devuelve una lista vacía y lanza si no es un objeto", () => {
    expect(leerProveedores({ proveedores: [] })).toEqual([]);
    expect(() => leerProveedores(null)).toThrow();
  });
});

import { estadoProveedor, HUMEDAD_PANEL_DEFECTO } from "./proveedores";

describe("estadoProveedor (gris en rango, ámbar fuera)", () => {
  it("humedad 10–12 y merma 18 ± 2, límites incluidos", () => {
    expect(estadoProveedor({ humedadPct: 12, mermaTostionPct: 20 }, HUMEDAD_PANEL_DEFECTO, 18, 2)).toMatchObject({ humedad: "en_rango", merma: "en_rango", fuera: false });
    const e = estadoProveedor({ humedadPct: 12.5, mermaTostionPct: 23 }, HUMEDAD_PANEL_DEFECTO, 18, 2);
    expect(e).toMatchObject({ humedad: "fuera", merma: "fuera", fuera: true, sentidoMerma: "alta" });
    expect(e.motivos).toEqual(["humedad", "merma de tostión"]);
  });
  it("sin dato o sin referencia no hay semáforo", () => {
    expect(estadoProveedor({ humedadPct: null, mermaTostionPct: null }, HUMEDAD_PANEL_DEFECTO, 18, 2)).toMatchObject({ humedad: null, merma: null, fuera: false });
    expect(estadoProveedor({ humedadPct: 11, mermaTostionPct: 30 }, HUMEDAD_PANEL_DEFECTO, null, 2).merma).toBeNull();
  });
});
