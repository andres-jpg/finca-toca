import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingDown, TrendingUp } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { GastosDonutChart } from "@/charts/gastos-donut-chart";
import { IngresosDonutChart } from "@/charts/ingresos-donut-chart";
import { GastosIngresosLineChart } from "@/charts/gastos-ingresos-line-chart";

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

function trend(current: number, previous: number) {
  if (previous === 0) return current > 0 ? "+100%" : "—";
  const pct = ((current - previous) / previous) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

export default async function DashboardPage() {
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
  ] = await Promise.all([
    supabase.from("gastos").select("valor").gte("fecha", current.start).lte("fecha", current.end),
    supabase.from("gastos").select("valor").gte("fecha", last.start).lte("fecha", last.end),
    supabase.from("ingresos").select("valor").gte("fecha", current.start).lte("fecha", current.end),
    supabase.from("ingresos").select("valor").gte("fecha", last.start).lte("fecha", last.end),
    supabase.from("gastos").select("fecha, concepto, valor").order("fecha", { ascending: true }),
    supabase.from("ingresos").select("fecha, concepto, valor").order("fecha", { ascending: true }),
  ]);

  const totalGastos = (gastosCurr ?? []).reduce(
    (s: number, r: { valor: number }) => s + r.valor,
    0,
  );
  const lastGastos = (gastosLast ?? []).reduce(
    (s: number, r: { valor: number }) => s + r.valor,
    0,
  );
  const totalIngresos = (ingresosCurr ?? []).reduce(
    (s: number, r: { valor: number }) => s + r.valor,
    0,
  );
  const lastIngresos = (ingresosLast ?? []).reduce(
    (s: number, r: { valor: number }) => s + r.valor,
    0,
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Gastos este mes
            </CardTitle>
            <TrendingDown className="h-5 w-5 text-red-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              ${totalGastos.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              vs. mes anterior: {trend(totalGastos, lastGastos)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Ingresos este mes
            </CardTitle>
            <TrendingUp className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              ${totalIngresos.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              vs. mes anterior: {trend(totalIngresos, lastIngresos)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GastosDonutChart gastos={allGastos ?? []} />
        <IngresosDonutChart ingresos={allIngresos ?? []} />
      </div>
      <GastosIngresosLineChart gastos={allGastos ?? []} ingresos={allIngresos ?? []} />
    </div>
  );
}
