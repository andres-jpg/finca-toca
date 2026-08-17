import { z } from "zod";

/** `message` cubre el caso "no se eligió fecha"; el refine, el de una fecha inválida. */
const fechaObligatoria = (mensaje: string) =>
  z.date({ message: mensaje }).refine((val) => !isNaN(val.getTime()), { message: mensaje });

export const arriendoSchema = z
  .object({
    arrendatario: z.string().min(1, "El arrendatario es requerido"),
    finca_nombre: z.string().min(1, "El nombre de la finca es requerido"),
    fecha_inicio: fechaObligatoria("La fecha de inicio es obligatoria"),
    fecha_fin: fechaObligatoria("La fecha de fin es obligatoria"),
    canon: z
      .number({ message: "El valor del canon es requerido" })
      .positive("El canon debe ser mayor a 0"),
    observaciones: z.string().optional(),
  })
  // Mismo CHECK que la tabla (`arriendos_periodo_valido`): mejor avisar en el formulario
  // que devolver el error crudo de Postgres.
  .refine((v) => v.fecha_fin >= v.fecha_inicio, {
    message: "La fecha de fin no puede ser anterior a la de inicio",
    path: ["fecha_fin"],
  });

export const abonoSchema = z.object({
  fecha: fechaObligatoria("La fecha del abono es obligatoria"),
  valor: z
    .number({ message: "El valor del abono es requerido" })
    .positive("El abono debe ser mayor a 0"),
  observaciones: z.string().optional(),
});

export type ArriendoFormValues = z.infer<typeof arriendoSchema>;
export type AbonoFormValues = z.infer<typeof abonoSchema>;
