import { getAnimales } from "@/features/animales/actions/animales.actions";
import { getPajillasPorToro } from "@/features/inventario/pajillas/actions/pajillas.actions";
import { AnimalesTable } from "@/features/animales/components/animales-table";
import { ESTADOS_PRODUCTIVOS, ESTADOS_REPRODUCTIVOS } from "@/lib/animales/estados";
import { canWrite, checkRoutePermission } from "@/lib/auth/check-permissions";

export default async function AnimalesPage({
  searchParams,
}: {
  searchParams: Promise<{ productivo?: string; reproductivo?: string }>;
}) {
  const [params, userRole, animales, pajillasPorToro] = await Promise.all([
    searchParams,
    checkRoutePermission(["admin", "viewer"]),
    getAnimales(),
    getPajillasPorToro(),
  ]);
  const canEdit = canWrite(userRole);

  // Los contadores del dashboard enlazan aquí; se validan para no aceptar valores arbitrarios.
  const filtroProductivoInicial =
    params.productivo && (ESTADOS_PRODUCTIVOS as string[]).includes(params.productivo)
      ? params.productivo
      : undefined;
  const filtroReproductivoInicial =
    params.reproductivo && (ESTADOS_REPRODUCTIVOS as string[]).includes(params.reproductivo)
      ? params.reproductivo
      : undefined;

  return (
    <AnimalesTable
      animales={animales}
      pajillasPorToro={pajillasPorToro}
      canEdit={canEdit}
      filtroProductivoInicial={filtroProductivoInicial}
      filtroReproductivoInicial={filtroReproductivoInicial}
    />
  );
}
