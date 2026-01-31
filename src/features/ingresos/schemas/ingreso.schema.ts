import { z } from "zod";
import { INGRESO_OPTIONS } from "@/types";

export const ingresoSchema = z.object({
  fecha: z.date().refine((val) => !isNaN(val.getTime()), { message: "La fecha es obligatoria" }),
  concepto: z.enum(INGRESO_OPTIONS),
  valor: z.number().positive("El valor debe ser mayor a 0"),
  observaciones: z.string().optional(),
});

export type IngresoFormValues = z.infer<typeof ingresoSchema>;
