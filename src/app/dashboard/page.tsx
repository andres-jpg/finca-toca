import { createClient } from "@/lib/supabase/server";
import { TrendingDown, TrendingUp, Droplets, Milk } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { GastosDonutChart } from "@/charts/gastos-donut-chart";
import { IngresosDonutChart } from "@/charts/ingresos-donut-chart";
import { GastosIngresosLineChart } from "@/charts/gastos-ingresos-line-chart";
import { getLitrosDiaActual } from "@/features/extracciones/actions/extracciones.actions";
import { checkRoutePermission } from "@/lib/auth/check-permissions";
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
  await checkRoutePermission(["admin", "viewer"]);

  const params = await searchParams;
  const now = new Date();
  const mes = params.mes ? Math.min(12, Math.max(1, parseInt(params.mes))) : now.getMonth() + 1;
  const anio = params.anio ? parseInt(params.anio) : now.getFullYear();

  const selected = getMonthRange(anio, mes);
  const prev = getPrevMonthRange(anio, mes);

  const supabase = await createClient();

  const [
    { data: gastosCurr },
    { data: gastosLast },
    { data: ingresosCurr },
    { data: ingresosLast },
    { data: allGastosRaw },
    { data: allIngresosRaw },
    { data: vacasEstados },
    { data: extMes },
    { data: ext1 },
    { data: ext2 },
    { data: ing1 },
    { data: ing2 },
    litrosDia,
  ] = await Promise.all([
    supabase.from("gastos").select("valor").gte("fecha", selected.start).lte("fecha", selected.end),
    supabase.from("gastos").select("valor").gte("fecha", prev.start).lte("fecha", prev.end),
    supabase.from("ingresos").select("valor").gte("fecha", selected.start).lte("fecha", selected.end),
    supabase.from("ingresos").select("valor").gte("fecha", prev.start).lte("fecha", prev.end),
    supabase
      .from("gastos")
      .select("fecha, valor, subconceptos_gasto(nombre, conceptos_gasto(nombre))")
      .gte("fecha", selected.start)
      .lte("fecha", selected.end)
      .order("fecha", { ascending: true }),
    supabase
      .from("ingresos")
      .select("fecha, valor, subconceptos_ingreso(nombre, conceptos_ingreso(nombre))")
      .gte("fecha", selected.start)
      .lte("fecha", selected.end)
      .order("fecha", { ascending: true }),
    supabase.from("vacas").select("estado"),
    // Leche del mes seleccionado
    supabase.from("extracciones_leche").select("litros").gte("fecha", selected.start).lte("fecha", selected.end),
    // Quincena 1
    supabase.from("extracciones_leche").select("litros")
      .gte("fecha", formatDate(new Date(anio, mes - 1, 1)))
      .lte("fecha", formatDate(new Date(anio, mes - 1, 15))),
    // Quincena 2
    supabase.from("extracciones_leche").select("litros")
      .gte("fecha", formatDate(new Date(anio, mes - 1, 16)))
      .lte("fecha", formatDate(new Date(anio, mes, 0))),
    // Valor quincena 1
    supabase.from("ingresos").select("valor").eq("source", "leche_extraccion")
      .gte("fecha", formatDate(new Date(anio, mes - 1, 1)))
      .lte("fecha", formatDate(new Date(anio, mes - 1, 15))),
    // Valor quincena 2
    supabase.from("ingresos").select("valor").eq("source", "leche_extraccion")
      .gte("fecha", formatDate(new Date(anio, mes - 1, 16)))
      .lte("fecha", formatDate(new Date(anio, mes, 0))),
    getLitrosDiaActual(),
  ]);

  const vacasProduccion = (vacasEstados ?? []).filter((v: any) => v.estado === "produccion").length;
  const vacasSecado = (vacasEstados ?? []).filter((v: any) => v.estado === "secado").length;

  const allGastos = (allGastosRaw ?? []).map((g: any) => ({
    fecha: g.fecha,
    concepto: g.subconceptos_gasto?.conceptos_gasto?.nombre ?? "Otros",
    valor: g.valor,
  }));

  const allIngresos = (allIngresosRaw ?? []).map((i: any) => ({
    fecha: i.fecha,
    concepto: i.subconceptos_ingreso?.conceptos_ingreso?.nombre ?? "Leche",
    valor: i.valor,
  }));

  const totalGastos = (gastosCurr ?? []).reduce((s: number, r: { valor: number }) => s + r.valor, 0);
  const lastGastos = (gastosLast ?? []).reduce((s: number, r: { valor: number }) => s + r.valor, 0);
  const totalIngresos = (ingresosCurr ?? []).reduce((s: number, r: { valor: number }) => s + r.valor, 0);
  const lastIngresos = (ingresosLast ?? []).reduce((s: number, r: { valor: number }) => s + r.valor, 0);

  const gastosTrend = calcTrend(totalGastos, lastGastos);
  const ingresosTrend = calcTrend(totalIngresos, lastIngresos);

  const litrosMes = (extMes ?? []).reduce((s, r) => s + r.litros, 0);
  const quincenas = {
    q1Litros: (ext1 ?? []).reduce((s, r) => s + r.litros, 0),
    q1Valor: (ing1 ?? []).reduce((s, r) => s + r.valor, 0),
    q2Litros: (ext2 ?? []).reduce((s, r) => s + r.litros, 0),
    q2Valor: (ing2 ?? []).reduce((s, r) => s + r.valor, 0),
  };

  const fechaHoy = now.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
  const mesLabel = `${MESES[mes - 1]} ${anio}`;
  const isCurrentMonth = mes === now.getMonth() + 1 && anio === now.getFullYear();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">Dashboard</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            {isCurrentMonth ? "Mes actual" : mesLabel}
          </p>
        </div>
        <DashboardFilter mes={mes} anio={anio} />
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
                ${totalIngresos.toLocaleString("es-CO", { minimumFractionDigits: 0 })}
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
          <div className="mt-3 pt-3 border-t border-stone-100 flex items-center justify-between">
            <span className="text-xs text-stone-400">Litros extraídos hoy</span>
            <span className="text-xs text-stone-400">{fechaHoy}</span>
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
          <div className="mt-3 pt-3 border-t border-stone-100 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-stone-400">Leche Q1</span>
              <span className="text-xs text-stone-500">
                {quincenas.q1Litros.toFixed(1)} L · ${quincenas.q1Valor.toLocaleString("es-CO", { minimumFractionDigits: 0 })}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-stone-400">Leche Q2</span>
              <span className="text-xs text-stone-500">
                {quincenas.q2Litros.toFixed(1)} L · ${quincenas.q2Valor.toLocaleString("es-CO", { minimumFractionDigits: 0 })}
              </span>
            </div>
          </div>
        </div>

        {/* Vacas — siempre fija */}
        <div className="bg-white rounded-xl border border-stone-200 p-6 shadow-sm hover:shadow-md transition-shadow duration-200">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wide">Vacas</p>
              <p className="text-2xl font-bold text-stone-900 mt-1.5">{vacasProduccion + vacasSecado}</p>
            </div>
            <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ml-3" style={{ backgroundColor: "#fffbeb" }}>
              <PiCow className="h-5 w-5" style={{ color: "#d97706" }} />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-stone-100 flex items-center gap-3">
            <span className="text-xs font-medium" style={{ color: "#16a34a" }}>{vacasProduccion} producción</span>
            <span className="text-stone-200">|</span>
            <span className="text-xs font-medium" style={{ color: "#d97706" }}>{vacasSecado} secado</span>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <GastosDonutChart gastos={allGastos} />
        <IngresosDonutChart ingresos={allIngresos} />
      </div>
      <GastosIngresosLineChart gastos={allGastos} ingresos={allIngresos} />
    </div>
  );
}
