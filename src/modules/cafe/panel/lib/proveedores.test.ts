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
