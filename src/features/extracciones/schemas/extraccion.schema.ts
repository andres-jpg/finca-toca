import { z } from "zod";

export const extraccionSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha es obligatoria"),
  litros: z
    .number()
    .positive("Los litros deben ser mayores a 0")
    .max(1000, "Valor máximo: 1000L"),
});

export type ExtraccionFormValues = z.infer<typeof extraccionSchema>;
