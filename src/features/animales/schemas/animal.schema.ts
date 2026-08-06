import { z } from "zod";
import { ESTADOS_PRODUCTIVOS_POR_SEXO, ESTADOS_REPRODUCTIVOS } from "@/lib/animales/estados";

export const animalSchema = z
  .object({
    identificador: z
      .string()
      .min(1, "El identificador es obligatorio")
      .max(20, "Máximo 20 caracteres"),
    nombre: z
      .string()
      .min(1, "El nombre es obligatorio")
      .max(100, "Máximo 100 caracteres"),
    sexo: z.enum(["hembra", "macho"], { message: "Selecciona el sexo del animal" }),
    raza: z.enum(["holstein", "jersey", "jerhol", "normando", "ayrshire", "cruce"], {
      message: "Selecciona la raza del animal",
    }),
    sangre: z.string().optional().nullable(),
    origen: z.enum(["finca", "externa"]),
    estado_productivo: z.string().optional().nullable(),
    estado_reproductivo: z.string().optional().nullable(),
    fecha_compra: z.date().optional().nullable(),
    fecha_nacimiento: z.date().optional().nullable(),
    numero_registro: z.string().optional(),
    madre_id: z.string().uuid().optional().nullable(),
    padre_id: z.string().uuid().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const productivosValidos: readonly string[] = ESTADOS_PRODUCTIVOS_POR_SEXO[data.sexo];

    if (data.sexo === "hembra" && !data.estado_productivo) {
      ctx.addIssue({
        code: "custom",
        path: ["estado_productivo"],
        message: "El estado productivo es obligatorio",
      });
    } else if (
      data.estado_productivo &&
      !productivosValidos.includes(data.estado_productivo)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["estado_productivo"],
        message: "Estado productivo no válido para el sexo seleccionado",
      });
    }

    // El ciclo reproductivo solo aplica a hembras; en machos el campo ni se muestra.
    if (data.estado_reproductivo) {
      if (data.sexo === "macho") {
        ctx.addIssue({
          code: "custom",
          path: ["estado_reproductivo"],
          message: "El estado reproductivo solo aplica a hembras",
        });
      } else if (!(ESTADOS_REPRODUCTIVOS as string[]).includes(data.estado_reproductivo)) {
        ctx.addIssue({
          code: "custom",
          path: ["estado_reproductivo"],
          message: "Estado reproductivo no válido",
        });
      }
    }
  });

export type AnimalFormValues = z.infer<typeof animalSchema>;
