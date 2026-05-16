import { createClient } from "@/lib/supabase/server";
import { TrendingDown, TrendingUp, Droplets, Milk } from "lucide-react";
import { formatDate } from "@/lib/utils";
import dynamic from "next/dynamic";

const ConceptosDonutChart = dynamic(() =>
  import("@/charts/conceptos-donut-chart").then((m) => m.ConceptosDonutChart)
);
const GastosIngresosLineChart = dynamic(() =>
  import("@/charts/gastos-ingresos-line-chart").then((m) => m.GastosIngresosLineChart)
);
const ExtraccionesLineChart = dynamic(() =>
  import("@/charts/extracciones-line-chart").then((m) => m.ExtraccionesLineChart)
);
import { getLitrosDiaActual } from "@/features/extracciones/actions/extracciones.actions";
import { checkRoutePermission } from "@/lib/auth/check-permissions";
import { getUserRole } from "@/lib/auth/get-user-role";
import { redirect } from "next/navigation";
import { PiCow } from "react-icons/pi";
import { DashboardFilter } from "@/components/dashboard/dashboard-filter";

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

  // Queries de donuts con join a conceptos — filtradas en DB si hay filtro activo
  const gastosDonutQuery = supabase
    .from("gastos")
    .select("valor, subconceptos_gasto(nombre, conceptos_gasto(nombre))");
  const ingresosDonutQuery = supabase
    .from("ingresos")
    .select("valor, subconceptos_ingreso(nombre, conceptos_ingreso(nombre))");

  const [
    { data: gastosCurr },
    { data: gastosLast },
    { data: ingresosCurr },
    { data: ingresosLast },
    // Line chart: solo fecha+valor sin joins (más ligero)
    { data: gastosLineRaw },
    { data: ingresosLineRaw },
    // Donuts: con join a conceptos, rango filtrado en DB cuando hay filtro
    { data: gastosDonutRaw },
    { data: ingresosDonutRaw },
    { data: vacasEstados },
    { data: extMes },
    { data: ext1 },
    { data: ext2 },
    { data: ing1 },
    { data: ing2 },
    litrosDia,
    { data: allExtraccionesRaw },
  ] = await Promise.all([
    supabase.from("gastos").select("valor").gte("fecha", selected.start).lte("fecha", selected.end),
    supabase.from("gastos").select("valor").gte("fecha", prev.start).lte("fecha", prev.end),
    supabase.from("ingresos").select("valor").gte("fecha", selected.start).lte("fecha", selected.end),
    supabase.from("ingresos").select("valor").gte("fecha", prev.start).lte("fecha", prev.end),
    supabase.from("gastos").select("fecha, valor").order("fecha", { ascending: true }),
    supabase.from("ingresos").select("fecha, valor").order("fecha", { ascending: true }),
    hasFilter
      ? gastosDonutQuery.gte("fecha", selected.start).lte("fecha", selected.end)
      : gastosDonutQuery,
    hasFilter
      ? ingresosDonutQuery.gte("fecha", selected.start).lte("fecha", selected.end)
      : ingresosDonutQuery,
    supabase.from("vacas").select("estado").eq("alta", true),
    supabase.from("extracciones_leche").select("litros, vacas_en_produccion").gte("fecha", selected.start).lte("fecha", selected.end),
    supabase.from("extracciones_leche").select("litros")
      .gte("fecha", formatDate(new Date(effectiveAnio, effectiveMes - 1, 1)))
      .lte("fecha", formatDate(new Date(effectiveAnio, effectiveMes - 1, 15))),
    supabase.from("extracciones_leche").select("litros")
      .gte("fecha", formatDate(new Date(effectiveAnio, effectiveMes - 1, 16)))
      .lte("fecha", formatDate(new Date(effectiveAnio, effectiveMes, 0))),
    supabase.from("ingresos").select("valor").eq("source", "leche_extraccion")
      .gte("fecha", formatDate(new Date(effectiveAnio, effectiveMes - 1, 1)))
      .lte("fecha", formatDate(new Date(effectiveAnio, effectiveMes - 1, 15))),
    supabase.from("ingresos").select("valor").eq("source", "leche_extraccion")
      .gte("fecha", formatDate(new Date(effectiveAnio, effectiveMes - 1, 16)))
      .lte("fecha", formatDate(new Date(effectiveAnio, effectiveMes, 0))),
    getLitrosDiaActual(),
    supabase.from("extracciones_leche").select("fecha, litros, vacas_en_produccion").order("fecha", { ascending: true }),
  ]);

  const vacasTotal = (vacasEstados ?? []).length;
  const vacasProduccion = (vacasEstados ?? []).filter((v: any) => v.estado === "produccion").length;
  const vacasSecado = (vacasEstados ?? []).filter((v: any) => v.estado === "secado").length;
  const vacasTransicion = (vacasEstados ?? []).filter((v: any) => v.estado === "transicion").length;
  const vacasPreJardin = (vacasEstados ?? []).filter((v: any) => v.estado === "pre_jardin").length;
  const vacasJardin = (vacasEstados ?? []).filter((v: any) => v.estado === "jardin").length;

  // Datos para gráfico de líneas: solo fecha + valor (sin concepto)
  const allGastos = (gastosLineRaw ?? []).map((g: any) => ({
    fecha: g.fecha as string,
    valor: g.valor as number,
  }));
  const allIngresos = (ingresosLineRaw ?? []).map((i: any) => ({
    fecha: i.fecha as string,
    valor: i.valor as number,
  }));

  // Datos para donuts: concepto + valor (ya filtrados por DB si hay filtro)
  const donutGastos = (gastosDonutRaw ?? []).map((g: any) => ({
    concepto: g.subconceptos_gasto?.conceptos_gasto?.nombre ?? "Otros",
    valor: g.valor as number,
  }));
  const donutIngresos = (ingresosDonutRaw ?? []).map((i: any) => ({
    concepto: i.subconceptos_ingreso?.conceptos_ingreso?.nombre ?? "Otros",
    valor: i.valor as number,
  }));

  const totalGastos = (gastosCurr ?? []).reduce((s: number, r: { valor: number }) => s + r.valor, 0);
  const lastGastos = (gastosLast ?? []).reduce((s: number, r: { valor: number }) => s + r.valor, 0);
  const totalIngresos = (ingresosCurr ?? []).reduce((s: number, r: { valor: number }) => s + r.valor, 0);
  const lastIngresos = (ingresosLast ?? []).reduce((s: number, r: { valor: number }) => s + r.valor, 0);

  const gastosTrend = calcTrend(totalGastos, lastGastos);
  const ingresosTrend = calcTrend(totalIngresos, lastIngresos);

  const litrosMes = (extMes ?? []).reduce((s: number, r: any) => s + r.litros, 0);
  const litrosPorVacaHoy = vacasProduccion > 0 ? litrosDia / vacasProduccion : 0;
  const extMesConVacas = (extMes ?? []).filter((r: any) => r.vacas_en_produccion != null && r.vacas_en_produccion > 0);
  const litrosPorVacaMes = extMesConVacas.length > 0
    ? extMesConVacas.reduce((s: number, r: any) => s + r.litros / r.vacas_en_produccion, 0) / extMesConVacas.length
    : vacasProduccion > 0 ? litrosMes / vacasProduccion : 0;
  const APORTACION_PCT = 0.0075;
  const quincenas = {
    q1Litros: (ext1 ?? []).reduce((s, r) => s + r.litros, 0),
    q1Valor: (ing1 ?? []).reduce((s, r) => s + r.valor, 0),
    q2Litros: (ext2 ?? []).reduce((s, r) => s + r.litros, 0),
    q2Valor: (ing2 ?? []).reduce((s, r) => s + r.valor, 0),
  };
  const q1Aportacion = quincenas.q1Valor * APORTACION_PCT;
  const q2Aportacion = quincenas.q2Valor * APORTACION_PCT;
  const totalAportacion = q1Aportacion + q2Aportacion;
  const totalIngresosNeto = totalIngresos - totalAportacion;

  const allExtracciones = (allExtraccionesRaw ?? []).map((e: any) => ({
    fecha: e.fecha as string,
    litros: e.litros as number,
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

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
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
                {litrosDia.toFixed(1)}{" "}
                <span className="text-base font-medium text-stone-400">L</span>
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ml-3" style={{ backgroundColor: "#eff6ff" }}>
              <Droplets className="h-5 w-5" style={{ color: "#3b82f6" }} />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-stone-100 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-stone-400">Litros extraídos hoy</span>
              <span className="text-xs text-stone-400">{fechaHoy}</span>
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
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-stone-400">Leche Q1</span>
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
                <span className="text-xs text-stone-400">Leche Q2</span>
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

        {/* Vacas — siempre fija */}
        <div className="bg-white rounded-xl border border-stone-200 p-6 shadow-sm hover:shadow-md transition-shadow duration-200">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wide">Vacas</p>
              <p className="text-2xl font-bold text-stone-900 mt-1.5">{vacasTotal}</p>
            </div>
            <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ml-3" style={{ backgroundColor: "#fffbeb" }}>
              <PiCow className="h-5 w-5" style={{ color: "#d97706" }} />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-stone-100 grid grid-cols-3 gap-x-3 gap-y-2">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: "#16a34a" }} />
              <span className="text-xs font-semibold" style={{ color: "#16a34a" }}>{vacasProduccion}</span>
              <span className="text-xs" style={{ color: "#16a34a" }}>prod.</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: "#d97706" }} />
              <span className="text-xs font-semibold" style={{ color: "#d97706" }}>{vacasSecado}</span>
              <span className="text-xs" style={{ color: "#d97706" }}>secado</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: "#0ea5e9" }} />
              <span className="text-xs font-semibold" style={{ color: "#0ea5e9" }}>{vacasTransicion}</span>
              <span className="text-xs" style={{ color: "#0ea5e9" }}>trans.</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: "#a855f7" }} />
              <span className="text-xs font-semibold" style={{ color: "#a855f7" }}>{vacasPreJardin}</span>
              <span className="text-xs" style={{ color: "#a855f7" }}>prejardín</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: "#ec4899" }} />
              <span className="text-xs font-semibold" style={{ color: "#ec4899" }}>{vacasJardin}</span>
              <span className="text-xs" style={{ color: "#ec4899" }}>jardín</span>
            </div>
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
