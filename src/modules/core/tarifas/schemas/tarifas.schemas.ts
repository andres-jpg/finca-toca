import { z } from "zod";

// `message` en vez de `required_error`/`invalid_type_error`: Zod 4 ya no los acepta.

/** Tolerancia al comparar "ahora" con la fecha que manda el navegador (relojes distintos, latencia). */
export const MARGEN_VIGENCIA_MS = 5 * 60 * 1000;

/** Techo de `numeric(14,2)`: 12 enteros + 2 decimales. */
const VALOR_MAXIMO = 999_999_999_999.99;

export const crearTarifaSchema = z.object({
  concepto: z.string({ message: "Elige el concepto" }).min(1, "Elige el concepto"),
  valor: z
    .number({ message: "El valor debe ser un número" })
    .refine(Number.isFinite, { message: "El valor debe ser un número" })
    .min(0, "El valor no puede ser negativo")
    .max(VALOR_MAXIMO, "El valor es demasiado grande")
    // `numeric(14,2)`: más de dos decimales se redondearían en silencio.
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, { message: "Usa como máximo dos decimales" }),
  /** ISO 8601 con zona (lo arma el navegador). Sin él, rige desde el momento en que se guarda. */
  vigenteDesde: z.iso.datetime({ offset: true, message: "La fecha de vigencia no es válida" }).optional(),
  observaciones: z
    .string()
    .trim()
    .max(300, "Máximo 300 caracteres")
    .nullish()
    .transform((v) => (v ? v : null)),
});

export type CrearTarifaInput = z.input<typeof crearTarifaSchema>;
export type CrearTarifaValues = z.output<typeof crearTarifaSchema>;
