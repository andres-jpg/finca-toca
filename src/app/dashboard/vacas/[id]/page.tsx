import { notFound } from "next/navigation";
import { getVacaById } from "@/features/vacas/actions/vacas.actions";
import { getVacasDeAlta } from "@/features/vacas/actions/vacas.actions";
import { getTorosDeAlta } from "@/features/toros/actions/toros.actions";
import { getEventosAnimal } from "@/features/eventos-animal/actions/eventos.actions";
import { VacaFicha } from "@/features/vacas/components/vaca-ficha";
import { canWrite, checkRoutePermission } from "@/lib/auth/check-permissions";

export default async function VacaFichaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [userRole, vaca, eventos, vacas, toros] = await Promise.all([
    checkRoutePermission(["admin", "viewer"]),
    getVacaById(id),
    getEventosAnimal(id, "vaca"),
    getVacasDeAlta(),
    getTorosDeAlta(),
  ]);

  if (!vaca) notFound();

  const canEdit = canWrite(userRole);

  return (
    <VacaFicha
      vaca={vaca}
      eventos={eventos}
      vacas={vacas}
      toros={toros}
      canEdit={canEdit}
    />
  );
}
