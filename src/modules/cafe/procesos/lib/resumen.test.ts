import { describe, expect, it } from "vitest";
import {
  mermaEnVivo,
  referenciaDelPaso,
  textoDesvio,
  textoEstadoLote,
  textoProcesoRegistrado,
  valorDelServicio,
  type ConfigMerma,
} from "./resumen";

const CFG: ConfigMerma = { referenciaTrillaPct: 19, referenciaTostionPct: 18, toleranciaPts: 3 };

describe("mermaEnVivo: lo mismo que las columnas generadas de cafe.procesos", () => {
  it("trilla 500 → 405: merma 95 kg, 19 %, sin desvío", () => {
    expect(mermaEnVivo("trilla", 500, 405, CFG)).toEqual({
      mermaKg: 95,
      mermaPct: 19,
      desvio: false,
      referenciaPct: 19,
      toleranciaPts: 3,
    });
  });

  it("tostión 405 → 332: 18,025 %, sin desvío", () => {
    const m = mermaEnVivo("tostion", 405, 332, CFG);
    expect(m?.mermaKg).toBe(73);
    expect(m?.mermaPct).toBe(18.025);
    expect(m?.desvio).toBe(false);
  });

  it("25 % con referencia 19 ± 3 es desvío y avisa en ámbar sin bloquear", () => {
    const m = mermaEnVivo("trilla", 500, 375, CFG)!;
    expect(m.desvio).toBe(true);
    expect(textoDesvio(m)).toBe("Merma 25,0 % (referencia 19 % ± 3). Revisa el pesaje. Puedes guardar igualmente");
  });

  it("justo en la tolerancia (22 %) no es desvío", () => {
    const m = mermaEnVivo("trilla", 1000, 780, CFG)!;
    expect(m.mermaPct).toBe(22);
    expect(m.desvio).toBe(false);
    expect(textoDesvio(m)).toBeNull();
  });

  it("molienda y empaque no tienen referencia: nunca hay desvío", () => {
    expect(referenciaDelPaso("molienda", CFG)).toBeNull();
    expect(referenciaDelPaso("empaque", CFG)).toBeNull();
    const m = mermaEnVivo("molienda", 332, 100, CFG)!;
    expect(m.desvio).toBe(false);
    expect(m.referenciaPct).toBeNull();
  });

  it("devuelve null con datos a medias o incoherentes (salida mayor que la entrada)", () => {
    expect(mermaEnVivo("trilla", null, 405, CFG)).toBeNull();
    expect(mermaEnVivo("trilla", 500, null, CFG)).toBeNull();
    expect(mermaEnVivo("trilla", 500, 600, CFG)).toBeNull();
    expect(mermaEnVivo("trilla", 0, 0, CFG)).toBeNull();
  });
});

describe("valorDelServicio", () => {
  it("tostión de 405 kg a $2.200/kg = $891.000", () => {
    expect(valorDelServicio("servicio", "tostion", 405, 2200)).toEqual({ tarifaKg: 2200, valor: 891000 });
  });

  it("sin tarifa definida no hay valor", () => {
    expect(valorDelServicio("servicio", "molienda", 332, null)).toEqual({ tarifaKg: null, valor: null });
  });

  it("el empaque y la marca propia no se cobran", () => {
    expect(valorDelServicio("servicio", "empaque", 330, 0)).toBeNull();
    expect(valorDelServicio("marca_propia", "tostion", 405, 2200)).toBeNull();
  });

  it("sin entrada todavía, la tarifa se muestra y el valor no", () => {
    expect(valorDelServicio("servicio", "trilla", null, 1400)).toEqual({ tarifaKg: 1400, valor: null });
  });
});

describe("textos del resultado", () => {
  it("lote parcial: 2 de 6 bultos tostados", () => {
    expect(textoEstadoLote("parcial", "0 de 2", { tipo: "tostion", procesados: 2, total: 6 })).toBe(
      "Lote parcial: 2 de 6 bultos tostados",
    );
  });

  it("listo, en proceso y recibido", () => {
    expect(textoEstadoLote("listo", "4 de 4", { tipo: "empaque", procesados: 8, total: 8 })).toBe("Lote listo: todos los pasos están completos");
    expect(textoEstadoLote("en_proceso", "1 de 3", { tipo: "trilla", procesados: 8, total: 8 })).toBe("Lote en proceso: 1 de 3");
  });

  it("textoProcesoRegistrado", () => {
    expect(textoProcesoRegistrado("tostion", 18.025, 73)).toBe("Tostión registrada · merma 18,0 % (73,000 kg)");
    expect(textoProcesoRegistrado("empaque", 0, 0)).toBe("Empaque registrado · merma 0,0 % (0,000 kg)");
  });
});
