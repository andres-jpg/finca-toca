import { createClient } from "@/lib/supabase/server";
import { TrendingDown, TrendingUp, Droplets, Milk } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { GastosDonutChart } from "@/charts/gastos-donut-chart";
import { IngresosDonutChart } from "@/charts/ingresos-donut-chart";
import { GastosIngresosLineChart } from "@/charts/gastos-ingresos-line-chart";
import {
  getLitrosDiaActual,
  getLitrosMesActual,
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
      className={
        positive
          ? "text-xs font-medium text-emerald-600"
          : "text-xs font-medium text-red-500"
      }
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
    { data: allGastos },
    { data: allIngresos },
    litrosDia,
    litrosMes,
  ] = await Promise.all([
    supabase.from("gastos").select("valor").gte("fecha", current.start).lte("fecha", current.end),
    supabase.from("gastos").select("valor").gte("fecha", last.start).lte("fecha", last.end),
    supabase.from("ingresos").select("valor").gte("fecha", current.start).lte("fecha", current.end),
    supabase.from("ingresos").select("valor").gte("fecha", last.start).lte("fecha", last.end),
    supabase.from("gastos").select("fecha, concepto, valor").order("fecha", { ascending: true }),
    supabase.from("ingresos").select("fecha, concepto, valor").order("fecha", { ascending: true }),
    getLitrosDiaActual(),
    getLitrosMesActual(),
  ]);

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
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Gastos */}
        <div className="bg-white rounded-xl border border-stone-200 p-6 shadow-sm hover:shadow-md transition-shadow duration-200">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wide">Gastos del mes</p>
              <p className="text-2xl font-bold text-stone-900 mt-1.5 truncate">
                ${totalGastos.toLocaleString("es-CO", { minimumFractionDigits: 0 })}
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0 ml-3">
              <TrendingDown className="h-5 w-5 text-red-500" />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-stone-100">
            {/* For gastos: spending MORE is bad (negative), spending LESS is good (positive) — invert logic */}
            <TrendBadge label={gastosTrend.label} positive={!gastosTrend.positive} />
          </div>
        </div>

        {/* Ingresos */}
        <div className="bg-white rounded-xl border border-stone-200 p-6 shadow-sm hover:shadow-md transition-shadow duration-200">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wide">Ingresos del mes</p>
              <p className="text-2xl font-bold text-stone-900 mt-1.5 truncate">
                ${totalIngresos.toLocaleString("es-CO", { minimumFractionDigits: 0 })}
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0 ml-3">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
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
            <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 ml-3">
              <Droplets className="h-5 w-5 text-blue-500" />
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
            <div className="h-10 w-10 rounded-xl bg-sky-50 flex items-center justify-center shrink-0 ml-3">
              <Milk className="h-5 w-5 text-sky-500" />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-stone-100">
            <span className="text-xs text-stone-400">Total acumulado del mes</span>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <GastosDonutChart gastos={allGastos ?? []} />
        <IngresosDonutChart ingresos={allIngresos ?? []} />
      </div>
      <GastosIngresosLineChart
        gastos={allGastos ?? []}
        ingresos={allIngresos ?? []}
      />
    </div>
  );
}
