import { getAnimales } from "@/features/animales/actions/animales.actions";
import { getPajillasPorToro } from "@/features/inventario/pajillas/actions/pajillas.actions";
import { AnimalesTable } from "@/features/animales/components/animales-table";
import { canWrite, checkRoutePermission } from "@/lib/auth/check-permissions";

export default async function AnimalesPage() {
  const [userRole, animales, pajillasPorToro] = await Promise.all([
    checkRoutePermission(["admin", "viewer"]),
    getAnimales(),
    getPajillasPorToro(),
  ]);
  const canEdit = canWrite(userRole);

  return <AnimalesTable animales={animales} pajillasPorToro={pajillasPorToro} canEdit={canEdit} />;
}
