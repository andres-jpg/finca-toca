import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";

// `message` en vez de `required_error`/`invalid_type_error`: Zod 4 ya no los acepta. Mismas reglas que
// `cafe.registrar_recepcion()` (la base las repite: es la frontera real) para que el formulario avise antes.

/** Servicios que se eligen. El empaque no: va incluido si hay tostión (lo añade la base). */
export const SERVICIOS_RECEPCION = ["trilla", "tostion", "molienda"] as const;
export const NIVELES_TUESTE = ["bajo", "medio", "alto"] as const;

const MAX_BULTOS = 200;
const HUMEDAD_MSG = "La humedad debe estar entre 0 y 100 %";
const DENSIDAD_MSG = "La densidad debe ser mayor que cero";

/** Vacío o ausente = `null` (no se midió). */
const opcional = <T extends z.ZodType<number>>(schema: T) => schema.nullish().transform((v) => v ?? null);

export const recepcionSchema = z
  .object({
    terceroId: z.uuid({ message: "Elige el cliente" }),
    /** `YYYY-MM-DD` en la zona del cliente. */
    fecha: z.string({ message: "Indica la fecha" }).regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida"),
    numBultos: z
      .number({ message: "Indica el número de bultos" })
      .int("El número de bultos debe ser entero")
      .min(1, "Mínimo 1 bulto")
      .max(MAX_BULTOS, `Máximo ${MAX_BULTOS} bultos`),
    pesoKg: z
      .number({ message: "Indica el peso total" })
      .refine(Number.isFinite, { message: "Indica el peso total" })
      .gt(0, "El peso debe ser mayor que cero")
      .max(9_999_999, "El peso es demasiado grande"),
    /** Pesos individuales; `null` = partes iguales (lo reparte la base). */
    pesosBultos: z
      .array(z.number({ message: "El peso de cada bulto debe ser un número" }).gt(0, "El peso de cada bulto debe ser mayor que cero"))
      .nullish()
      .transform((v) => v ?? null),
    humedadPct: opcional(
      z.number({ message: HUMEDAD_MSG }).min(0, HUMEDAD_MSG).max(100, HUMEDAD_MSG),
    ),
    densidad: opcional(
      z.number({ message: DENSIDAD_MSG }).gt(0, DENSIDAD_MSG).max(99_999, DENSIDAD_MSG),
    ),
    servicios: z.array(z.enum(SERVICIOS_RECEPCION, { message: "Servicio no válido" })).min(1, "Elige al menos un servicio"),
    nivelTueste: z
      .enum(NIVELES_TUESTE, { message: "Elige el nivel de tueste" })
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
    const tostion = v.servicios.includes("tostion");
    if (v.servicios.includes("molienda") && !tostion) {
      ctx.addIssue({ code: "custom", path: ["servicios"], message: "La molienda requiere tostión" });
    }
    if (tostion && !v.nivelTueste) {
      ctx.addIssue({ code: "custom", path: ["nivelTueste"], message: "Elige el nivel de tueste" });
    }
    if (v.pesosBultos) {
      const suma = v.pesosBultos.reduce((a, b) => a + b, 0);
      if (v.pesosBultos.length !== v.numBultos) {
        ctx.addIssue({ code: "custom", path: ["pesosBultos"], message: `Debe haber ${v.numBultos} pesos de bulto` });
      } else if (Math.abs(suma - v.pesoKg) > 0.001) {
        ctx.addIssue({ code: "custom", path: ["pesosBultos"], message: "Los pesos de los bultos deben sumar el peso total" });
      }
    }
  })
  // Sin tostión no hay nivel de tueste (el CHECK de la tabla lo exige nulo).
  .transform((v) => ({ ...v, nivelTueste: v.servicios.includes("tostion") ? v.nivelTueste : null }));

export type RecepcionFormInput = z.input<typeof recepcionSchema>;
export type RecepcionValues = z.output<typeof recepcionSchema>;

/** Carga que espera `cafe.registrar_recepcion(p)`. `tenant_id` y el código los pone la base. */
export function payloadRecepcion(v: RecepcionValues): Record<string, Json> {
  return {
    tercero_id: v.terceroId,
    fecha: v.fecha,
    peso_kg: v.pesoKg,
    num_bultos: v.numBultos,
    pesos_bultos: v.pesosBultos,
    humedad_pct: v.humedadPct,
    densidad: v.densidad,
    servicios: v.servicios,
    nivel_tueste: v.nivelTueste,
    observaciones: v.observaciones,
  };
}
