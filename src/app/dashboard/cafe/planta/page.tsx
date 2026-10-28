import { redirect } from "next/navigation";
import { requireSesion } from "@/modules/core/auth/guards";
import { requireModuloPagina } from "@/modules/core/tenants/tenant.guards";
import { ColaPlanta } from "@/modules/cafe/procesos/components/cola-planta";
import { getColaPlanta } from "@/modules/cafe/procesos/queries/planta.queries";

/**
 * Cola de trabajo de la planta (HU-F1-04): los lotes con pasos pendientes, servicios (clientes) y marca propia
 * por separado. La usan owner/admin/operativo; Gerencia (`viewer`) consulta los lotes y vuelve a su lista. La
 * pantalla del lote, la acción y la RPC repiten módulo y rol: el RLS es la frontera real y esconder la
 * pantalla es cosmético.
 */
export default async function PlantaPage() {
  await requireModuloPagina("cafe.procesos");
  const { rolTenant } = await requireSesion();
  if (rolTenant === "viewer") redirect("/dashboard/cafe/lotes");

  const cola = await getColaPlanta();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-800">Planta</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Lotes con trabajo pendiente, del más antiguo al más reciente. Toca uno para registrar trilla, tostión, molienda o empaque.
        </p>
      </div>

      <ColaPlanta tarjetas={cola} />
    </div>
  );
}
