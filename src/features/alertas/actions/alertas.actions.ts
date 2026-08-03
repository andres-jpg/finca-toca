"use server";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/check-permissions";
import { createEventoAnimal } from "@/features/eventos-animal/actions/eventos.actions";

/**
 * Cierra una alerta resoluble registrando el evento correspondiente.
 * Solo `secado` y `topizado` lo son: implican trabajo físico en la finca, así que
 * el usuario confirma que ya se hizo. Parto y celo se cierran registrando el evento
 * real desde la ficha, que lleva su propia fecha y observaciones.
 */
export async function resolverAlerta(animalId: string, tipo: "secado" | "topizado") {
  await requireRole(["admin", "user"]);
  const supabase = await createClient();

  const { data: animal, error } = await supabase
    .from("animales")
    .select("sexo")
    .eq("id", animalId)
    .single();

  if (error || !animal) throw new Error("No se encontró el animal");

  // createEventoAnimal aplica la transición de estado y revalida las rutas afectadas.
  await createEventoAnimal({
    animal_id: animalId,
    animal_tipo: animal.sexo === "hembra" ? "vaca" : "toro",
    tipo_evento: tipo,
    fecha: new Date(),
    descripcion: "Registrado desde el panel de alertas",
  });
}
