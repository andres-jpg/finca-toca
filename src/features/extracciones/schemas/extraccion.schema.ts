import { z } from "zod";

export const extraccionSchema = z
  .object({
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha es obligatoria"),
    /** Leche que se vende (genera el ingreso). */
    litros_cantina: z
      .number()
      .min(0, "No puede ser negativo")
      .max(1000, "Valor máximo: 1000L"),
    /** Leche que se queda para las crías (genera el gasto). */
    litros_cria: z
      .number()
      .min(0, "No puede ser negativo")
      .max(1000, "Valor máximo: 1000L"),
  })
  .superRefine((data, ctx) => {
    // Cada campo por separado puede ser 0 (un día se puede vender todo o dejarlo todo a las
    // crías), pero una extracción sin nada de leche no tiene sentido.
    if (data.litros_cantina + data.litros_cria <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["litros_cantina"],
        message: "Registra al menos un litro entre cantina y cría",
      });
    }
  });

export type ExtraccionFormValues = z.infer<typeof extraccionSchema>;
