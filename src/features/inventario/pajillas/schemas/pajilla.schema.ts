import { z } from "zod";

export const pajillaSchema = z.object({
  toro_nombre: z.string().min(1, "El nombre del toro es requerido"),
  toro_ref_id: z.string().min(1, "El ID del toro es requerido"),
  proveedor: z.string().optional(),
  fecha_compra: z
    .date()
    .refine((val) => !isNaN(val.getTime()), { message: "La fecha de compra es obligatoria" }),
  cantidad: z
    .number({ message: "La cantidad es requerida" })
    .int("La cantidad debe ser un número entero")
    .positive("La cantidad debe ser mayor a 0"),
  observaciones: z.string().optional(),
});

export const usarPajillasSchema = z.object({
  cantidad: z
    .number({ message: "La cantidad es requerida" })
    .int("La cantidad debe ser un número entero")
    .positive("La cantidad debe ser mayor a 0"),
});

export type PajillaFormValues = z.infer<typeof pajillaSchema>;
export type UsarPajillasFormValues = z.infer<typeof usarPajillasSchema>;
