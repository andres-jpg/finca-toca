import { z } from "zod";
import { GASTO_OPTIONS } from "@/types";

export const gastoSchema = z.object({
  fecha: z.date().refine((val) => !isNaN(val.getTime()), { message: "La fecha es obligatoria" }),
  concepto: z.enum(GASTO_OPTIONS),
  valor: z.number().positive("El valor debe ser mayor a 0"),
  observaciones: z.string().optional(),
});

export type GastoFormValues = z.infer<typeof gastoSchema>;
