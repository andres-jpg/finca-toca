import { createClient } from "@/lib/supabase/server";
import { GastosInbresosBarChart } from "@/charts/gastos-ingresos-bar-chart";
import { GastosDonutChart } from "@/charts/gastos-donut-chart";

export default async function ChartsPage() {
  const supabase = await createClient();

  const [{ data: gastos }, { data: ingresos }] = await Promise.all([
    supabase
      .from("gastos")
      .select("fecha, concepto, valor")
      .order("fecha", { ascending: true }),
    supabase
      .from("ingresos")
      .select("fecha, valor")
      .order("fecha", { ascending: true }),
  ]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <GastosInbresosBarChart gastos={gastos ?? []} ingresos={ingresos ?? []} />
      <GastosDonutChart gastos={gastos ?? []} />
    </div>
  );
}
