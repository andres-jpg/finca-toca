import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import { bachesCuadran, totalesBaches } from "../lib/baches";
import { MODOS_MOLIENDA } from "../lib/molienda";
import { formatearPeso, parsearDecimal } from "../lib/numero";

// `message` en vez de `required_error`/`invalid_type_error`: Zod 4 ya no los acepta. Mismas reglas que
// `cafe.registrar_proceso()` / `cafe._insertar_proceso()` (la base las repite: es la frontera real) para que el
// formulario avise antes de guardar. Los pesos aceptan texto con COMA decimal («13,5»): el formulario guarda
// lo que escribe el operario y este schema lo normaliza, tanto en el navegador como en el Server Action.

export const TIPOS_PROCESO = ["trilla", "tostion", "molienda", "empaque"] as const;
export const NIVELES_TUESTE = ["bajo", "medio", "alto"] as const;

const MAX_KG = 10_000_000; // la base rechaza >= 10.000.000 (numeric(10,3))

const enGramos = (n: number) => Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-6;
const vacio = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/** Número obligatorio que puede llegar como texto con coma. */
const decimal = (mensaje: string) =>
  z.union([z.number(), z.string()], { message: mensaje }).transform((v, ctx) => {
    const n = parsearDecimal(v);
    if (n === null) {
      ctx.addIssue({ code: "custom", message: mensaje });
      return z.NEVER;
    }
    return n;
  });

/** Número opcional: vacío o ausente = `null`; escrito pero ilegible = error. */
const decimalOpcional = (mensaje: string) =>
  z
    .union([z.number(), z.string(), z.null()], { message: mensaje })
    .nullish()
    .transform((v, ctx) => {
      if (vacio(v)) return null;
      const n = parsearDecimal(v as string | number);
      if (n === null) {
        ctx.addIssue({ code: "custom", message: mensaje });
        return z.NEVER;
      }
      return n;
    });

const limitesKg = (n: number, ctx: z.RefinementCtx) => {
  if (n >= MAX_KG) ctx.addIssue({ code: "custom", message: "El peso es demasiado grande" });
  else if (!enGramos(n)) ctx.addIssue({ code: "custom", message: "Usa como máximo 3 decimales (gramos)" });
};

const kilos = (mensaje: string) => decimal(mensaje).superRefine(limitesKg);
const kilosOpcional = (mensaje: string) =>
  decimalOpcional(mensaje).superRefine((n, ctx) => {
    if (n !== null) limitesKg(n, ctx);
  });

export const bacheSchema = z.object({
  pesoEntradaKg: kilos("Indica los kg de entrada del bache").refine((n) => n > 0, "La entrada del bache debe ser mayor que cero"),
  /** Nivel de tueste del bache; `null` = el de la tostión. */
  nivel: z
    .enum(NIVELES_TUESTE)
    .nullish()
    .transform((v) => v ?? null),
  temperaturaC: decimalOpcional("La temperatura debe ser un número").refine((n) => n === null || n <= 999, "La temperatura no es válida"),
  tiempoMin: decimalOpcional("El tiempo debe ser un número").refine((n) => n === null || (n > 0 && n <= 999), "El tiempo no es válido"),
  observaciones: z
    .string()
    .trim()
    .max(200, "Máximo 200 caracteres")
    .nullish()
    .transform((v) => (v ? v : null)),
});

