import { z } from "zod";

export const rutaSchema = z.object({
  nombre: z.string().min(1, "El nombre de la ruta es obligatorio"),
  finca_ids: z
    .array(z.number())
    .min(1, "Selecciona al menos una finca"),
});

export type RutaFormValues = z.infer<typeof rutaSchema>;
