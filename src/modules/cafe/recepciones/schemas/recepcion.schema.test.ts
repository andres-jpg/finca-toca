import { describe, expect, it } from "vitest";
import { crearRecepcionSchema, payloadRecepcion, recepcionSchema } from "./recepcion.schema";

const TERCERO = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d";

const base = {
  terceroId: TERCERO,
  fecha: "2026-11-05",
  pesoKg: 500,
  humedadPct: 11.5,
  densidad: 680,
  servicios: ["trilla"],
};

function error(input: unknown): string | undefined {
  const r = recepcionSchema.safeParse(input);
  return r.success ? undefined : r.error.issues[0]?.message;
}

describe("recepcionSchema", () => {
  it("acepta una recepción de solo trilla y normaliza lo opcional a null", () => {
    const r = recepcionSchema.parse(base);
    expect(r).toMatchObject({ pesoKg: 500, servicios: ["trilla"], nivelTueste: null, observaciones: null });
  });

  it("humedad y densidad son opcionales (vacío = no se midió)", () => {
    const r = recepcionSchema.parse({ ...base, humedadPct: null, densidad: undefined });
    expect(r.humedadPct).toBeNull();
    expect(r.densidad).toBeNull();
  });

  it("exige el cliente", () => {
    expect(error({ ...base, terceroId: "" })).toBe("Elige el cliente");
    expect(error({ ...base, terceroId: undefined })).toBe("Elige el cliente");
  });

  it("exige al menos un servicio", () => {
    expect(error({ ...base, servicios: [] })).toBe("Elige al menos un servicio");
  });

  it("con tostión exige el nivel de tueste", () => {
    expect(error({ ...base, servicios: ["trilla", "tostion", "molienda"] })).toBe("Elige el nivel de tueste");
    expect(error({ ...base, servicios: ["tostion"], nivelTueste: null })).toBe("Elige el nivel de tueste");
    expect(recepcionSchema.parse({ ...base, servicios: ["trilla", "tostion", "molienda"], nivelTueste: "medio" }).nivelTueste).toBe("medio");
  });

  it("sin tostión el nivel de tueste se descarta", () => {
    expect(recepcionSchema.parse({ ...base, nivelTueste: "alto" }).nivelTueste).toBeNull();
  });

  it("la molienda requiere tostión", () => {
    expect(error({ ...base, servicios: ["molienda"] })).toBe("La molienda requiere tostión");
  });

  it("rechaza servicios desconocidos (el empaque no se elige: va con la tostión)", () => {
    expect(error({ ...base, servicios: ["empaque"] })).toBe("Servicio no válido");
    expect(error({ ...base, servicios: ["secado"] })).toBe("Servicio no válido");
  });

  it("peso recibido (kg)", () => {
    expect(error({ ...base, pesoKg: 0 })).toBe("El peso debe ser mayor que cero");
    expect(error({ ...base, pesoKg: Number.NaN })).toBe("Indica el peso recibido");
  });

  it("humedad 0–100 y densidad > 0", () => {
    expect(error({ ...base, humedadPct: 101 })).toBe("La humedad debe estar entre 0 y 100 %");
    expect(error({ ...base, humedadPct: -1 })).toBe("La humedad debe estar entre 0 y 100 %");
    expect(error({ ...base, densidad: 0 })).toBe("La densidad debe ser mayor que cero");
    expect(error({ ...base, densidad: Number.NaN })).toBe("La densidad debe ser mayor que cero");
  });

  it("observaciones: recorta espacios y vacío = null", () => {
    expect(recepcionSchema.parse({ ...base, observaciones: "  Trae bolsa  " }).observaciones).toBe("Trae bolsa");
    expect(recepcionSchema.parse({ ...base, observaciones: "   " }).observaciones).toBeNull();
    expect(error({ ...base, observaciones: "x".repeat(501) })).toBe("Máximo 500 caracteres");
  });

  it("la fecha tiene formato YYYY-MM-DD", () => {
    expect(error({ ...base, fecha: "05/11/2026" })).toBe("La fecha no es válida");
  });
});

describe("payloadRecepcion", () => {
  it("monta la carga de la RPC en snake_case (el ejemplo de la tarea)", () => {
    const v = recepcionSchema.parse({ ...base, servicios: ["trilla", "tostion", "molienda"], nivelTueste: "medio" });
    expect(payloadRecepcion(v)).toEqual({
      tercero_id: TERCERO,
      fecha: "2026-11-05",
      peso_kg: 500,
      humedad_pct: 11.5,
      densidad: 680,
      servicios: ["trilla", "tostion", "molienda"],
      nivel_tueste: "medio",
      perfil_temp_c: null,
      perfil_tiempo_min: null,
      // Con tostión, un solo perfil sin kilos: la base le asigna todos los del lote.
      perfiles: [{ nivel: "medio", temp_c: null, tiempo_min: null, kg: null }],
      molienda_modo: "todo",
      molienda_kg: null,
      observaciones: null,
    });
  });

  it("incluye el perfil de tueste pedido por el cliente", () => {
    const v = recepcionSchema.parse({ ...base, servicios: ["tostion"], nivelTueste: "medio", perfilTempC: 205, perfilTiempoMin: 12 });
    expect(payloadRecepcion(v)).toMatchObject({ nivel_tueste: "medio", perfil_temp_c: 205, perfil_tiempo_min: 12 });
  });
});

