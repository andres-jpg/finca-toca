import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

function trend(current: number, previous: number) {
  if (previous === 0) return current > 0 ? "+100%" : "—";
  const pct = ((current - previous) / previous) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

export default async function DashboardPage() {
  // Verificar permisos: solo admin y viewer pueden acceder
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
    supabase
      .from("gastos")
      .select("valor")
      .gte("fecha", current.start)
      .lte("fecha", current.end),
    supabase
      .from("gastos")
      .select("valor")
      .gte("fecha", last.start)
      .lte("fecha", last.end),
    supabase
      .from("ingresos")
      .select("valor")
      .gte("fecha", current.start)
      .lte("fecha", current.end),
    supabase
      .from("ingresos")
      .select("valor")
      .gte("fecha", last.start)
      .lte("fecha", last.end),
    supabase
      .from("gastos")
      .select("fecha, concepto, valor")
      .order("fecha", { ascending: true }),
    supabase
      .from("ingresos")
      .select("fecha, concepto, valor")
      .order("fecha", { ascending: true }),
    getLitrosDiaActual(),
    getLitrosMesActual(),
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
    <div className="space-y-4 sm:space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-gray-500">
              Gastos este mes
            </CardTitle>
            <TrendingDown className="h-4 w-4 sm:h-5 sm:w-5 text-red-500 shrink-0" />
          </CardHeader>
          <CardContent>
            <p className="text-xl sm:text-2xl font-bold truncate">
              $
              {totalGastos.toLocaleString("es-AR", {
                minimumFractionDigits: 2,
              })}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              vs. mes anterior: {trend(totalGastos, lastGastos)}
            </p>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-gray-500">
              Ingresos este mes
            </CardTitle>
            <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 shrink-0" />
          </CardHeader>
          <CardContent>
            <p className="text-xl sm:text-2xl font-bold truncate">
              $
              {totalIngresos.toLocaleString("es-AR", {
                minimumFractionDigits: 2,
              })}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              vs. mes anterior: {trend(totalIngresos, lastIngresos)}
            </p>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-gray-500">
              Leche hoy
            </CardTitle>
            <Droplets className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500 shrink-0" />
          </CardHeader>
          <CardContent>
            <p className="text-xl sm:text-2xl font-bold">
              {litrosDia.toFixed(1)} L
            </p>
            <p className="text-xs text-gray-500 mt-1">Litros extraídos hoy</p>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-gray-500">
              Leche este mes
            </CardTitle>
            <Milk className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 shrink-0" />
          </CardHeader>
          <CardContent>
            <p className="text-xl sm:text-2xl font-bold">
              {litrosMes.toFixed(1)} L
            </p>
            <p className="text-xs text-gray-500 mt-1">Total del mes</p>
          </CardContent>
        </Card>
      </div>

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
