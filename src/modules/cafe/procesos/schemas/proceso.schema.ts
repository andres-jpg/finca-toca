import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import { bachesCuadran, totalesBaches } from "../lib/baches";
import { formatearPeso, parsearDecimal } from "../lib/numero";

// `message` en vez de `required_error`/`invalid_type_error`: Zod 4 ya no los acepta. Mismas reglas que
// `cafe.registrar_proceso()` / `cafe._insertar_proceso()` (la base las repite: es la frontera real) para que el
// formulario avise antes de guardar. Los pesos aceptan texto con COMA decimal («13,5»): el formulario guarda
// lo que escribe el operario y este schema lo normaliza, tanto en el navegador como en el Server Action.

export const TIPOS_PROCESO = ["trilla", "tostion", "molienda", "empaque"] as const;
export const NIVELES_TUESTE = ["bajo", "medio", "alto"] as const;

const MAX_BULTOS = 200;
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

export const bacheSchema = z
  .object({
    pesoEntradaKg: kilos("Indica los kg de entrada del bache").refine((n) => n > 0, "La entrada del bache debe ser mayor que cero"),
    pesoSalidaKg: kilos("Indica los kg de salida del bache"),
    temperaturaC: decimalOpcional("La temperatura debe ser un número").refine(
      (n) => n === null || n <= 999,
      "La temperatura no es válida",
    ),
    observaciones: z
      .string()
      .trim()
      .max(200, "Máximo 200 caracteres")
      .nullish()
      .transform((v) => (v ? v : null)),
  })
  .superRefine((b, ctx) => {
    if (b.pesoSalidaKg > b.pesoEntradaKg) {
      ctx.addIssue({ code: "custom", path: ["pesoSalidaKg"], message: "La salida no puede superar la entrada" });
    }
  });

export const procesoSchema = z
  .object({
    loteId: z.uuid({ message: "El lote no es válido" }),
    tipo: z.enum(TIPOS_PROCESO, { message: "Elige el paso a registrar" }),
    /** `YYYY-MM-DD` en la zona del cliente. */
    fecha: z.string({ message: "Indica la fecha" }).regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida"),
    /** Bultos que pasan. Un lote de un solo bulto manda el suyo (el formulario no muestra la selección). */
    bultoIds: z.array(z.uuid({ message: "Bulto no válido" })).max(MAX_BULTOS),
    pesoEntradaKg: kilos("Indica el peso de entrada").refine((n) => n > 0, "El peso de entrada debe ser mayor que cero"),
    /** Trilla, molienda y empaque lo piden; en la tostión es la suma de las salidas de los baches. */
    pesoSalidaKg: kilosOpcional("El peso de salida debe ser un número"),
    nivelTueste: z
      .enum(NIVELES_TUESTE, { message: "Elige el nivel de tueste" })
      .nullish()
      .transform((v) => v ?? null),
    baches: z
      .array(bacheSchema)
      .max(500, "Demasiados baches")
      .nullish()
      .transform((v) => v ?? []),
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
      const { entradaKg, salidaKg } = totalesBaches(
        v.baches.map((b) => ({ peso_entrada_kg: b.pesoEntradaKg, peso_salida_kg: b.pesoSalidaKg })),
      );
      if (!bachesCuadran(v.baches.map((b) => ({ peso_entrada_kg: b.pesoEntradaKg, peso_salida_kg: b.pesoSalidaKg })), v.pesoEntradaKg, salidaKg)) {
        ctx.addIssue({
          code: "custom",
          path: ["baches"],
          message: `Los baches suman ${formatearPeso(entradaKg)} kg de entrada y el peso de entrada es ${formatearPeso(v.pesoEntradaKg)} kg`,
        });
      }
      if (v.pesoSalidaKg !== null && Math.abs(Math.round(v.pesoSalidaKg * 1000) - Math.round(salidaKg * 1000)) > 1) {
        ctx.addIssue({ code: "custom", path: ["pesoSalidaKg"], message: "El peso de salida debe ser la suma de los baches" });
      }
      return;
    }

    if (v.baches.length > 0) {
      ctx.addIssue({ code: "custom", path: ["baches"], message: "Solo la tostión se registra por baches" });
    }
    if (v.pesoSalidaKg === null) {
      ctx.addIssue({ code: "custom", path: ["pesoSalidaKg"], message: "Indica el peso de salida" });
    } else if (v.pesoSalidaKg > v.pesoEntradaKg) {
      ctx.addIssue({ code: "custom", path: ["pesoSalidaKg"], message: "La salida no puede superar la entrada" });
    }
  })
  // Solo la tostión lleva nivel de tueste y baches; su salida es la suma de las salidas de los baches.
  .transform((v) => ({
    ...v,
    nivelTueste: v.tipo === "tostion" ? v.nivelTueste : null,
    baches: v.tipo === "tostion" ? v.baches : [],
    pesoSalidaKg:
      v.tipo === "tostion"
        ? totalesBaches(v.baches.map((b) => ({ peso_entrada_kg: b.pesoEntradaKg, peso_salida_kg: b.pesoSalidaKg }))).salidaKg
        : (v.pesoSalidaKg as number),
  }));

export type ProcesoFormInput = z.input<typeof procesoSchema>;
export type ProcesoValues = z.output<typeof procesoSchema>;

/** Carga que espera `cafe.registrar_proceso(p)`. `tenant_id` lo pone el DEFAULT `tenant_actual()`. */
export function payloadProceso(v: ProcesoValues): Record<string, Json> {
  return {
    lote_id: v.loteId,
    tipo: v.tipo,
    fecha: v.fecha,
    bultos: v.bultoIds,
    peso_entrada_kg: v.pesoEntradaKg,
    peso_salida_kg: v.pesoSalidaKg,
    nivel_tueste: v.nivelTueste,
    baches:
      v.tipo === "tostion"
        ? v.baches.map((b) => ({
            peso_entrada_kg: b.pesoEntradaKg,
            peso_salida_kg: b.pesoSalidaKg,
            temperatura_c: b.temperaturaC,
            observaciones: b.observaciones,
          }))
        : null,
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
