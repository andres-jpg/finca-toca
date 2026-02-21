import { z } from "zod";

export const gastoSchema = z.object({
  fecha: z.date().refine((val) => !isNaN(val.getTime()), { message: "La fecha es obligatoria" }),
  concepto_id: z.number().int().positive("Selecciona un concepto"),
  subconcepto_id: z.number().int().positive("Selecciona un subconcepto").optional().nullable(),
  valor: z.number().positive("El valor debe ser mayor a 0"),
  numero_factura: z.string().optional(),
  pagado: z.boolean().default(false),
  observaciones: z.string().optional(),
});

export type GastoFormValues = z.infer<typeof gastoSchema>;
