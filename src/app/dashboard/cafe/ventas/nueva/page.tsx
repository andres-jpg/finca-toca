import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireSesion } from "@/modules/core/auth/guards";
import { requireModuloPagina } from "@/modules/core/tenants/tenant.guards";
import { fechaHoyEnZona } from "@/modules/cafe/insumos/lib/insumos";
import { VentaForm } from "@/modules/cafe/ventas/components/venta-form";
import { getConsumidorFinalId, getProductosParaVenta } from "@/modules/cafe/ventas/queries/ventas.queries";

/**
 * Nueva venta o cortesía (HU-F1-07), pensada para tablet en la puerta. La registran owner, admin y operativo; Gerencia
 * (`viewer`) solo consulta el listado. La action y la RPC repiten la comprobación de módulo y rol, y el RLS es la
 * frontera real: esta redirección es solo para que nadie vea un formulario que no puede usar.
 */
export default async function NuevaVentaPage() {
  await requireModuloPagina("cafe.ventas");
  const { rolTenant, tenant } = await requireSesion();
  if (rolTenant === "viewer") redirect("/dashboard/cafe/ventas");

  const [productos, consumidorFinalId] = await Promise.all([getProductosParaVenta(), getConsumidorFinalId()]);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <Link href="/dashboard/cafe/ventas" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 sm:min-h-0">
          <ArrowLeft className="h-4 w-4" />
          Ventas
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-800">Nueva venta</h1>
        <p className="mt-0.5 text-sm text-gray-500">Registra café ya empacado que sale hacia un cliente. El inventario se descuenta solo.</p>
      </div>

      <VentaForm productos={productos} fechaHoy={fechaHoyEnZona(tenant.zonaHoraria)} consumidorFinalId={consumidorFinalId} />
    </div>
  );
}
