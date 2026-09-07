import { z } from "zod";

/** `message` cubre el caso "no se eligió fecha"; el refine, el de una fecha inválida. */
const fechaObligatoria = (mensaje: string) =>
  z.date({ message: mensaje }).refine((val) => !isNaN(val.getTime()), { message: mensaje });

export const medicionLecheSchema = z.object({
  fecha: fechaObligatoria("La fecha de la medición es obligatoria"),
  litros: z
    .number({ message: "Los litros son requeridos" })
    .positive("Los litros deben ser mayores a 0"),
});

export type MedicionLecheFormValues = z.infer<typeof medicionLecheSchema>;
