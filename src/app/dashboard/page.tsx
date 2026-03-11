import { createClient } from "@/lib/supabase/server";
import { TrendingDown, TrendingUp, Droplets, Milk, Beef } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { GastosDonutChart } from "@/charts/gastos-donut-chart";
import { IngresosDonutChart } from "@/charts/ingresos-donut-chart";
import { GastosIngresosLineChart } from "@/charts/gastos-ingresos-line-chart";
import {
  getLitrosDiaActual,
  getLitrosMesActual,
  getLecheMesQuincenas,
} from "@/features/extracciones/actions/extracciones.actions";
import { checkRoutePermission } from "@/lib/auth/check-permissions";

function getCurrentMonthRange() {
  const now = new Date();
  const start = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const end = formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  return { start, end };
}

function getLastMonthRange() {
  const now = new Date();
  const start = formatDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const end = formatDate(new Date(now.getFullYear(), now.getMonth(), 0));
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
    <span
      className="text-xs font-medium"
      style={{ color: positive ? "#16a34a" : "#ef4444" }}
    >
      {label} vs. mes anterior
    </span>
  );
}

export default async function DashboardPage() {
  await checkRoutePermission(["admin", "viewer"]);

  const supabase = await createClient();
  const current = getCurrentMonthRange();
  const last = getLastMonthRange();

  const [
    { data: gastosCurr },
    { data: gastosLast },
    { data: ingresosCurr },
    { data: ingresosLast },
    { data: allGastosRaw },
    { data: allIngresosRaw },
    { data: vacasEstados },
    litrosDia,
    litrosMes,
    quincenas,
  ] = await Promise.all([
    supabase.from("gastos").select("valor").gte("fecha", current.start).lte("fecha", current.end),
    supabase.from("gastos").select("valor").gte("fecha", last.start).lte("fecha", last.end),
    supabase.from("ingresos").select("valor").gte("fecha", current.start).lte("fecha", current.end),
    supabase.from("ingresos").select("valor").gte("fecha", last.start).lte("fecha", last.end),
    supabase
      .from("gastos")
      .select("fecha, valor, subconceptos_gasto(nombre, conceptos_gasto(nombre))")
      .order("fecha", { ascending: true }),
    supabase
      .from("ingresos")
      .select("fecha, valor, subconceptos_ingreso(nombre, conceptos_ingreso(nombre))")
      .order("fecha", { ascending: true }),
    supabase.from("vacas").select("estado"),
    getLitrosDiaActual(),
    getLitrosMesActual(),
    getLecheMesQuincenas(),
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">Dashboard</h1>
        <p className="text-sm text-stone-500 mt-0.5">Resumen del mes actual</p>
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

        {/* Leche hoy */}
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
          <div className="mt-3 pt-3 border-t border-stone-100">
            <span className="text-xs text-stone-400">Litros extraídos hoy</span>
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

        {/* Vacas */}
        <div className="bg-white rounded-xl border border-stone-200 p-6 shadow-sm hover:shadow-md transition-shadow duration-200">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wide">Vacas</p>
              <p className="text-2xl font-bold text-stone-900 mt-1.5">{vacasProduccion + vacasSecado}</p>
            </div>
            <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ml-3" style={{ backgroundColor: "#fffbeb" }}>
              <Beef className="h-5 w-5" style={{ color: "#d97706" }} />
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
      <GastosIngresosLineChart
        gastos={allGastos}
        ingresos={allIngresos}
      />
    </div>
  );
}
