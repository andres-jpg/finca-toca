import { notFound } from "next/navigation";
import { getVacaById, getVacasDeAlta } from "@/features/vacas/actions/vacas.actions";
import { getTorosDeAlta } from "@/features/toros/actions/toros.actions";
import { getEventosAnimal } from "@/features/eventos-animal/actions/eventos.actions";
import { getPajillasPorToro } from "@/features/inventario/pajillas/actions/pajillas.actions";
import { VacaFicha } from "@/features/vacas/components/vaca-ficha";
import { canWrite, checkRoutePermission } from "@/lib/auth/check-permissions";

export default async function VacaFichaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [userRole, vaca, eventos, vacas, toros, pajillasPorToro] = await Promise.all([
    checkRoutePermission(["admin", "viewer"]),
    getVacaById(id),
    getEventosAnimal(id, "vaca"),
    getVacasDeAlta(),
    getTorosDeAlta(),
    getPajillasPorToro(),
  ]);

  if (!vaca) notFound();

  const canEdit = canWrite(userRole);

  return (
    <VacaFicha
      vaca={vaca}
      eventos={eventos}
      vacas={vacas}
      toros={toros}
      pajillasPorToro={pajillasPorToro}
      canEdit={canEdit}
    />
  );
}
