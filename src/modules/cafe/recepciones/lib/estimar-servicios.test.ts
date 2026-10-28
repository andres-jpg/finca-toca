import { describe, expect, it } from "vitest";
import { estimarServicios } from "./estimar-servicios";

// Ejemplo del informe de Cofradía: 500 kg → trilla $700.000; 405 kg → tostión $891.000. Mismos números que
// `supabase/tests/96_cafe_recepcion.test.sql`.
const tarifas = { trilla: 1400, tostion: 2200, molienda: 1000 };
const mermasRef = { trilla: 19, tostion: 18 };

describe("estimarServicios", () => {
  it("solo trilla: 500 kg × $1.400 = $700.000", () => {
    const e = estimarServicios({ pesoKg: 500, servicios: ["trilla"], tarifas, mermasRef });
    expect(e.lineas).toEqual([{ servicio: "trilla", pesoKg: 500, tarifaKg: 1400, valor: 700000 }]);
    expect(e.total).toBe(700000);
    expect(e.incompleta).toBe(false);
    expect(e.conEmpaque).toBe(false);
  });

  it("trilla + tostión: la tostión parte de 405 kg (merma 19 %) y vale $891.000", () => {
    const e = estimarServicios({ pesoKg: 500, servicios: ["trilla", "tostion"], tarifas, mermasRef });
    expect(e.lineas.map((l) => [l.servicio, l.pesoKg, l.valor])).toEqual([
      ["trilla", 500, 700000],
      ["tostion", 405, 891000],
    ]);
    expect(e.total).toBe(1591000);
    expect(e.conEmpaque).toBe(true);
  });

  it("trilla + tostión + molienda: la molienda parte de 332,1 kg (merma 18 %)", () => {
    const e = estimarServicios({ pesoKg: 500, servicios: ["molienda", "tostion", "trilla"], tarifas, mermasRef });
    expect(e.lineas.map((l) => [l.servicio, l.pesoKg, l.valor])).toEqual([
      ["trilla", 500, 700000],
      ["tostion", 405, 891000],
      ["molienda", 332.1, 332100],
    ]);
    expect(e.total).toBe(1923100);
  });

  it("sin trilla contratada el cliente trae el café trillado: la tostión parte del peso recibido", () => {
    const e = estimarServicios({ pesoKg: 100, servicios: ["tostion", "molienda"], tarifas, mermasRef });
    expect(e.lineas.map((l) => [l.servicio, l.pesoKg, l.valor])).toEqual([
      ["tostion", 100, 220000],
      ["molienda", 82, 82000],
    ]);
  });

  it("el empaque nunca es una línea ni suma (aunque llegue en la lista)", () => {
    const e = estimarServicios({ pesoKg: 100, servicios: ["tostion", "empaque"], tarifas, mermasRef });
    expect(e.lineas.map((l) => l.servicio)).toEqual(["tostion"]);
    expect(e.conEmpaque).toBe(true);
  });

  it("el orden de entrada no importa", () => {
    const a = estimarServicios({ pesoKg: 500, servicios: ["trilla", "tostion"], tarifas, mermasRef });
    const b = estimarServicios({ pesoKg: 500, servicios: ["tostion", "trilla", "trilla"], tarifas, mermasRef });
    expect(b).toEqual(a);
  });

  it("sin tarifa de un servicio: su valor es null, el total es parcial y se marca incompleta", () => {
    const e = estimarServicios({
      pesoKg: 500,
      servicios: ["trilla", "tostion"],
      tarifas: { trilla: 1400, tostion: null },
      mermasRef,
    });
    expect(e.lineas[1]).toEqual({ servicio: "tostion", pesoKg: 405, tarifaKg: null, valor: null });
    expect(e.total).toBe(700000);
    expect(e.incompleta).toBe(true);
  });

  it("sin merma de referencia (null o ausente) el peso pasa sin cambio al siguiente paso", () => {
    const e = estimarServicios({ pesoKg: 500, servicios: ["trilla", "tostion"], tarifas, mermasRef: { trilla: null } });
    expect(e.lineas[1].pesoKg).toBe(500);
    const f = estimarServicios({ pesoKg: 500, servicios: ["trilla", "tostion"], tarifas, mermasRef: {} });
    expect(f.lineas[1].pesoKg).toBe(500);
  });

  it("una merma fuera de 0–100 se ignora en vez de inventar pesos negativos", () => {
    const e = estimarServicios({ pesoKg: 500, servicios: ["trilla", "tostion"], tarifas, mermasRef: { trilla: 150 } });
    expect(e.lineas[1].pesoKg).toBe(500);
  });

  it("peso vacío, cero, negativo o NaN: sin líneas y sin error (el formulario aún se está llenando)", () => {
    for (const pesoKg of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const e = estimarServicios({ pesoKg, servicios: ["trilla", "tostion"], tarifas, mermasRef });
      expect(e.lineas).toEqual([]);
      expect(e.total).toBe(0);
      expect(e.incompleta).toBe(false);
    }
  });

  it("sin servicios: sin líneas", () => {
    const e = estimarServicios({ pesoKg: 500, servicios: [], tarifas, mermasRef });
    expect(e).toEqual({ lineas: [], total: 0, incompleta: false, conEmpaque: false });
  });

  it("pesos con decimales: se redondea a gramos y el valor a pesos enteros", () => {
    const e = estimarServicios({ pesoKg: 123.456, servicios: ["trilla"], tarifas, mermasRef });
    expect(e.lineas[0].pesoKg).toBe(123.456);
    expect(e.lineas[0].valor).toBe(172838); // 123,456 × 1.400 = 172.838,4
  });
});
