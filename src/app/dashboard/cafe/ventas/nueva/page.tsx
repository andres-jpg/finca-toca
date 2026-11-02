import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSesion } from "@/modules/core/auth/guards";
import { requireModuloPagina } from "@/modules/core/tenants/tenant.guards";
import { fechaHoyEnZona } from "@/modules/cafe/insumos/lib/insumos";
import { AvisoFacturasPendientes } from "@/modules/cafe/ventas/components/resumen-ventas";
import { LineaBadge } from "@/modules/cafe/components/linea-badge";
import { VentaForm } from "@/modules/cafe/ventas/components/venta-form";
import { getConsumidorFinalId, getProductosParaVenta, getResumenVentas } from "@/modules/cafe/ventas/queries/ventas.queries";

/**
 * Nueva venta o cortesía (HU-F1-07), pensada para tablet en la puerta. La registran owner, admin y operativo; Gerencia
 * (`viewer`) solo consulta el listado. La action y la RPC repiten la comprobación de módulo y rol, y el RLS es la
 * frontera real: esta redirección es solo para que nadie vea un formulario que no puede usar.
 */
export const metadata = { title: "Ventas marca propia" };

export default async function NuevaVentaPage() {
  await requireModuloPagina("cafe.ventas");
  const { rolTenant, tenant } = await requireSesion();
  if (rolTenant === "viewer") redirect("/dashboard/cafe/ventas");

  const [productos, consumidorFinalId, resumen] = await Promise.all([getProductosParaVenta(), getConsumidorFinalId(), getResumenVentas({ pagina: 1 })]);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-gray-800">
            Ventas marca propia <LineaBadge linea="marca_propia" />
          </h1>
          <Link href="/dashboard/cafe/ventas" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-sky-700 underline underline-offset-2 sm:min-h-0">
            Ventas anteriores
          </Link>
        </div>
        <p className="mt-0.5 text-sm text-gray-500">Registra café ya empacado que sale hacia un cliente. El inventario se descuenta solo.</p>
      </div>

      <AvisoFacturasPendientes n={resumen.nFacturaPendiente} />
      <VentaForm productos={productos} fechaHoy={fechaHoyEnZona(tenant.zonaHoraria)} consumidorFinalId={consumidorFinalId} />
    </div>
  );
}
