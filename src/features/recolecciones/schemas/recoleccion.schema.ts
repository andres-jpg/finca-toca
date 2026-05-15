import { z } from "zod";

export const recoleccionSchema = z.object({
  finca_id: z.number({ message: "Selecciona una finca" }).int().positive("Selecciona una finca"),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha es obligatoria"),
  litros: z
    .number({ message: "Ingresa los litros" })
    .positive("Los litros deben ser mayores a 0")
    .max(10000, "Valor máximo 10.000 litros"),
});

export type RecoleccionFormValues = z.infer<typeof recoleccionSchema>;
