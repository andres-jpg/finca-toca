import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Droplets, TrendingDown, TrendingUp } from "lucide-react";

function getCurrentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
  return { start, end };
}

function getLastMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split("T")[0];
  const end = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split("T")[0];
  return { start, end };
}

export default async function StatsPage() {
  const supabase = await createClient();
  const current = getCurrentMonthRange();
  const last = getLastMonthRange();

  const [
    { data: milkingsCurr },
    { data: milkingsLast },
    { data: gastosCurr },
    { data: gastosLast },
    { data: ingresos_curr },
    { data: ingresosLast },
  ] = await Promise.all([
    supabase.from("milkings").select("liters").gte("date", current.start).lte("date", current.end),
    supabase.from("milkings").select("liters").gte("date", last.start).lte("date", last.end),
    supabase.from("gastos").select("valor").gte("fecha", current.start).lte("fecha", current.end),
    supabase.from("gastos").select("valor").gte("fecha", last.start).lte("fecha", last.end),
    supabase.from("ingresos").select("valor").gte("fecha", current.start).lte("fecha", current.end),
    supabase.from("ingresos").select("valor").gte("fecha", last.start).lte("fecha", last.end),
  ]);

  const totalLiters = (milkingsCurr ?? []).reduce((s: number, r: { liters: number }) => s + r.liters, 0);
  const lastLiters = (milkingsLast ?? []).reduce((s: number, r: { liters: number }) => s + r.liters, 0);

  const totalGastos = (gastosCurr ?? []).reduce((s: number, r: { valor: number }) => s + r.valor, 0);
  const lastGastos = (gastosLast ?? []).reduce((s: number, r: { valor: number }) => s + r.valor, 0);

  const totalIngresos = (ingresos_curr ?? []).reduce((s: number, r: { valor: number }) => s + r.valor, 0);
  const lastIngresos = (ingresosLast ?? []).reduce((s: number, r: { valor: number }) => s + r.valor, 0);

  function trend(current: number, previous: number) {
    if (previous === 0) return current > 0 ? "+100%" : "—";
    const pct = ((current - previous) / previous) * 100;
    return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-gray-500">Litros este mes</CardTitle>
          <Droplets className="h-5 w-5 text-blue-500" />
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{totalLiters.toFixed(1)}</p>
          <p className="text-xs text-gray-500 mt-1">vs. mes anterior: {trend(totalLiters, lastLiters)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-gray-500">Gastos este mes</CardTitle>
          <TrendingDown className="h-5 w-5 text-red-500" />
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">${totalGastos.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-gray-500 mt-1">vs. mes anterior: {trend(totalGastos, lastGastos)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-gray-500">Ingresos este mes</CardTitle>
          <TrendingUp className="h-5 w-5 text-green-500" />
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">${totalIngresos.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-gray-500 mt-1">vs. mes anterior: {trend(totalIngresos, lastIngresos)}</p>
        </CardContent>
      </Card>
    </div>
  );
}
