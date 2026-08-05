import { z } from "zod";

export const eventoSchema = z
  .object({
    animal_id: z.string().uuid(),
    animal_tipo: z.enum(["vaca", "toro"]),
    tipo_evento: z.enum(
      [
        "vacunacion",
        "vitaminacion",
        "medicamento",
        "enfermedad",
        "celo",
        "inseminacion",
        "monta",
        "palpacion",
        "confirmacion_prenez",
        "parto",
        "aborto",
        "secado",
        "topizado",
        "observacion",
      ],
      { message: "Selecciona el tipo de evento" }
    ),
    fecha: z.date({ message: "La fecha es obligatoria" }),
    descripcion: z.string().optional(),
    responsable: z.string().optional(),
    resultado: z.enum(["cargada", "rechequeo", "vacia"]).optional().nullable(),
    pajilla_id: z.string().uuid().optional().nullable(),
    toro_id: z.string().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    // El resultado es lo que mueve el estado reproductivo: sin él la vaca se quedaría
    // colgada en "por confirmar" después de la palpación.
    const esConfirmacion =
      data.tipo_evento === "palpacion" || data.tipo_evento === "confirmacion_prenez";

    if (esConfirmacion && !data.resultado) {
      ctx.addIssue({
        code: "custom",
        path: ["resultado"],
        message: "Indica el resultado de la revisión",
      });
    }
  });

export type EventoFormValues = z.infer<typeof eventoSchema>;
