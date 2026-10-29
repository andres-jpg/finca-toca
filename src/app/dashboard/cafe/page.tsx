import { Suspense } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireSesion } from "@/modules/core/auth/guards";
import { tieneModulo } from "@/modules/core/tenants/modulos";
import { requireModuloPagina } from "@/modules/core/tenants/tenant.guards";
import { fechaHoyEnZona } from "@/modules/cafe/insumos/lib/insumos";
import { EsqueletoGraficos, EsqueletoInventario, EsqueletoResumen, EsqueletoTarjetas } from "@/modules/cafe/panel/components/esqueletos";
import { PanelFiltros } from "@/modules/cafe/panel/components/panel-filtros";
import { SeccionGraficos } from "@/modules/cafe/panel/components/seccion-graficos";
import { SeccionInventario } from "@/modules/cafe/panel/components/seccion-inventario";
import { SeccionResumen } from "@/modules/cafe/panel/components/seccion-resumen";
import { SeccionTarjetas } from "@/modules/cafe/panel/components/seccion-tarjetas";
import { urlExportacion } from "@/modules/cafe/panel/lib/kpis";
import { describirPeriodo, etiquetaLinea, parsearParamsPanel, resolverPeriodo } from "@/modules/cafe/panel/lib/periodo";

/**
 * Panel operativo de gerencia (FIN-115 · CO-34, HU-F1-14): lo recibido, la merma, el inventario y el ingreso del día, de la
 * semana, del mes o de un rango, y por línea de negocio (marca propia · trilla · maquila). Lo ven todos los miembros del
 * cliente con el módulo `cafe.dashboard` (es la página de inicio de Gerencia); es de solo lectura.
 *
 * Periodo y línea viven en la URL. Cada sección es un `Suspense` aparte, con su `key` para que cambiar de filtro vuelva a
 * mostrar el marcador: las tarjetas (una sola llamada a `cafe.kpis_periodo`) llegan primero y los gráficos y el resumen,
 * que leen la serie diaria, después. La autorización real está en la base: las tres funciones exigen miembro y módulo, y el
 * RLS aísla por cliente. Como `cafe.dashboard` no es módulo base, un cliente sin él vuelve a `/dashboard`, que lo manda a
 * los lotes (`paginaInicial`): no hay bucle de redirecciones.
 */
export default async function PanelCafePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireModuloPagina("cafe.dashboard");
  const { tenant } = await requireSesion();

  const params = parsearParamsPanel(await searchParams);
  const hoy = fechaHoyEnZona(tenant.zonaHoraria);
  const { periodo, desde, hasta, aviso } = resolverPeriodo(params, hoy);
  const { linea } = params;
  // Una clave por filtro: al cambiarlo, cada sección vuelve a su marcador en vez de dejar la cifra vieja a la vista.
  const clave = `${desde}|${hasta}|${linea ?? "todo"}`;
  const puedeExportar = tieneModulo(tenant.modulos, "cafe.recepcion");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-800">Panel de gerencia</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {describirPeriodo(desde, hasta)} · {etiquetaLinea(linea)}
          {desde === hoy && hasta === hoy ? " · hoy" : ""}
        </p>
      </div>

      <PanelFiltros periodo={periodo} linea={linea} desde={desde} hasta={hasta} hoy={hoy} />
      {aviso && (
        <p role="status" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {aviso}
        </p>
      )}

      <Suspense key={`t-${clave}`} fallback={<EsqueletoTarjetas />}>
        <SeccionTarjetas desde={desde} hasta={hasta} linea={linea} />
      </Suspense>

      <Suspense key={`i-${clave}`} fallback={<EsqueletoInventario />}>
        <SeccionInventario desde={desde} hasta={hasta} linea={linea} />
      </Suspense>

      <Suspense key={`g-${clave}`} fallback={<EsqueletoGraficos />}>
        <SeccionGraficos desde={desde} hasta={hasta} linea={linea} />
      </Suspense>

      <section className="space-y-3" aria-labelledby="resumen-titulo">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <h2 id="resumen-titulo" className="text-lg font-semibold tracking-tight text-gray-800">
              Resumen de producción
            </h2>
            <p className="text-sm text-gray-500">Por tipo de proceso y por línea, del {describirPeriodo(desde, hasta)}.</p>
          </div>
          {puedeExportar && (
            <Button asChild variant="outline" className="h-11 shrink-0 sm:h-9">
              <a href={urlExportacion(desde, hasta, linea)} download>
                <Download className="mr-1.5 h-4 w-4" />
                Exportar a Excel
              </a>
            </Button>
          )}
        </div>
        <Suspense key={`r-${clave}`} fallback={<EsqueletoResumen />}>
          <SeccionResumen desde={desde} hasta={hasta} linea={linea} />
        </Suspense>
        {puedeExportar && (
          <p className="text-xs text-gray-500">
            El Excel trae los lotes recibidos en el periodo (hoja «Lotes») y sus procesos de esas fechas (hoja «Procesos»), con la misma línea elegida.
          </p>
        )}
      </section>
    </div>
  );
}
