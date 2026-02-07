import { z } from "zod";

export const vacaSchema = z.object({
  vaca_id: z
    .number()
    .int("El ID debe ser un número entero")
    .positive("El ID debe ser mayor a 0")
    .max(9999, "Valor máximo: 9999"),
  nombre: z
    .string()
    .min(1, "El nombre es obligatorio")
    .max(100, "Máximo 100 caracteres"),
});

export type VacaFormValues = z.infer<typeof vacaSchema>;
