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
    requiere_revacunacion: z.boolean().optional().nullable(),
    periodo_revacunacion: z
      .enum(["1_mes", "6_meses", "1_anio", "personalizada"])
      .optional()
      .nullable(),
    fecha_revacunacion: z.date().optional().nullable(),
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

    // Sin plazo (o sin fecha, si se eligió fijarla a mano) no hay de dónde sacar la alerta
    // de revacunación, así que el CHECK de la tabla rechazaría la fila igualmente.
    if (data.tipo_evento === "vacunacion" && data.requiere_revacunacion) {
      if (!data.periodo_revacunacion) {
        ctx.addIssue({
          code: "custom",
          path: ["periodo_revacunacion"],
          message: "Indica en cuánto tiempo hay que revacunar",
        });
      }

      if (data.periodo_revacunacion === "personalizada") {
        if (!data.fecha_revacunacion || isNaN(data.fecha_revacunacion.getTime())) {
          ctx.addIssue({
            code: "custom",
            path: ["fecha_revacunacion"],
            message: "Registra la fecha de la próxima vacunación",
          });
        } else if (data.fecha && data.fecha_revacunacion <= data.fecha) {
          ctx.addIssue({
            code: "custom",
            path: ["fecha_revacunacion"],
            message: "La próxima vacunación debe ser posterior a la fecha del evento",
          });
        }
      }
    }
  });

export type EventoFormValues = z.infer<typeof eventoSchema>;