describe("perfil de tueste", () => {
  const tostion = { ...base, servicios: ["tostion"], nivelTueste: "medio" };
  it("temperatura y tiempo son opcionales", () => {
    expect(recepcionSchema.parse(tostion)).toMatchObject({ perfilTempC: null, perfilTiempoMin: null });
    expect(recepcionSchema.parse({ ...tostion, perfilTempC: 205 })).toMatchObject({ perfilTempC: 205, perfilTiempoMin: null });
  });
  it("rechaza valores fuera de rango", () => {
    expect(error({ ...tostion, perfilTempC: 0 })).toBe("La temperatura debe estar entre 1 y 400 °C");
    expect(error({ ...tostion, perfilTempC: 500 })).toBe("La temperatura debe estar entre 1 y 400 °C");
    expect(error({ ...tostion, perfilTiempoMin: 200 })).toBe("El tiempo debe estar entre 1 y 120 minutos");
  });
  it("sin tostión se descarta", () => {
    const r = recepcionSchema.parse({ ...base, servicios: ["trilla"], perfilTempC: 205, perfilTiempoMin: 12 });
    expect(r).toMatchObject({ perfilTempC: null, perfilTiempoMin: null });
  });
});

describe("varios perfiles por kilos (B-02)", () => {
  const maquila = { ...base, pesoKg: 40.5, servicios: ["tostion"], modoPerfil: "varios" };
  const fila = (kg: number | null, nivel = "medio") => ({ nivel, tempC: 222, tiempoMin: 17, kg });

  it("27,0 + 13,5 kg sobre 40,5 kg guarda", () => {
    const r = recepcionSchema.safeParse({ ...maquila, perfiles: [fila(27), fila(13.5, "alto")] });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(payloadRecepcion(r.data).perfiles).toEqual([
        { nivel: "medio", temp_c: 222, tiempo_min: 17, kg: 27 },
        { nivel: "alto", temp_c: 222, tiempo_min: 17, kg: 13.5 },
      ]);
    }
  });

  it("27,0 + 10,0 muestra «Los kilos por perfil deben sumar 40,5 kg»", () => {
    expect(error({ ...maquila, perfiles: [fila(27), fila(10)] })).toBe("Los kilos por perfil deben sumar 40,5 kg");
  });

  it("con trilla compara con los kilos estimados a tostión (merma de trilla del cliente)", () => {
    const conTrilla = { ...maquila, servicios: ["trilla", "tostion"] };
    // 40,5 × 0,81 = 32,805
    expect(error({ ...conTrilla, perfiles: [fila(20), fila(12.8)] })).toBeUndefined();
    expect(error({ ...conTrilla, perfiles: [fila(27), fila(13.5)] })).toBe("Los kilos por perfil deben sumar 32,8 kg");
    const otra = crearRecepcionSchema(10).safeParse({ ...conTrilla, perfiles: [fila(20), fila(16.4)] });
    expect(otra.success).toBe(true); // 40,5 × 0,90 = 36,45
  });

  it("pide al menos dos perfiles y los kilos de cada fila", () => {
    expect(error({ ...maquila, perfiles: [fila(40.5)] })).toBe("Agrega al menos dos perfiles");
    expect(error({ ...maquila, perfiles: [fila(27), fila(null)] })).toBe("Indica los kilos del perfil");
    expect(error({ ...maquila, perfiles: [fila(0), fila(40.5)] })).toBe("Los kilos del perfil deben ser mayores que cero");
  });

  it("un perfil: sin kilos en la carga y con el modo «uno» ignora las filas", () => {
    const r = recepcionSchema.parse({ ...base, servicios: ["tostion"], nivelTueste: "medio", perfilTempC: 222, perfilTiempoMin: 17, perfiles: [fila(1)] });
    expect(payloadRecepcion(r).perfiles).toEqual([{ nivel: "medio", temp_c: 222, tiempo_min: 17, kg: null }]);
  });

  it("sin tostión no hay perfiles", () => {
    const r = recepcionSchema.parse({ ...base, servicios: ["trilla"], modoPerfil: "varios", perfiles: [fila(1), fila(2)] });
    expect(r.perfiles).toEqual([]);
    expect(payloadRecepcion(r)).not.toHaveProperty("perfiles");
  });
});

describe("cantidad a moler (B-03)", () => {
  const conMolienda = { ...base, servicios: ["trilla", "tostion", "molienda"], nivelTueste: "medio" };
  it("con molienda contratada, sin elegir, es «todo»", () => {
    expect(recepcionSchema.parse(conMolienda)).toMatchObject({ moliendaModo: "todo", moliendaKg: null });
  });
  it("«Mitad» no lleva kilos digitados", () => {
    expect(recepcionSchema.parse({ ...conMolienda, moliendaModo: "mitad", moliendaKg: 5 })).toMatchObject({ moliendaModo: "mitad", moliendaKg: null });
  });
  it("«Otra cantidad» exige los kilos", () => {
    const r = recepcionSchema.safeParse({ ...conMolienda, moliendaModo: "kg" });
    expect(r.success).toBe(false);
    expect(recepcionSchema.parse({ ...conMolienda, moliendaModo: "kg", moliendaKg: 10 })).toMatchObject({ moliendaModo: "kg", moliendaKg: 10 });
  });
  it("sin molienda contratada no hay cantidad a moler", () => {
    const v = recepcionSchema.parse({ ...base, servicios: ["tostion"], nivelTueste: "medio", moliendaModo: "mitad" });
    expect(v).toMatchObject({ moliendaModo: null, moliendaKg: null });
  });
});
