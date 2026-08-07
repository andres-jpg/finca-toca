import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TrendingDown, TrendingUp, Droplets, Milk, HeartPulse } from "lucide-react";
import { formatDate } from "@/lib/utils";
import {
  ConceptosDonutChart,
  GastosIngresosLineChart,
  ExtraccionesLineChart,
} from "@/charts/chart-wrappers";
import { getLecheHoy } from "@/features/extracciones/actions/extracciones.actions";
import { getAlertas } from "@/features/alertas/actions/alertas.queries";
import { AlertasCard } from "@/features/alertas/components/alertas-card";
import {
  ESTADO_PRODUCTIVO_HEX,
  ESTADO_PRODUCTIVO_LABELS,
  ESTADO_REPRODUCTIVO_HEX,
  ESTADO_REPRODUCTIVO_LABELS,
} from "@/lib/animales/estados";
import { canWrite, checkRoutePermission } from "@/lib/auth/check-permissions";
import { getUserRole } from "@/lib/auth/get-user-role";
import { redirect } from "next/navigation";
import { PiCow } from "react-icons/pi";
import { DashboardFilter } from "@/components/dashboard/dashboard-filter";
import type { EstadoProductivo, EstadoReproductivo } from "@/types";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function getMonthRange(year: number, month: number) {
  const start = formatDate(new Date(year, month - 1, 1));
  const end = formatDate(new Date(year, month, 0));
  return { start, end };
}

function getPrevMonthRange(year: number, month: number) {
  const start = formatDate(new Date(year, month - 2, 1));
  const end = formatDate(new Date(year, month - 1, 0));
  return { start, end };
}

