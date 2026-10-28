import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireSesion } from "@/modules/core/auth/guards";
import { requireModuloPagina } from "@/modules/core/tenants/tenant.guards";
import { fechaHoyEnZona } from "@/modules/cafe/insumos/lib/insumos";
import { RecepcionForm } from "@/modules/cafe/recepciones/components/recepcion-form";
import { getConfigRecepcion } from "@/modules/cafe/recepciones/queries/recepcion.queries";

/**
 * Recepción de café de un cliente (trilla y/o maquila). La registran owner/admin/operativo; Gerencia (`viewer`)
 * solo consulta y vuelve a la lista de lotes. La acción y la RPC repiten módulo y rol: el RLS es la frontera
 * real y esconder la pantalla es cosmético.
 */
export default async function NuevaRecepcionPage() {
  await requireModuloPagina("cafe.recepcion");
  const { rolTenant, tenant } = await requireSesion();
  if (rolTenant === "viewer") redirect("/dashboard/cafe/lotes");

  const config = await getConfigRecepcion();

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/dashboard/cafe/lotes"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Lotes
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-gray-800">Nueva recepción</h1>
        <p className="text-sm text-gray-500">Café de un cliente para trilla y/o maquila. Se asigna un solo lote por recepción.</p>
      </div>

      <RecepcionForm
        config={config}
        fechaHoy={fechaHoyEnZona(tenant.zonaHoraria)}
        puedeAdministrar={rolTenant === "owner" || rolTenant === "admin"}
      />
    </div>
  );
}
