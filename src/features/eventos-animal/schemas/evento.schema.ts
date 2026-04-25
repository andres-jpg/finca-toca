import { z } from "zod";

export const eventoSchema = z.object({
  animal_id: z.string().uuid(),
  animal_tipo: z.enum(["vaca", "toro"]),
  tipo_evento: z.enum([
    "vacunacion",
    "vitaminacion",
    "medicamento",
    "enfermedad",
    "celo",
    "inseminacion",
    "palpacion",
    "confirmacion_prenez",
    "parto",
    "observacion",
  ]),
  fecha: z.date({ message: "La fecha es obligatoria" }),
  descripcion: z.string().optional(),
  responsable: z.string().optional(),
});

export type EventoFormValues = z.infer<typeof eventoSchema>;
