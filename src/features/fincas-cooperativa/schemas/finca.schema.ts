import { z } from "zod";

export const fincaSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
  precio_litro: z.number({ message: "El precio debe ser un número" }).positive("El precio debe ser mayor a 0"),
  activa: z.boolean().default(true),
  ruta_id: z.number().nullable().optional(),
  metodo_pago: z.enum(["conductor", "punto_venta", "gerente"]).default("conductor"),
});

export type FincaFormValues = z.infer<typeof fincaSchema>;
