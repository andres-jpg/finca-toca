import { z } from "zod";

export const toroSchema = z.object({
  toro_id: z
    .number()
    .int("El ID debe ser un número entero")
    .positive("El ID debe ser mayor a 0")
    .max(9999, "Valor máximo: 9999"),
  nombre: z
    .string()
    .min(1, "El nombre es obligatorio")
    .max(100, "Máximo 100 caracteres"),
  origen: z.enum(["finca", "externa"]),
  fecha_compra: z.date().optional().nullable(),
  numero_registro: z.string().optional(),
  madre_id: z.string().uuid().optional().nullable(),
});

export type ToroFormValues = z.infer<typeof toroSchema>;
