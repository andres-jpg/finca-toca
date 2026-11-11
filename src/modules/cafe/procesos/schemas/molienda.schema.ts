import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import { parsearDecimal } from "../lib/numero";

// Confirmar la molienda de una tanda (B-07): sin pesos ni merma. `modo`/`kg` solo viajan si se modificó la cantidad antes de
// confirmar («Modificar cantidad»); la base recalcula los kilos de «todo» y «mitad» y valida «Otra cantidad».

export const confirmarMoliendaSchema = z
  .object({
    loteId: z.uuid({ message: "El lote no es válido" }),
    tostionProcesoId: z.uuid({ message: "Elige la tanda" }),
    /** `YYYY-MM-DD` en la zona del cliente. */
    fecha: z.string({ message: "Indica la fecha" }).regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida"),
    modo: z
      .enum(["todo", "mitad", "kg"], { message: "Elige Todo, Mitad u Otra cantidad" })
      .nullish()
      .transform((v) => v ?? null),
    kg: z
      .union([z.number(), z.string(), z.null()])
      .nullish()
      .transform((v) => (v === null || v === undefined || v === "" ? null : parsearDecimal(v))),
    observaciones: z
      .string()
      .trim()
      .max(500, "Máximo 500 caracteres")
      .nullish()
      .transform((v) => (v ? v : null)),
  })
  .superRefine((v, ctx) => {
    if (v.modo === "kg" && (v.kg === null || v.kg <= 0)) {
      ctx.addIssue({ code: "custom", path: ["kg"], message: "Indica los kilos a moler" });
    }
  })
  .transform((v) => ({ ...v, kg: v.modo === "kg" ? v.kg : null }));

export type ConfirmarMoliendaInput = z.input<typeof confirmarMoliendaSchema>;
export type ConfirmarMoliendaValues = z.output<typeof confirmarMoliendaSchema>;

/** Carga que espera `cafe.confirmar_molienda(p)`. */
export function payloadConfirmarMolienda(v: ConfirmarMoliendaValues): Record<string, Json> {
  return {
    lote_id: v.loteId,
    tostion_proceso_id: v.tostionProcesoId,
    fecha: v.fecha,
    modo: v.modo,
    kg: v.kg,
    observaciones: v.observaciones,
  };
}
