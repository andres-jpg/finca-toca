import { z } from "zod";

export const activarPagoItemSchema = z.object({
  finca_id: z.number(),
  itinerario_id: z.number().nullable(),
  litros: z.number().min(0),
  responsable: z.enum(["conductor", "punto_venta", "gerente"]),
});

export const activarPagoSchema = z.object({
  items: z.array(activarPagoItemSchema).min(1, "Selecciona al menos una finca"),
  fecha_inicio: z.string().min(1),
  fecha_fin: z.string().min(1),
});

export type ActivarPagoItem = z.infer<typeof activarPagoItemSchema>;
export type ActivarPagoValues = z.infer<typeof activarPagoSchema>;

export interface FincaConLitros {
  finca_id: number;
  finca_nombre: string;
  itinerario_id: number | null;
  itinerario_nombre: string | null;
  conductor_email: string | null;
  litros: number;
  metodo_pago: "conductor" | "punto_venta" | "gerente";
}

export interface ItinerarioGroup {
  itinerario_id: number | null;
  itinerario_nombre: string | null;
  conductor_email: string | null;
  fincas: FincaConLitros[];
}
