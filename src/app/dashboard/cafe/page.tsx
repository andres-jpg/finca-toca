import { Suspense } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireSesion } from "@/modules/core/auth/guards";
import { tieneModulo } from "@/modules/core/tenants/modulos";
import { requireModuloPagina } from "@/modules/core/tenants/tenant.guards";
import { fechaHoyEnZona } from "@/modules/cafe/insumos/lib/insumos";
import { SeccionCostoLibra } from "@/modules/cafe/costo/components/seccion-costo-libra";
import { EsqueletoGrafico, EsqueletoResumen, EsqueletoTarjetas } from "@/modules/cafe/panel/components/esqueletos";
import { PanelFiltros } from "@/modules/cafe/panel/components/panel-filtros";
import { SeccionDecidir } from "@/modules/cafe/panel/components/seccion-decidir";
import { SeccionIngresos } from "@/modules/cafe/panel/components/seccion-ingresos";
import { SeccionKpis } from "@/modules/cafe/panel/components/seccion-kpis";
import { SeccionMix } from "@/modules/cafe/panel/components/seccion-mix";
import { SeccionProduccion } from "@/modules/cafe/panel/components/seccion-produccion";
import { SeccionProveedores } from "@/modules/cafe/panel/components/seccion-proveedores";
import { urlExportacion } from "@/modules/cafe/panel/lib/kpis";
import { describirPeriodo, nombreMes, parsearParamsPanel, periodoAnterior, resolverPeriodo, sumarDias } from "@/modules/cafe/panel/lib/periodo";

/**
 * «Cómo va el negocio» (B-14): el panel de gerencia orientado al dueño. Tres KPIs (ingresos, libras vendidas, margen bruto de
 * marca propia), ingresos de los últimos 14 días, «Para decidir hoy», libras por presentación, costo de producir una libra,
 * producción y proveedores. Periodo Hoy / Semana / Mes en la URL. Sin inventario ni cuentas por cobrar (Cofradía no maneja
 * estado de pago). Solo lectura; lo ven todos los miembros con el módulo `cafe.dashboard` y la base lo exige en cada función.
 * Cada sección es un `Suspense` aparte con su `key`, para que cambiar de periodo vuelva a mostrar el marcador.
 */
export const metadata = { title: "Panel" };

export default async function PanelCafePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireModuloPagina("cafe.dashboard");
  const { tenant } = await requireSesion();

  const { periodo } = parsearParamsPanel(await searchParams);
  const hoy = fechaHoyEnZona(tenant.zonaHoraria);
  const { desde, hasta } = resolverPeriodo(periodo, hoy);
  // Las series diarias cubren el tramo anterior (para la variación) y los 14 días del gráfico.
  const anterior = periodoAnterior(periodo, hoy);
  const desdeSerie = [anterior.desde, sumarDias(hoy, -13)].sort()[0];
  const clave = `${periodo}|${desde}|${hasta}`;
  const puedeExportar = tieneModulo(tenant.modulos, "cafe.recepcion");
  const etiquetaPeriodo = periodo === "mes" ? "en el mes" : periodo === "semana" ? "en la semana" : "hoy";

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-800">Cómo va el negocio</h1>
          <p className="mt-0.5 text-sm capitalize text-gray-500">
            {nombreMes(hoy)} de {hoy.slice(0, 4)}
            <span className="normal-case"> · {describirPeriodo(desde, hasta)}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PanelFiltros periodo={periodo} />
          {puedeExportar && (
            <Button asChild variant="outline" className="h-11 shrink-0 sm:h-9">
              <a href={urlExportacion(desde, hasta)} download>
                <Download className="mr-1.5 h-4 w-4" />
                Exportar a Excel
              </a>
            </Button>
          )}
        </div>
      </div>

      <Suspense key={`k-${clave}`} fallback={<EsqueletoTarjetas />}>
        <SeccionKpis periodo={periodo} desde={desde} hasta={hasta} hoy={hoy} desdeSerie={desdeSerie} />
      </Suspense>

      <div className="grid gap-3 xl:grid-cols-2">
        <Suspense key={`i-${clave}`} fallback={<EsqueletoGrafico />}>
          <SeccionIngresos periodo={periodo} desde={desde} hasta={hasta} hoy={hoy} desdeSerie={desdeSerie} />
        </Suspense>
        <Suspense key={`d-${hoy}`} fallback={<EsqueletoGrafico />}>
          <SeccionDecidir hoy={hoy} />
        </Suspense>
      </div>

      <Suspense key={`m-${clave}`} fallback={<EsqueletoResumen />}>
        <SeccionMix desde={desde} hasta={hasta} hoy={hoy} />
      </Suspense>

      <Suspense key={`c-${clave}`} fallback={<EsqueletoResumen />}>
        <SeccionCostoLibra desde={desde} hasta={hasta} etiquetaPeriodo={etiquetaPeriodo} />
      </Suspense>

      <Suspense key={`p-${clave}`} fallback={<EsqueletoResumen />}>
        <SeccionProduccion periodo={periodo} desde={desde} hasta={hasta} />
      </Suspense>

      <Suspense key={`v-${clave}`} fallback={<EsqueletoResumen />}>
        <SeccionProveedores desde={desde} hasta={hasta} />
      </Suspense>
    </div>
  );
}
