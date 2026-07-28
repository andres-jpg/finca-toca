import { z } from "zod";

const ESTADOS_HEMBRA = ["produccion", "secado", "pre_jardin", "jardin", "transicion"] as const;
const ESTADOS_MACHO = ["jardin", "reproductor"] as const;

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
    raza: z.enum(["holstein", "jersey", "jerholm", "normando"], {
      message: "Selecciona la raza del animal",
    }),
    origen: z.enum(["finca", "externa"]),
    estado: z.string().optional().nullable(),
    fecha_compra: z.date().optional().nullable(),
    fecha_nacimiento: z.date().optional().nullable(),
    numero_registro: z.string().optional(),
    madre_id: z.string().uuid().optional().nullable(),
    padre_id: z.string().uuid().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const estadosValidos: readonly string[] =
      data.sexo === "hembra" ? ESTADOS_HEMBRA : ESTADOS_MACHO;

    if (data.sexo === "hembra" && !data.estado) {
      ctx.addIssue({
        code: "custom",
        path: ["estado"],
        message: "El estado es obligatorio",
      });
      return;
    }

    if (data.estado && !estadosValidos.includes(data.estado)) {
      ctx.addIssue({
        code: "custom",
        path: ["estado"],
        message: "Estado no válido para el sexo seleccionado",
      });
    }
  });

export type AnimalFormValues = z.infer<typeof animalSchema>;
