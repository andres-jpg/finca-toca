import { z } from "zod";

export const ingresoSchema = z.object({
  fecha: z.date().refine((val) => !isNaN(val.getTime()), { message: "La fecha es obligatoria" }),
  concepto_id: z.number().int().positive("Selecciona un concepto"),
  subconcepto_id: z.number().int().positive("Selecciona un subconcepto"),
  valor: z.number().positive("El valor debe ser mayor a 0"),
  observaciones: z.string().optional(),
});

export type IngresoFormValues = z.infer<typeof ingresoSchema>;
