import { z } from "zod";
import { esFechaYmd } from "@/modules/cafe/lotes/lib/filtros";

// Validación de las remisiones (Server Actions). Los mismos límites que la base: la RPC los repite.

const textoOpcional = (max: number, mensaje: string) =>
  z
    .string()
    .trim()
    .max(max, mensaje)
    .optional()
    .transform((v) => (v ? v : undefined));

export const generarRemisionSchema = z
  .object({
    loteId: z.uuid({ message: "El lote no es válido." }),
    /** Fecha de entrega, `YYYY-MM-DD`. */
    fecha: z.string().refine(esFechaYmd, "La fecha de entrega no es válida."),
    recibidoPor: textoOpcional(120, "El nombre de quien recibe es demasiado largo (máximo 120 caracteres)."),
    observaciones: textoOpcional(500, "Las observaciones son demasiado largas (máximo 500 caracteres)."),
    /** Entregar con servicios pendientes: solo `owner`/`admin`, y con observación. */
    forzar: z.boolean().optional().default(false),
  })
  .refine((v) => !v.forzar || Boolean(v.observaciones), {
    path: ["observaciones"],
    message: "Para entregar con servicios pendientes escribe la observación (por qué se entrega así).",
  });

export type GenerarRemisionInput = z.input<typeof generarRemisionSchema>;
export type GenerarRemisionDatos = z.output<typeof generarRemisionSchema>;

export const anularRemisionSchema = z.object({
  remisionId: z.uuid({ message: "La remisión no es válida." }),
  motivo: z
    .string()
    .trim()
    .min(3, "Escribe el motivo de la anulación.")
    .max(500, "El motivo es demasiado largo (máximo 500 caracteres)."),
});

export type AnularRemisionInput = z.input<typeof anularRemisionSchema>;

/** Cuerpo de `cafe.generar_remision(p jsonb)` a partir de lo validado. */
export function payloadRemision(d: GenerarRemisionDatos) {
  return {
    lote_id: d.loteId,
    fecha: d.fecha,
    recibido_por: d.recibidoPor ?? null,
    observaciones: d.observaciones ?? null,
    forzar: d.forzar,
  };
}
