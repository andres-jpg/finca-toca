import { createClient } from "@/lib/supabase/server";
import { MilkingLineChart } from "@/charts/milking-line-chart";
import { GastosInbresosBarChart } from "@/charts/gastos-ingresos-bar-chart";
import { GastosDonutChart } from "@/charts/gastos-donut-chart";

export default async function ChartsPage() {
  const supabase = await createClient();

  // Last 30 days for milking chart
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const startDate = thirtyDaysAgo.toISOString().split("T")[0];

  const [{ data: milkings }, { data: gastos }, { data: ingresos }] = await Promise.all([
    supabase
      .from("milkings")
      .select("date, liters")
      .gte("date", startDate)
      .order("date", { ascending: true }),
    supabase.from("gastos").select("fecha, concepto, valor").order("fecha", { ascending: true }),
    supabase.from("ingresos").select("fecha, valor").order("fecha", { ascending: true }),
  ]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="lg:col-span-2">
        <MilkingLineChart data={milkings ?? []} />
      </div>
      <GastosInbresosBarChart gastos={gastos ?? []} ingresos={ingresos ?? []} />
      <GastosDonutChart gastos={gastos ?? []} />
    </div>
  );
}
