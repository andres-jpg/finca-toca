import { z } from "zod";
import { normalizarIdentificacion, normalizarNombre } from "../lib/normalizar";
import { ROLES_TERCERO, TIPOS_IDENTIFICACION } from "../lib/roles";

// `message` en vez de `required_error`/`invalid_type_error`: Zod 4 ya no los acepta.
// Los esquemas normalizan (trim, espacios, identificación sin separadores) y son idempotentes: un valor
// ya normalizado vuelve a pasar igual, así que el Server Action puede re-validar lo que el formulario
// ya validó. Los mismos pasos los repite el trigger de la base.

/** Texto obligatorio, ya normalizado (trim + espacios colapsados). */
const textoObligatorio = (obligatorio: string, campo: string, max: number) =>
  z
    .string({ message: obligatorio })
    .transform(normalizarNombre)
    .pipe(
      z
        .string()
        .min(1, obligatorio)
        .max(max, `${campo}: máximo ${max} caracteres`),
    );

export const terceroSchema = z.object({
  tipo_identificacion: z.enum(TIPOS_IDENTIFICACION, { message: "Elige el tipo de identificación" }),
  identificacion: z
    .string({ message: "La identificación es obligatoria" })
    .transform(normalizarIdentificacion)
    .pipe(
      z
        .string()
        .min(1, "La identificación es obligatoria")
        .max(30, "La identificación: máximo 30 caracteres"),
    ),
  /** Solo NIT. Acepta el dígito como número o como texto del formulario; vacío = sin dígito. */
  digito_verificacion: z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((v) => (v === null || v === undefined || v === "" ? null : Number(v)))
    .pipe(
      z
        .number({ message: "El dígito de verificación debe ser un número" })
        .int("El dígito de verificación debe ser un número entero")
        .min(0, "El dígito de verificación va de 0 a 9")
        .max(9, "El dígito de verificación va de 0 a 9")
        .nullable(),
    ),
  nombre: z
    .string({ message: "El nombre es obligatorio" })
    .transform(normalizarNombre)
    .pipe(
      z
        .string()
        .min(2, "El nombre debe tener al menos 2 caracteres")
        .max(150, "El nombre: máximo 150 caracteres"),
    ),
  direccion: textoObligatorio("La dirección es obligatoria", "La dirección", 200),
  telefono: textoObligatorio("El teléfono es obligatorio", "El teléfono", 40),
  /** Opcional: en blanco = sin correo. */
  email: z
    .string()
    .nullish()
    .transform((v) => v?.trim().toLowerCase() || null)
    .pipe(z.email({ message: "El correo no es válido" }).max(200, "El correo: máximo 200 caracteres").nullable()),
  roles: z
    .array(z.enum(ROLES_TERCERO, { message: "Rol no válido" }), { message: "Elige al menos un rol" })
    .min(1, "Elige al menos un rol")
    .transform((roles) => [...new Set(roles)]),
  observaciones: z
    .string()
    .nullish()
    .transform((v) => v?.trim() || null)
    .pipe(z.string().max(500, "Las observaciones: máximo 500 caracteres").nullable()),
});

/** Lo que escribe el formulario (antes de normalizar). */
export type TerceroFormInput = z.input<typeof terceroSchema>;
/** Lo que se guarda (ya normalizado). */
export type TerceroInput = z.output<typeof terceroSchema>;

/** Criterios de la búsqueda de duplicados: nombre y/o identificación, sin más reglas. */
export const buscarSimilaresSchema = z.object({
  nombre: z.string().nullish().transform((v) => normalizarNombre(v)),
  identificacion: z.string().nullish().transform((v) => normalizarIdentificacion(v)),
});
export type BuscarSimilaresInput = z.input<typeof buscarSimilaresSchema>;