export const procesoSchema = z
  .object({
    loteId: z.uuid({ message: "El lote no es válido" }),
    tipo: z.enum(TIPOS_PROCESO, { message: "Elige el paso a registrar" }),
    /** `YYYY-MM-DD` en la zona del cliente. */
    fecha: z.string({ message: "Indica la fecha" }).regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida"),
    /** Proceso previo del que consume (la tanda); `null` = el café recibido o el único con saldo (lo resuelve la base). */
    origenProcesoId: z
      .uuid({ message: "El origen no es válido" })
      .nullish()
      .transform((v) => v ?? null),
    /** Tostión: «kilos a tostar ahora». Trilla: lo que entra. Molienda: kilos a moler. */
    pesoEntradaKg: kilos("Indica los kilos del proceso").refine((n) => n > 0, "Los kilos deben ser mayores que cero"),
    /** Solo la trilla lo pide (peso final). La tostión y la molienda no llevan salida; el empaque va por su formulario. */
    pesoSalidaKg: kilosOpcional("El peso de salida debe ser un número"),
    /** Solo la trilla (B-04): humedad (%) y densidad (g/L) del café al terminar. Opcionales. */
    humedadPct: decimalOpcional("La humedad debe ser un número").refine((n) => n === null || (n >= 0 && n <= 100), "La humedad va entre 0 y 100 %"),
    densidadGl: decimalOpcional("La densidad debe ser un número").refine((n) => n === null || (n > 0 && n <= 99999), "La densidad debe ser mayor que cero"),
    nivelTueste: z
      .enum(NIVELES_TUESTE, { message: "Elige el nivel de tueste" })
      .nullish()
      .transform((v) => v ?? null),
    baches: z
      .array(bacheSchema)
      .max(500, "Demasiados baches")
      .nullish()
      .transform((v) => v ?? []),
    /** Tostión: lo que se decide moler de esta tanda (B-06). La base recalcula los kilos de «todo» y «mitad». */
    molienda: z
      .object({
        modo: z.enum(MODOS_MOLIENDA, { message: "Elige la cantidad a moler" }),
        kg: decimalOpcional("Los kilos a moler deben ser un número"),
      })
      .nullish()
      .transform((v) => v ?? null),
    observaciones: z
      .string()
      .trim()
      .max(500, "Máximo 500 caracteres")
      .nullish()
      .transform((v) => (v ? v : null)),
  })
  .superRefine((v, ctx) => {
    if (v.tipo === "tostion") {
      if (v.baches.length === 0) {
        ctx.addIssue({ code: "custom", path: ["baches"], message: "La tostión se registra por baches: añade al menos uno" });
        return;
      }
      if (!v.nivelTueste) {
        ctx.addIssue({ code: "custom", path: ["nivelTueste"], message: "Elige el nivel de tueste" });
      }
      if (v.molienda?.modo === "kg" && (v.molienda.kg === null || v.molienda.kg <= 0)) {
        ctx.addIssue({ code: "custom", path: ["molienda"], message: "Indica los kilos a moler" });
      }
      const { entradaKg } = totalesBaches(v.baches.map((b) => ({ peso_entrada_kg: b.pesoEntradaKg })));
      if (!bachesCuadran(v.baches.map((b) => ({ peso_entrada_kg: b.pesoEntradaKg })), v.pesoEntradaKg)) {
        ctx.addIssue({
          code: "custom",
          path: ["baches"],
          message: `Los baches suman ${formatearPeso(entradaKg)} kg y los kilos a tostar son ${formatearPeso(v.pesoEntradaKg)} kg`,
        });
      }
      return;
    }

    if (v.baches.length > 0) {
      ctx.addIssue({ code: "custom", path: ["baches"], message: "Solo la tostión se registra por baches" });
    }
    if (v.tipo !== "trilla" && (v.humedadPct !== null || v.densidadGl !== null)) {
      ctx.addIssue({ code: "custom", path: ["humedadPct"], message: "Solo la trilla registra humedad y densidad" });
    }
    if (v.tipo === "trilla") {
      if (v.pesoSalidaKg === null) ctx.addIssue({ code: "custom", path: ["pesoSalidaKg"], message: "Indica el peso final" });
      else if (v.pesoSalidaKg > v.pesoEntradaKg) ctx.addIssue({ code: "custom", path: ["pesoSalidaKg"], message: "El peso final supera la entrada. Revisar el peso." });
    }
  })
  // Solo la tostión lleva nivel de tueste y baches; la tostión y la molienda no llevan peso de salida.
  .transform((v) => ({
    ...v,
    nivelTueste: v.tipo === "tostion" ? v.nivelTueste : null,
    baches: v.tipo === "tostion" ? v.baches : [],
    // Solo la tostión decide la molienda; los kilos digitados solo cuentan con «Otra cantidad».
    molienda: v.tipo === "tostion" && v.molienda ? { modo: v.molienda.modo, kg: v.molienda.modo === "kg" ? v.molienda.kg : null } : null,
    // La tostión no lleva salida (la fija su empaque). La molienda tampoco, salvo la de un café reabierto (que aún la pide).
    pesoSalidaKg: v.tipo === "tostion" ? null : v.pesoSalidaKg,
    humedadPct: v.tipo === "trilla" ? v.humedadPct : null,
    densidadGl: v.tipo === "trilla" ? v.densidadGl : null,
  }));

export type ProcesoFormInput = z.input<typeof procesoSchema>;
export type ProcesoValues = z.output<typeof procesoSchema>;

/** Carga que espera `cafe.registrar_proceso(p)`. `tenant_id` lo pone el DEFAULT `tenant_actual()`. */
export function payloadProceso(v: ProcesoValues): Record<string, Json> {
  return {
    lote_id: v.loteId,
    tipo: v.tipo,
    fecha: v.fecha,
    origen_proceso_id: v.origenProcesoId,
    peso_entrada_kg: v.pesoEntradaKg,
    peso_salida_kg: v.pesoSalidaKg,
    humedad_pct: v.humedadPct,
    densidad_gl: v.densidadGl,
    nivel_tueste: v.nivelTueste,
    baches:
      v.tipo === "tostion"
        ? v.baches.map((b) => ({
            peso_entrada_kg: b.pesoEntradaKg,
            nivel_tueste: b.nivel,
            temperatura_c: b.temperaturaC,
            tiempo_min: b.tiempoMin,
            observaciones: b.observaciones,
          }))
        : null,
    molienda: v.molienda ? { modo: v.molienda.modo, kg: v.molienda.kg } : null,
    observaciones: v.observaciones,
  };
}

/** Anular un proceso (solo owner/admin): el motivo es obligatorio y queda en la auditoría. */
export const anularProcesoSchema = z.object({
  procesoId: z.uuid({ message: "El proceso no es válido" }),
  motivo: z
    .string({ message: "Indica el motivo de la anulación" })
    .trim()
    .min(1, "Indica el motivo de la anulación")
    .max(500, "Máximo 500 caracteres"),
});
export type AnularProcesoInput = z.input<typeof anularProcesoSchema>;