function calcTrend(current: number, previous: number) {
  if (previous === 0) return { label: current > 0 ? "+100%" : "—", positive: true };
  const pct = ((current - previous) / previous) * 100;
  return {
    label: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`,
    positive: pct >= 0,
  };
}

function TrendBadge({ label, positive }: { label: string; positive: boolean }) {
  if (label === "—") return <span className="text-xs text-stone-400">Sin datos anteriores</span>;
  return (
    <span className="text-xs font-medium" style={{ color: positive ? "#16a34a" : "#ef4444" }}>
      {label} vs. mes anterior
    </span>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; anio?: string }>;
}) {
  const role = await getUserRole();
  if (role === "cooperativa_admin") redirect("/dashboard/cooperativa");
  if (role === "cooperativa_user") redirect("/dashboard/recolecciones");
  await checkRoutePermission(["admin", "viewer"]);

  const params = await searchParams;
  const now = new Date();

  // Determinar si el filtro está activo
  const hasFilter = Boolean(params.mes && params.anio);

  // Mes/año efectivo: si hay filtro, el seleccionado; si no, el actual
  const effectiveMes = hasFilter
    ? Math.min(12, Math.max(1, parseInt(params.mes!)))
    : now.getMonth() + 1;
  const effectiveAnio = hasFilter
    ? parseInt(params.anio!)
    : now.getFullYear();

  const selected = getMonthRange(effectiveAnio, effectiveMes);
  const prev = getPrevMonthRange(effectiveAnio, effectiveMes);

  const supabase = await createClient();

  // Un solo fetch de histórico completo por tabla (con joins de concepto incluidos):
  // current/prev month, donuts y quincenas se derivan en JS filtrando por fecha en vez
  // de lanzar una query separada por cada corte — antes eran ~15 queries, varias de ellas
  // subconjuntos exactos unas de otras.
  const [
    { data: gastosRaw },
    { data: ingresosRaw },
    { data: vacasEstados },
    { data: extraccionesRaw },
    lecheHoy,
  ] = await Promise.all([
    supabase
      .from("gastos")
      .select("fecha, valor, subconceptos_gasto(nombre, conceptos_gasto(nombre))")
      .order("fecha", { ascending: true }),
    supabase
      .from("ingresos")
      .select("fecha, valor, source, subconceptos_ingreso(nombre, conceptos_ingreso(nombre))")
      .order("fecha", { ascending: true }),
    supabase
      .from("animales")
      .select("estado_productivo, estado_reproductivo")
      .eq("sexo", "hembra")
      .eq("alta", true),
    supabase
      .from("extracciones_leche")
      .select("fecha, litros_cantina, litros_cria, vacas_en_produccion")
      .order("fecha", { ascending: true }),
    getLecheHoy(),
  ]);

  // Comparte la lectura de animales/eventos con la campana del header vía React.cache().
  const alertas = await getAlertas();

  const inRange = (fecha: string, start: string, end: string) => fecha >= start && fecha <= end;
  const q1Start = formatDate(new Date(effectiveAnio, effectiveMes - 1, 1));
  const q1End = formatDate(new Date(effectiveAnio, effectiveMes - 1, 15));
  const q2Start = formatDate(new Date(effectiveAnio, effectiveMes - 1, 16));
  const q2End = formatDate(new Date(effectiveAnio, effectiveMes, 0));

  const hembras = (vacasEstados ?? []) as {
    estado_productivo: EstadoProductivo | null;
    estado_reproductivo: EstadoReproductivo | null;
  }[];
  const vacasTotal = hembras.length;
  const contarProductivo = (estado: EstadoProductivo) =>
    hembras.filter((v) => v.estado_productivo === estado).length;
  const contarReproductivo = (estado: EstadoReproductivo) =>
    hembras.filter((v) => v.estado_reproductivo === estado).length;

  const vacasProduccion = contarProductivo("produccion");
  const desgloseProductivo = (["produccion", "secado", "levante_2", "levante_1", "leche"] as const).map(
    (estado) => ({ estado, total: contarProductivo(estado) })
  );
  const desgloseReproductivo = (
    [
      "cargada",
      "por_confirmar",
      "rechequeo",
      "servicio",
      "pre_servicio",
      "puber",
      "pre_puber",
    ] as const
  ).map((estado) => ({ estado, total: contarReproductivo(estado) }));
  const sinEstadoReproductivo = hembras.filter((v) => !v.estado_reproductivo).length;

  // Datos para gráfico de líneas: solo fecha + valor (sin concepto), histórico completo
  const allGastos = (gastosRaw ?? []).map((g: any) => ({
    fecha: g.fecha as string,
    valor: g.valor as number,
  }));
  const allIngresos = (ingresosRaw ?? []).map((i: any) => ({
    fecha: i.fecha as string,
    valor: i.valor as number,
  }));

  // Datos para donuts: concepto + valor — rango filtrado en JS cuando hay filtro activo
  const gastosDonutRows = hasFilter
    ? (gastosRaw ?? []).filter((g: any) => inRange(g.fecha, selected.start, selected.end))
    : (gastosRaw ?? []);
  const ingresosDonutRows = hasFilter
    ? (ingresosRaw ?? []).filter((i: any) => inRange(i.fecha, selected.start, selected.end))
    : (ingresosRaw ?? []);
  const donutGastos = gastosDonutRows.map((g: any) => ({
    concepto: g.subconceptos_gasto?.conceptos_gasto?.nombre ?? "Otros",
    valor: g.valor as number,
  }));
  const donutIngresos = ingresosDonutRows.map((i: any) => ({
    concepto: i.subconceptos_ingreso?.conceptos_ingreso?.nombre ?? "Otros",
    valor: i.valor as number,
  }));

  const totalGastos = (gastosRaw ?? [])
    .filter((g: any) => inRange(g.fecha, selected.start, selected.end))
    .reduce((s: number, r: any) => s + r.valor, 0);
  const lastGastos = (gastosRaw ?? [])
    .filter((g: any) => inRange(g.fecha, prev.start, prev.end))
    .reduce((s: number, r: any) => s + r.valor, 0);
  const totalIngresos = (ingresosRaw ?? [])
    .filter((i: any) => inRange(i.fecha, selected.start, selected.end))
    .reduce((s: number, r: any) => s + r.valor, 0);
  const lastIngresos = (ingresosRaw ?? [])
    .filter((i: any) => inRange(i.fecha, prev.start, prev.end))
    .reduce((s: number, r: any) => s + r.valor, 0);

  const gastosTrend = calcTrend(totalGastos, lastGastos);
  const ingresosTrend = calcTrend(totalIngresos, lastIngresos);

  // "Leche extraída" = cantina + cría: se ordeñó igual, se venda o se quede para los terneros.
  // Los cortes que van acompañados de dinero (quincenas) sí usan solo cantina, que es la
  // única que generó ingreso.
  const totalExtraido = (r: any) => r.litros_cantina + r.litros_cria;

  const extMes = (extraccionesRaw ?? []).filter((r: any) => inRange(r.fecha, selected.start, selected.end));
  const litrosMes = extMes.reduce((s: number, r: any) => s + totalExtraido(r), 0);
  const cantinaMes = extMes.reduce((s: number, r: any) => s + r.litros_cantina, 0);
  const criaMes = extMes.reduce((s: number, r: any) => s + r.litros_cria, 0);
  const litrosPorVacaHoy = vacasProduccion > 0 ? lecheHoy.total / vacasProduccion : 0;
  const extMesConVacas = extMes.filter((r: any) => r.vacas_en_produccion != null && r.vacas_en_produccion > 0);
  const litrosPorVacaMes = extMesConVacas.length > 0
    ? extMesConVacas.reduce((s: number, r: any) => s + totalExtraido(r) / r.vacas_en_produccion, 0) / extMesConVacas.length
    : vacasProduccion > 0 ? litrosMes / vacasProduccion : 0;
  const APORTACION_PCT = 0.0075;
  const quincenas = {
    q1Litros: (extraccionesRaw ?? [])
      .filter((r: any) => inRange(r.fecha, q1Start, q1End))
      .reduce((s: number, r: any) => s + r.litros_cantina, 0),
    q1Valor: (ingresosRaw ?? [])
      .filter((r: any) => r.source === "leche_extraccion" && inRange(r.fecha, q1Start, q1End))
      .reduce((s: number, r: any) => s + r.valor, 0),
    q2Litros: (extraccionesRaw ?? [])
      .filter((r: any) => inRange(r.fecha, q2Start, q2End))
      .reduce((s: number, r: any) => s + r.litros_cantina, 0),
    q2Valor: (ingresosRaw ?? [])
      .filter((r: any) => r.source === "leche_extraccion" && inRange(r.fecha, q2Start, q2End))
      .reduce((s: number, r: any) => s + r.valor, 0),
  };
  const q1Aportacion = quincenas.q1Valor * APORTACION_PCT;
  const q2Aportacion = quincenas.q2Valor * APORTACION_PCT;
  const totalAportacion = q1Aportacion + q2Aportacion;
  const totalIngresosNeto = totalIngresos - totalAportacion;

  // La gráfica es de extracciones, así que muestra el total ordeñado (cantina + cría).
  const allExtracciones = (extraccionesRaw ?? []).map((e: any) => ({
    fecha: e.fecha as string,
    litros: totalExtraido(e) as number,
    vacasEnProduccion: (e.vacas_en_produccion as number | null) ?? null,
  }));

  const fechaHoy = now.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
  const mesLabel = `${MESES[effectiveMes - 1]} ${effectiveAnio}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">Dashboard</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            {hasFilter ? mesLabel : "Resumen del mes actual"}
          </p>
        </div>
        <DashboardFilter hasFilter={hasFilter} mes={effectiveMes} anio={effectiveAnio} />
      </div>

      {/* Stat cards — 4 columnas que marcan la rejilla que reutiliza la segunda fila. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Gastos */}
        <div className="bg-white rounded-xl border border-stone-200 p-6 shadow-sm hover:shadow-md transition-shadow duration-200">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wide">Gastos del mes</p>
              <p className="text-2xl font-bold mt-1.5 truncate" style={{ color: "#ef4444" }}>
                ${totalGastos.toLocaleString("es-CO", { minimumFractionDigits: 0 })}
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ml-3" style={{ backgroundColor: "#fef2f2" }}>
              <TrendingDown className="h-5 w-5" style={{ color: "#ef4444" }} />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-stone-100">
            <TrendBadge label={gastosTrend.label} positive={!gastosTrend.positive} />
          </div>
        </div>

        {/* Ingresos */}
        <div className="bg-white rounded-xl border border-stone-200 p-6 shadow-sm hover:shadow-md transition-shadow duration-200">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wide">Ingresos del mes</p>
              <p className="text-2xl font-bold mt-1.5 truncate" style={{ color: "#16a34a" }}>
                ${totalIngresosNeto.toLocaleString("es-CO", { minimumFractionDigits: 0 })}
              </p>
              <p className="text-xs text-stone-400 mt-0.5">
                Bruto ${totalIngresos.toLocaleString("es-CO", { minimumFractionDigits: 0 })} · <span style={{ color: "#ef4444" }}>Des. Fedegan −${totalAportacion.toLocaleString("es-CO", { minimumFractionDigits: 0 })}</span>
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ml-3" style={{ backgroundColor: "#f0fdf4" }}>
              <TrendingUp className="h-5 w-5" style={{ color: "#16a34a" }} />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-stone-100">
            <TrendBadge label={ingresosTrend.label} positive={ingresosTrend.positive} />
          </div>
        </div>

        {/* Leche hoy — siempre fija */}
        <div className="bg-white rounded-xl border border-stone-200 p-6 shadow-sm hover:shadow-md transition-shadow duration-200">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wide">Leche hoy</p>
              <p className="text-2xl font-bold text-stone-900 mt-1.5">
                {lecheHoy.total.toFixed(1)}{" "}
                <span className="text-base font-medium text-stone-400">L</span>
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ml-3" style={{ backgroundColor: "#eff6ff" }}>
              <Droplets className="h-5 w-5" style={{ color: "#3b82f6" }} />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-stone-100 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-stone-400">Total extraído hoy</span>
              <span className="text-xs text-stone-400">{fechaHoy}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs text-stone-500">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: "#3b82f6" }} />
                Cantina
              </span>
              <span className="text-xs font-semibold text-stone-600">
                {lecheHoy.cantina.toFixed(1)} L
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs text-stone-500">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: "#f59e0b" }} />
                Cría
              </span>
              <span className="text-xs font-semibold text-stone-600">
                {lecheHoy.cria.toFixed(1)} L
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-stone-400">Promedio por vaca</span>
              <span className="text-xs text-stone-500">{litrosPorVacaHoy.toFixed(1)} L/vaca</span>
            </div>
          </div>
        </div>

        {/* Leche mes */}
        <div className="bg-white rounded-xl border border-stone-200 p-6 shadow-sm hover:shadow-md transition-shadow duration-200">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wide">Leche del mes</p>
              <p className="text-2xl font-bold text-stone-900 mt-1.5">
                {litrosMes.toFixed(1)}{" "}
                <span className="text-base font-medium text-stone-400">L</span>
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ml-3" style={{ backgroundColor: "#f0f9ff" }}>
              <Milk className="h-5 w-5" style={{ color: "#0284c7" }} />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-stone-100 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-stone-400">Cantina · Cría</span>
              <span className="text-xs text-stone-500">
                {cantinaMes.toFixed(1)} L · {criaMes.toFixed(1)} L
              </span>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-stone-400">Cantina Q1</span>
                <span className="text-xs text-stone-500">
                  {quincenas.q1Litros.toFixed(1)} L · ${quincenas.q1Valor.toLocaleString("es-CO", { minimumFractionDigits: 0 })}
                </span>
              </div>
              {quincenas.q1Valor > 0 && (
                <div className="flex items-center justify-end">
                  <span className="text-xs" style={{ color: "#ef4444" }}>
                    Des. Fedegan −${q1Aportacion.toLocaleString("es-CO", { minimumFractionDigits: 0 })}
                  </span>
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-stone-400">Cantina Q2</span>
                <span className="text-xs text-stone-500">
                  {quincenas.q2Litros.toFixed(1)} L · ${quincenas.q2Valor.toLocaleString("es-CO", { minimumFractionDigits: 0 })}
                </span>
              </div>
              {quincenas.q2Valor > 0 && (
                <div className="flex items-center justify-end">
                  <span className="text-xs" style={{ color: "#ef4444" }}>
                    Des. Fedegan −${q2Aportacion.toLocaleString("es-CO", { minimumFractionDigits: 0 })}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between pt-0.5">
              <span className="text-xs text-stone-400">Promedio por vaca</span>
              <span className="text-xs text-stone-500">{litrosPorVacaMes.toFixed(1)} L/vaca</span>
            </div>
          </div>
        </div>

      </div>

      {/* Estado productivo + alertas + estado reproductivo, las tres al mismo alto.
          Son 4 columnas (alertas ocupa 2) para que la rejilla case con la fila de KPIs.
          La altura de la fila la marcan SOLO las dos cards de estado: la de alertas va en
          `position: absolute`, así no aporta altura propia y desborda con scroll interno en
          vez de estirar la fila. Con `items-stretch` a secas, una lista de alertas larga
          hacía crecer la fila entera y dejaba las otras dos con un hueco al final.
          Por debajo de `lg` las cards se apilan y cada una crece a su contenido. */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-stretch">
        {/* Estado productivo */}
        <div className="bg-white rounded-xl border border-stone-200 p-6 shadow-sm flex flex-col">
          <div className="flex items-start justify-between shrink-0">
            <div className="min-w-0">
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wide">
                Estado productivo
              </p>
              <p className="text-2xl font-bold text-stone-900 mt-1.5">{vacasTotal}</p>
            </div>
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ml-3"
              style={{ backgroundColor: "#fffbeb" }}
            >
              <PiCow className="h-5 w-5" style={{ color: "#d97706" }} />
            </div>
          </div>
          {/* Lista vertical, igual que estado reproductivo: al quedar las dos cards lado a
              lado y estiradas a la misma altura, la rejilla de 3 columnas de antes dejaba
              medio card vacío. */}
          <div className="mt-3 pt-3 border-t border-stone-100 space-y-1.5">
            {desgloseProductivo.map(({ estado, total }) => (
              <Link
                key={estado}
                href={`/dashboard/animales?productivo=${estado}`}
                className="flex items-center justify-between rounded hover:bg-stone-50 -mx-1 px-1 py-0.5 transition-colors"
                title={`Ver hembras en ${ESTADO_PRODUCTIVO_LABELS[estado]}`}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: ESTADO_PRODUCTIVO_HEX[estado] }}
                  />
                  <span className="text-xs text-stone-600 truncate">
                    {ESTADO_PRODUCTIVO_LABELS[estado]}
                  </span>
                </span>
                <span
                  className="text-xs font-semibold shrink-0"
                  style={{ color: ESTADO_PRODUCTIVO_HEX[estado] }}
                >
                  {total}
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 relative flex min-h-0">
          <div className="flex w-full lg:absolute lg:inset-0">
            <AlertasCard alertas={alertas} canEdit={canWrite(role)} />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-stone-200 p-6 shadow-sm flex flex-col">
          <div className="flex items-start justify-between shrink-0">
            <div className="min-w-0">
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wide">
                Estado reproductivo
              </p>
              <p className="text-2xl font-bold text-stone-900 mt-1.5">
                {vacasTotal - sinEstadoReproductivo}
                <span className="text-sm font-medium text-stone-400"> / {vacasTotal}</span>
              </p>
            </div>
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ml-3"
              style={{ backgroundColor: "#f0fdfa" }}
            >
              <HeartPulse className="h-5 w-5" style={{ color: "#0d9488" }} />
            </div>
          </div>
          {/* Sin `flex-1`: la lista mide lo que ocupan sus filas, para que la card termine
              justo debajo del último estado en lugar de estirarse. */}
          <div className="mt-3 pt-3 border-t border-stone-100 space-y-1.5">
            {desgloseReproductivo.map(({ estado, total }) => (
              <Link
                key={estado}
                href={`/dashboard/animales?reproductivo=${estado}`}
                className="flex items-center justify-between rounded hover:bg-stone-50 -mx-1 px-1 py-0.5 transition-colors"
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: ESTADO_REPRODUCTIVO_HEX[estado] }}
                  />
                  <span className="text-xs text-stone-600 truncate">
                    {ESTADO_REPRODUCTIVO_LABELS[estado]}
                  </span>
                </span>
                <span
                  className="text-xs font-semibold shrink-0"
                  style={{ color: ESTADO_REPRODUCTIVO_HEX[estado] }}
                >
                  {total}
                </span>
              </Link>
            ))}
            {sinEstadoReproductivo > 0 && (
              <p className="text-[11px] text-stone-400 pt-1">
                {sinEstadoReproductivo} sin estado — se asigna al registrar eventos.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Gráfico de extracciones */}
      <ExtraccionesLineChart
        extracciones={allExtracciones}
        hasFilter={hasFilter}
        mes={effectiveMes}
        anio={effectiveAnio}
      />

      {/* Donut combinado — histórico o filtrado según el filtro activo */}
      <ConceptosDonutChart gastos={donutGastos} ingresos={donutIngresos} />

      {/* Línea — siempre histórico completo */}
      <GastosIngresosLineChart gastos={allGastos} ingresos={allIngresos} />
    </div>
  );
}
