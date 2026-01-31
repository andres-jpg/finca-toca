import { z } from "zod";

export const milkingSchema = z.object({
  liters: z.number().positive("Los litros deben ser mayores a 0"),
  date: z.date().refine((val) => !isNaN(val.getTime()), { message: "La fecha es obligatoria" }),
  observations: z.string().optional(),
});

export type MilkingFormValues = z.infer<typeof milkingSchema>;
