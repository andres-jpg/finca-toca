import { z } from "zod";
import { esFechaYmd } from "@/modules/cafe/lotes/lib/filtros";
import { DOCUMENTO_MAX_DIGITOS, DOCUMENTO_MIN_DIGITOS, NOMBRE_RECIBE_MAX, soloDigitos } from "../lib/entregar";

// Validación de las remisiones (Server Actions). Los mismos límites que la base: la RPC los repite.

const textoOpcional = (max: number, mensaje: string) =>
  z
    .string()
    .trim()
    .max(max, mensaje)
    .optional()
    .transform((v) => (v ? v : undefined));

export const entregarLotesSchema = z
  .object({
    /** Lotes de UN mismo cliente (la base lo comprueba). */
    loteIds: z.array(z.uuid({ message: "El lote no es válido." })).min(1, "Elige al menos un lote.").max(20, "Máximo 20 lotes por remisión."),
    /** Fecha de entrega, `YYYY-MM-DD`. */
    fecha: z.string().refine(esFechaYmd, "La fecha de entrega no es válida."),
    recibeNombre: z.string().trim().min(3, "Escribe el nombre de quien recibe.").max(NOMBRE_RECIBE_MAX, "El nombre de quien recibe es demasiado largo (máximo 120 caracteres)."),
    /** Cédula: se guarda solo con dígitos. */
    recibeDocumento: z
      .string()
      .transform(soloDigitos)
      .pipe(
        z
          .string()
          .min(DOCUMENTO_MIN_DIGITOS, `La cédula debe tener entre ${DOCUMENTO_MIN_DIGITOS} y ${DOCUMENTO_MAX_DIGITOS} dígitos.`)
          .max(DOCUMENTO_MAX_DIGITOS, `La cédula debe tener entre ${DOCUMENTO_MIN_DIGITOS} y ${DOCUMENTO_MAX_DIGITOS} dígitos.`),
      ),
    observaciones: textoOpcional(500, "Las observaciones son demasiado largas (máximo 500 caracteres)."),
    /** Entregar con servicios pendientes: solo `owner`/`admin`, y con observación. */
    forzar: z.boolean().optional().default(false),
  })
  .refine((v) => !v.forzar || Boolean(v.observaciones), {
    path: ["observaciones"],
    message: "Para entregar con servicios pendientes escribe la observación (por qué se entrega así).",
  })
  .refine((v) => new Set(v.loteIds).size === v.loteIds.length, { path: ["loteIds"], message: "Hay un lote repetido." });

export type EntregarLotesInput = z.input<typeof entregarLotesSchema>;
export type EntregarLotesDatos = z.output<typeof entregarLotesSchema>;

export const anularRemisionSchema = z.object({
  remisionId: z.uuid({ message: "La remisión no es válida." }),
  motivo: z
    .string()
    .trim()
    .min(3, "Escribe el motivo de la anulación.")
    .max(500, "El motivo es demasiado largo (máximo 500 caracteres)."),
});

export type AnularRemisionInput = z.input<typeof anularRemisionSchema>;

/** Cuerpo de `cafe.entregar_lotes(p jsonb)` a partir de lo validado. */
export function payloadEntrega(d: EntregarLotesDatos) {
  return {
    lote_ids: d.loteIds,
    fecha: d.fecha,
    recibe_nombre: d.recibeNombre,
    recibe_documento: d.recibeDocumento,
    observaciones: d.observaciones ?? null,
    forzar: d.forzar,
  };
}

