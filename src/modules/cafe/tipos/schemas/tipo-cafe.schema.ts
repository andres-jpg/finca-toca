import { z } from "zod";
import { normalizarNombre } from "@/modules/core/terceros/lib/normalizar";

// `message` en vez de `required_error`/`invalid_type_error`: Zod 4 ya no los acepta.
// El esquema normaliza (trim + espacios colapsados, igual que el trigger de la base) y es idempotente: el
// Server Action puede re-validar lo que el formulario ya validó. El catálogo es solo nombre: activar o
// desactivar un tipo es una acción aparte, no un campo del formulario.

export const tipoCafeSchema = z.object({
  nombre: z
    .string({ message: "El nombre es obligatorio" })
    .transform(normalizarNombre)
    .pipe(
      z
        .string()
        .min(2, "El nombre debe tener al menos 2 caracteres")
        .max(60, "El nombre: máximo 60 caracteres"),
    ),
});

/** Lo que escribe el formulario (antes de normalizar). */
export type TipoCafeFormInput = z.input<typeof tipoCafeSchema>;
/** Lo que se guarda (ya normalizado). */
export type TipoCafeInput = z.output<typeof tipoCafeSchema>;
