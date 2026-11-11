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

const CFG: ConfigMerma = {
  referenciaTrillaPct: 19,
  referenciaTostionPct: { bajo: 16, medio: 18, alto: 20 },
  toleranciaPts: 2,
};

describe("mermaEnVivo: lo mismo que las columnas generadas de cafe.procesos", () => {
  it("trilla 500 → 405: merma 95 kg, 19 %, sin desvío", () => {
    expect(mermaEnVivo("trilla", 500, 405, CFG)).toEqual({
      mermaKg: 95,
      mermaPct: 19,
      desvio: false,
      estado: "en_rango",
      referenciaPct: 19,
      toleranciaPts: 2,
    });
  });

  it("tostión 405 → 332: 18,025 %, sin desvío", () => {
    const m = mermaEnVivo("tostion", 405, 332, CFG, "medio");
    expect(m?.mermaKg).toBe(73);
    expect(m?.mermaPct).toBe(18.025);
    expect(m?.desvio).toBe(false);
  });

  it("25 % con referencia 19 ± 2 es desvío alto y avisa sin bloquear", () => {
    const m = mermaEnVivo("trilla", 500, 375, CFG)!;
    expect(m.desvio).toBe(true);
    expect(m.estado).toBe("alta");
    expect(textoDesvio(m)).toBe("Merma 25,0 % (referencia 19 % ± 2). Revisa el pesaje. Puedes guardar igualmente");
  });

  it("justo en la tolerancia (21 %) no es desvío", () => {
    const m = mermaEnVivo("trilla", 1000, 790, CFG)!;
    expect(m.mermaPct).toBe(21);
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
  it("lote parcial: quedan 202,0 kg por tostar", () => {
    expect(textoEstadoLote("parcial", "0 de 2", { tipo: "tostion", pendienteKg: 202 })).toBe("Lote parcial: quedan 202,0 kg por tostar");
  });

  it("listo, en proceso y recibido", () => {
    expect(textoEstadoLote("listo", "4 de 4", { tipo: "empaque", pendienteKg: 0 })).toBe("Lote listo: todos los pasos están completos");
    expect(textoEstadoLote("en_proceso", "1 de 3", { tipo: "trilla", pendienteKg: 0 })).toBe("Lote en proceso: 1 de 3");
  });

  it("textoProcesoRegistrado: la tostión no tiene merma hasta su empaque", () => {
    expect(textoProcesoRegistrado("trilla", 19, 95)).toBe("Trilla registrada · merma 19,0 % (95,0 kg)");
    expect(textoProcesoRegistrado("tostion", null, null, 54)).toBe("Tostión registrada · 54,0 kg");
  });
});

describe("tostión: referencia por nivel de tueste y desvío por abajo (A-03)", () => {
  it("bache 13,5 → 11,8 kg en tueste medio (12,6 %): baja, con texto de verificar", () => {
    const m = mermaEnVivo("tostion", 13.5, 11.8, CFG, "medio")!;
    expect(m.estado).toBe("baja");
    expect(m.desvio).toBe(true);
    expect(textoDesvio(m)).toBe(
      "Merma 12,6 % (referencia 18 % ± 2). Verifica el peso y el desarrollo del tueste. Puedes guardar igualmente",
    );
  });

  it("bache 13,5 → 10,6 kg (21,5 %): alta", () => {
    expect(mermaEnVivo("tostion", 13.5, 10.6, CFG, "medio")!.estado).toBe("alta");
  });

  it("cada nivel usa su referencia: 15 % es baja en medio, en rango en bajo (16 ± 2)", () => {
    expect(mermaEnVivo("tostion", 100, 85, CFG, "medio")!.estado).toBe("baja");
    expect(mermaEnVivo("tostion", 100, 85, CFG, "bajo")!.estado).toBe("en_rango");
  });

  it("sin nivel elegido no hay referencia ni estado", () => {
    const m = mermaEnVivo("tostion", 100, 85, CFG, null)!;
    expect(m.referenciaPct).toBeNull();
    expect(m.estado).toBeNull();
  });
});
