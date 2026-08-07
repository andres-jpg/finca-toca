import { getAnimales } from "@/features/animales/actions/animales.actions";
import { getLotesPajillas } from "@/features/inventario/pajillas/actions/pajillas.actions";
import { AnimalesTable } from "@/features/animales/components/animales-table";
import { ESTADOS_PRODUCTIVOS, ESTADOS_REPRODUCTIVOS } from "@/lib/animales/estados";
import { canWrite, checkRoutePermission } from "@/lib/auth/check-permissions";
import { getTenantActual } from "@/lib/auth/get-tenant";

export default async function AnimalesPage({
  searchParams,
}: {
  searchParams: Promise<{ productivo?: string; reproductivo?: string }>;
}) {
  const [params, userRole, animales, lotesPajillas, tenant] = await Promise.all([
    searchParams,
    checkRoutePermission(["admin", "viewer"]),
    getAnimales(),
    getLotesPajillas(),
    getTenantActual(),
  ]);
  const canEdit = canWrite(userRole);
  const esVelero = tenant?.slug === "el-velero";

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
      lotesPajillas={lotesPajillas}
      canEdit={canEdit}
      esVelero={esVelero}
      filtroProductivoInicial={filtroProductivoInicial}
      filtroReproductivoInicial={filtroReproductivoInicial}
    />
  );
}
