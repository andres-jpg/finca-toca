import { z } from "zod";

export const vacaSchema = z.object({
  vaca_id: z
    .string()
    .min(1, "El ID es obligatorio")
    .max(20, "Máximo 20 caracteres"),
  nombre: z
    .string()
    .min(1, "El nombre es obligatorio")
    .max(100, "Máximo 100 caracteres"),
  origen: z.enum(["finca", "externa"]),
  estado: z.enum(["produccion", "secado", "pre_jardin", "jardin", "transicion"]),
  fecha_compra: z.date().optional().nullable(),
  fecha_nacimiento: z.date().optional().nullable(),
  numero_registro: z.string().optional(),
  madre_id: z.string().uuid().optional().nullable(),
  padre_id: z.string().uuid().optional().nullable(),
});

export type VacaFormValues = z.infer<typeof vacaSchema>;
