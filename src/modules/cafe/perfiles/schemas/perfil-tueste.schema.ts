import { z } from "zod";
import { NIVELES_TUESTE } from "../../procesos/schemas/proceso.schema";

// `message` en vez de `required_error`/`invalid_type_error`: Zod 4 ya no los acepta. Límites iguales a los
// CHECK de `cafe.perfil_tueste_tipo` (y de `cafe.lotes`): 0 < °C ≤ 400, 0 < min ≤ 120.

/** Un decimal como máximo, como `numeric(5,1)`. */
const unDecimal = (n: number) => Math.abs(n * 10 - Math.round(n * 10)) < 1e-9;

export const perfilTuesteSchema = z.object({
  /** `null` = perfil predeterminado de maquila. */
  tipoCafeId: z.uuid({ message: "El tipo de café no es válido" }).nullable(),
  nivel: z.enum(NIVELES_TUESTE, { message: "Elige el nivel de tueste" }),
  tempC: z
    .number({ message: "Indica la temperatura en °C" })
    .gt(0, "La temperatura debe ser mayor que cero")
    .max(400, "La temperatura máxima es 400 °C")
    .refine(unDecimal, "Máximo un decimal"),
  tiempoMin: z
    .number({ message: "Indica el tiempo en minutos" })
    .gt(0, "El tiempo debe ser mayor que cero")
    .max(120, "El tiempo máximo es 120 min")
    .refine(unDecimal, "Máximo un decimal"),
  /** `YYYY-MM-DD` en la zona del cliente. */
  vigenteDesde: z
    .string({ message: "Indica desde cuándo rige" })
    .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida")
    .refine((f) => {
      const d = new Date(`${f}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f && f >= "2000-01-01" && f <= "2100-12-31";
    }, "La fecha no es válida"),
});

export type PerfilTuesteFormInput = z.input<typeof perfilTuesteSchema>;
export type PerfilTuesteInput = z.output<typeof perfilTuesteSchema>;
