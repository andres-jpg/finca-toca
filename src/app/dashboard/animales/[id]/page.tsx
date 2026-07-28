import { notFound } from "next/navigation";
import { getAnimalById, getAnimalesDeAlta } from "@/features/animales/actions/animales.actions";
import { getEventosAnimal } from "@/features/eventos-animal/actions/eventos.actions";
import { getPajillasPorToro } from "@/features/inventario/pajillas/actions/pajillas.actions";
import { AnimalFicha } from "@/features/animales/components/animal-ficha";
import { canWrite, checkRoutePermission } from "@/lib/auth/check-permissions";

export default async function AnimalFichaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [userRole, animal, animales, pajillasPorToro] = await Promise.all([
    checkRoutePermission(["admin", "viewer"]),
    getAnimalById(id),
    getAnimalesDeAlta(),
    getPajillasPorToro(),
  ]);

  if (!animal) notFound();

  const eventos = await getEventosAnimal(id, animal.sexo === "hembra" ? "vaca" : "toro");
  const canEdit = canWrite(userRole);

  return (
    <AnimalFicha
      animal={animal}
      eventos={eventos}
      animales={animales}
      pajillasPorToro={pajillasPorToro}
      canEdit={canEdit}
    />
  );
}
