import { describe, expect, it } from "vitest";
import { estimarMolienda, textoEstimadoRecepcion, textoEstimadoTostion } from "./molienda";

// Mismos casos que `supabase/tests/99_cafe_molienda_solicitada.test.sql`.
describe("estimarMolienda", () => {
  const base = { trilla: true, mermaTrillaPct: 19, mermaTostionPct: 18 };

  it("50,0 kg de pergamino con trilla y tostión: Mitad = 16,6 kg a moler", () => {
    const e = estimarMolienda({ ...base, kgEntrada: 50, modo: "mitad" });
    expect(e).toEqual({ tostadoKg: 33.2, molidoKg: 16.6, granoKg: 16.6, excede: false });
  });

  it("Todo muele todo el tostado", () => {
    expect(estimarMolienda({ ...base, kgEntrada: 50, modo: "todo" })).toMatchObject({ molidoKg: 33.2, granoKg: 0 });
  });

  it("Sin molienda no muele nada", () => {
    expect(estimarMolienda({ ...base, kgEntrada: 50, modo: "ninguna" })).toMatchObject({ molidoKg: 0, granoKg: 33.2 });
  });

  it("tostión de 54,0 kg (sin trilla) con 10,0 kg: 44,3 tostados y 34,3 en grano", () => {
    const e = estimarMolienda({ kgEntrada: 54, trilla: false, mermaTrillaPct: 19, mermaTostionPct: 18, modo: "kg", kg: 10 });
    expect(e).toEqual({ tostadoKg: 44.3, molidoKg: 10, granoKg: 34.3, excede: false });
  });

  it("Mitad de 44,3 redondea hacia arriba (22,2), como la base", () => {
    expect(estimarMolienda({ kgEntrada: 54, trilla: false, mermaTrillaPct: 19, mermaTostionPct: 18, modo: "mitad" }).molidoKg).toBe(22.2);
  });

  it("Otra cantidad no puede pasar del tostado estimado", () => {
    expect(estimarMolienda({ ...base, kgEntrada: 50, modo: "kg", kg: 33.3 }).excede).toBe(true);
    expect(estimarMolienda({ ...base, kgEntrada: 50, modo: "kg", kg: 33.2 }).excede).toBe(false);
  });

  it("sin kilos de entrada no hay estimación", () => {
    expect(estimarMolienda({ ...base, kgEntrada: 0, modo: "todo" })).toEqual({ tostadoKg: 0, molidoKg: 0, granoKg: 0, excede: false });
  });

  it("los textos usan el formato de kg del núcleo", () => {
    expect(textoEstimadoRecepcion(estimarMolienda({ ...base, kgEntrada: 50, modo: "mitad" }))).toBe(
      "Estimado: 33,2 kg tostados, de los cuales 16,6 kg molidos y 16,6 kg en grano. El peso final depende de la merma.",
    );
    expect(textoEstimadoTostion(estimarMolienda({ kgEntrada: 54, trilla: false, mermaTrillaPct: 19, mermaTostionPct: 18, modo: "kg", kg: 10 }))).toBe(
      "Estimado: 44,3 kg tostados · 10,0 kg a molienda · 34,3 kg en grano. El peso real se confirma en empaque.",
    );
  });
});
