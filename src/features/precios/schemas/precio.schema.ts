import { z } from "zod";

export const precioSchema = z.object({
  valor: z
    .number({ message: "El precio debe ser un número" })
    .int("El precio debe ser un número entero")
    .positive("El precio debe ser mayor a 0"),
});

export type PrecioFormValues = z.infer<typeof precioSchema>;
