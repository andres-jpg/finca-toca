import { notFound } from "next/navigation";
import { getAnimalById, getAnimalesDeAlta } from "@/features/animales/actions/animales.actions";
import { getEventosAnimal } from "@/features/eventos-animal/actions/eventos.actions";
import { getLotesPajillas } from "@/features/inventario/pajillas/actions/pajillas.actions";
import { getAlertasAnimal } from "@/features/alertas/actions/alertas.queries";
import { AnimalFicha } from "@/features/animales/components/animal-ficha";
import { formatEdad } from "@/lib/animales/estados";
import { canDelete, canWrite, checkRoutePermission } from "@/lib/auth/check-permissions";

export default async function AnimalFichaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [userRole, animal, animales, lotesPajillas] = await Promise.all([
    checkRoutePermission(["admin", "viewer"]),
    getAnimalById(id),
    getAnimalesDeAlta(),
    getLotesPajillas(),
  ]);

  if (!animal) notFound();

  // getEventosAnimal necesita el sexo, así que va en una segunda tanda; las alertas
  // se piden en paralelo (reutilizan la lectura cacheada que ya hizo el layout).
  const [eventos, { alertas, faltaServicio }] = await Promise.all([
    getEventosAnimal(id, animal.sexo === "hembra" ? "vaca" : "toro"),
    getAlertasAnimal(id),
  ]);
  const canEdit = canWrite(userRole);

  return (
    <AnimalFicha
      animal={animal}
      eventos={eventos}
      animales={animales}
      lotesPajillas={lotesPajillas}
      alertas={alertas}
      faltaServicio={faltaServicio}
      edad={formatEdad(animal.fecha_nacimiento)}
      canEdit={canEdit}
      canDelete={canDelete(userRole)}
    />
  );
}
