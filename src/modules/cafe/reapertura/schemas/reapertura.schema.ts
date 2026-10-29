import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import { parsearUnidades } from "../../empaque/lib/empaque";
import { parsearDecimal } from "../../procesos/lib/numero";

// `message` en vez de `required_error`/`invalid_type_error`: Zod 4 ya no los acepta. Mismas reglas que
// `cafe.reabrir_producto()` y `cafe.registrar_proceso()` (la base las repite: es la frontera real) para que el
// formulario avise antes de guardar. Las unidades aceptan texto con punto de miles y los pesos, COMA decimal: el
// formulario guarda lo que escribe el operario y el schema lo normaliza, en el navegador y en el Server Action.

const MAX_KG = 10_000_000; // la base rechaza >= 10.000.000 (numeric(10,3))
const MAX_UNIDADES = 99_999;

const enGramos = (n: number) => Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-6;
const vacio = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

const unidades = z.union([z.number(), z.string()], { message: "Indica las unidades" }).transform((v, ctx) => {
  const n = parsearUnidades(v);
  if (n === null) {
    ctx.addIssue({ code: "custom", message: "Las unidades son un número entero mayor que cero" });
    return z.NEVER;
  }
  if (n > MAX_UNIDADES) ctx.addIssue({ code: "custom", message: "Las unidades son demasiadas" });
  return n;
});

const fecha = z.string({ message: "Indica la fecha" }).regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida");

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .nullish()
    .transform((v) => (v ? v : null));

// --- Reabrir producto -------------------------------------------------------------------------------------------------

export const reabrirSchema = z.object({
  loteId: z.uuid({ message: "El lote no es válido" }),
  presentacionG: z
    .number({ message: "Elige la presentación" })
    .int("La presentación son gramos enteros")
    .min(1, "Elige la presentación")
    .max(MAX_UNIDADES, "La presentación no es válida"),
  unidades,
  /** `YYYY-MM-DD` en la zona del cliente. */
  fecha,
  motivo: textoOpcional(500),
});

export type ReabrirFormInput = z.input<typeof reabrirSchema>;
export type ReabrirValues = z.output<typeof reabrirSchema>;

/** Los nombres que espera `cafe.reabrir_producto` (snake_case). */
export function payloadReabrir(v: ReabrirValues): Json {
  return {
    lote_id: v.loteId,
    presentacion_g: v.presentacionG,
    unidades: v.unidades,
    fecha: v.fecha,
    motivo: v.motivo,
  };
}

// --- Molienda de lo reabierto ----------------------------------------------------------------------------------------------

const kilos = (mensaje: string) =>
  z.union([z.number(), z.string()], { message: mensaje }).transform((v, ctx) => {
    const n = parsearDecimal(v);
    if (n === null) {
      ctx.addIssue({ code: "custom", message: mensaje });
      return z.NEVER;
    }
    if (n >= MAX_KG) ctx.addIssue({ code: "custom", message: "El peso es demasiado grande" });
    else if (!enGramos(n)) ctx.addIssue({ code: "custom", message: "Usa como máximo 3 decimales (gramos)" });
    return n;
  });

export const moliendaReaperturaSchema = z
  .object({
    loteId: z.uuid({ message: "El lote no es válido" }),
    reaperturaId: z.uuid({ message: "La reapertura no es válida" }),
    fecha,
    /** Vacío = todo lo reabierto (la base lo toma del disponible). */
    pesoEntradaKg: z
      .union([z.number(), z.string(), z.null()])
      .nullish()
      .transform((v, ctx) => {
        if (vacio(v)) return null;
        const n = parsearDecimal(v as string | number);
        if (n === null || n <= 0) {
          ctx.addIssue({ code: "custom", message: "El peso de entrada debe ser un número mayor que cero" });
          return z.NEVER;
        }
        return n;
      }),
    pesoSalidaKg: kilos("Indica el peso de salida (lo que quedó molido)"),
    observaciones: textoOpcional(500),
  })
  .superRefine((v, ctx) => {
    const entrada = v.pesoEntradaKg;
    if (entrada !== null && v.pesoSalidaKg > entrada) {
      ctx.addIssue({ code: "custom", path: ["pesoSalidaKg"], message: "La salida no puede superar la entrada" });
    }
  });

export type MoliendaReaperturaInput = z.input<typeof moliendaReaperturaSchema>;
export type MoliendaReaperturaValues = z.output<typeof moliendaReaperturaSchema>;

/** Carga de `cafe.registrar_proceso(p)` para la molienda de una reapertura: sin bultos, baches ni tueste. */
export function payloadMoliendaReapertura(v: MoliendaReaperturaValues): Record<string, Json> {
  return {
    lote_id: v.loteId,
    tipo: "molienda",
    fecha: v.fecha,
    reapertura_id: v.reaperturaId,
    peso_entrada_kg: v.pesoEntradaKg,
    peso_salida_kg: v.pesoSalidaKg,
    observaciones: v.observaciones,
  };
}
