import { notFound } from "next/navigation";
import { getToroById, getTorosDeAlta } from "@/features/toros/actions/toros.actions";
import { getVacasDeAlta } from "@/features/vacas/actions/vacas.actions";
import { getEventosAnimal } from "@/features/eventos-animal/actions/eventos.actions";
import { ToroFicha } from "@/features/toros/components/toro-ficha";
import { canWrite, checkRoutePermission } from "@/lib/auth/check-permissions";

export default async function ToroFichaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [userRole, toro, eventos, vacas, toros] = await Promise.all([
    checkRoutePermission(["admin", "viewer"]),
    getToroById(id),
    getEventosAnimal(id, "toro"),
    getVacasDeAlta(),
    getTorosDeAlta(),
  ]);

  if (!toro) notFound();

  const canEdit = canWrite(userRole);

  return (
    <ToroFicha
      toro={toro}
      eventos={eventos}
      vacas={vacas}
      toros={toros}
      canEdit={canEdit}
    />
  );
}
