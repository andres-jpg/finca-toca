import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { checkRoutePermission } from "@/lib/auth/check-permissions";
import { Droplets, DollarSign, Building2, TrendingUp } from "lucide-react";
import { DashboardFilter } from "@/components/dashboard/dashboard-filter";
import { RecoleccionesTrendChart } from "@/charts/recolecciones-trend-chart";
import { LitrosPorRutaChart } from "@/charts/litros-por-ruta-chart";
import { LitrosPorFincaChart } from "@/charts/litros-por-finca-chart";
import { GastosCooperativaChart } from "@/charts/gastos-cooperativa-chart";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function getMonthRange(year: number, month: number) {
  const start = formatDate(new Date(year, month - 1, 1));
  const end = formatDate(new Date(year, month, 0));
  return { start, end };
}

export default async function CooperativaDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; anio?: string }>;
}) {
  await checkRoutePermission(["admin", "cooperativa_admin"]);

  const params = await searchParams;
  const now = new Date();

  const hasFilter = Boolean(params.mes && params.anio);
  const effectiveMes = hasFilter
    ? Math.min(12, Math.max(1, parseInt(params.mes!)))
    : now.getMonth() + 1;
  const effectiveAnio = hasFilter ? parseInt(params.anio!) : now.getFullYear();

  const { start, end } = getMonthRange(effectiveAnio, effectiveMes);
  const mesLabel = `${MESES[effectiveMes - 1]} ${effectiveAnio}`;

  const supabase = await createClient();

  const [
    { data: recMes },
    { data: fincasActivas },
    { data: allRec },
  ] = await Promise.all([
    supabase
      .from("recolecciones")
      .select(
        "litros, precio_litro, fecha, fincas_cooperativa(nombre, rutas_fincas(rutas_cooperativa(nombre)))"
      )
      .gte("fecha", start)
      .lte("fecha", end),
    supabase
      .from("fincas_cooperativa")
      .select("id")
      .eq("activa", true),
    supabase
      .from("recolecciones")
      .select("fecha, litros, precio_litro")
      .order("fecha", { ascending: true }),
  ]);

  const registros = recMes ?? [];

  // KPIs del mes
  const totalLitros = registros.reduce((s, r: any) => s + Number(r.litros), 0);
  const totalValor = registros.reduce(
    (s, r: any) => s + Number(r.litros) * Number(r.precio_litro),
    0
  );
  const fincasActivasCount = (fincasActivas ?? []).length;
  const fincasConRecoleccion = new Set(
    registros.map((r: any) => {
      const f = Array.isArray(r.fincas_cooperativa)
        ? r.fincas_cooperativa[0]
        : r.fincas_cooperativa;
      return f?.nombre;
    })
  ).size;
  const promedioPorFinca =
    fincasConRecoleccion > 0 ? totalLitros / fincasConRecoleccion : 0;

  // Litros por ruta
  const rutaMap = new Map<string, number>();
  registros.forEach((r: any) => {
    const finca = Array.isArray(r.fincas_cooperativa)
      ? r.fincas_cooperativa[0]
      : r.fincas_cooperativa;
    const rutasFincas = finca?.rutas_fincas;
    const rutas: any[] = Array.isArray(rutasFincas)
      ? rutasFincas
      : rutasFincas
      ? [rutasFincas]
      : [];
    if (rutas.length === 0) {
      const key = "Sin ruta";
      rutaMap.set(key, (rutaMap.get(key) ?? 0) + Number(r.litros));
    } else {
      rutas.forEach((rf: any) => {
        const rutaObj = Array.isArray(rf.rutas_cooperativa)
          ? rf.rutas_cooperativa[0]
          : rf.rutas_cooperativa;
        const rutaNombre = rutaObj?.nombre ?? "Sin ruta";
        rutaMap.set(rutaNombre, (rutaMap.get(rutaNombre) ?? 0) + Number(r.litros));
      });
    }
  });
  const litrosPorRuta = Array.from(rutaMap.entries()).map(([ruta, litros]) => ({
    ruta,
    litros,
  }));

  // Litros por finca
  const fincaMap = new Map<string, number>();
  registros.forEach((r: any) => {
    const finca = Array.isArray(r.fincas_cooperativa)
      ? r.fincas_cooperativa[0]
      : r.fincas_cooperativa;
    const nombre = finca?.nombre ?? "Desconocida";
    fincaMap.set(nombre, (fincaMap.get(nombre) ?? 0) + Number(r.litros));
  });
  const litrosPorFinca = Array.from(fincaMap.entries()).map(([finca, litros]) => ({
    finca,
    litros,
  }));

  // Datos para el trend chart (todos los registros históricos para el mes actual)
  const trendData = (allRec ?? []).map((r: any) => ({
    fecha: r.fecha as string,
    litros: Number(r.litros),
  }));

  // Datos para el chart de gastos mensuales (histórico completo)
  const gastosData = (allRec ?? []).map((r: any) => ({
    fecha: r.fecha as string,
    litros: Number(r.litros),
    precio_litro: Number(r.precio_litro),
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
            Toca Lácteos
          </h1>
          <p className="text-sm text-stone-500 mt-0.5">
            {hasFilter ? mesLabel : "Resumen del mes actual"}
          </p>
        </div>
        <DashboardFilter
          hasFilter={hasFilter}
          mes={effectiveMes}
          anio={effectiveAnio}
        />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Total litros */}
        <div className="bg-white rounded-xl border border-stone-200 p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wide">
                Litros recolectados
              </p>
              <p className="text-2xl font-bold text-stone-900 mt-1.5">
                {totalLitros.toLocaleString("es-CO", { minimumFractionDigits: 1 })}{" "}
                <span className="text-base font-medium text-stone-400">L</span>
              </p>
            </div>
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ml-3"
              style={{ backgroundColor: "#f0fdfa" }}
            >
              <Droplets className="h-5 w-5" style={{ color: "#0d9488" }} />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-stone-100">
            <span className="text-xs text-stone-400">{mesLabel}</span>
          </div>
        </div>

        {/* Total valor */}
        <div className="bg-white rounded-xl border border-stone-200 p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wide">
                Valor comprado
              </p>
              <p className="text-2xl font-bold mt-1.5" style={{ color: "#0d9488" }}>
                ${totalValor.toLocaleString("es-CO", { minimumFractionDigits: 0 })}
              </p>
            </div>
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ml-3"
              style={{ backgroundColor: "#f0fdfa" }}
            >
              <DollarSign className="h-5 w-5" style={{ color: "#0d9488" }} />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-stone-100">
            <span className="text-xs text-stone-400">Total pagado a fincas</span>
          </div>
        </div>

        {/* Fincas activas */}
        <div className="bg-white rounded-xl border border-stone-200 p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wide">
                Fincas activas
              </p>
              <p className="text-2xl font-bold text-stone-900 mt-1.5">
                {fincasActivasCount}
              </p>
            </div>
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ml-3"
              style={{ backgroundColor: "#f0fdfa" }}
            >
              <Building2 className="h-5 w-5" style={{ color: "#0d9488" }} />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-stone-100">
            <span className="text-xs text-stone-400">
              {fincasConRecoleccion} con recolección este mes
            </span>
          </div>
        </div>

        {/* Promedio por finca */}
        <div className="bg-white rounded-xl border border-stone-200 p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wide">
                Promedio por finca
              </p>
              <p className="text-2xl font-bold text-stone-900 mt-1.5">
                {promedioPorFinca.toLocaleString("es-CO", { minimumFractionDigits: 1 })}{" "}
                <span className="text-base font-medium text-stone-400">L</span>
              </p>
            </div>
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ml-3"
              style={{ backgroundColor: "#f0fdfa" }}
            >
              <TrendingUp className="h-5 w-5" style={{ color: "#0d9488" }} />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-stone-100">
            <span className="text-xs text-stone-400">Litros promedio por finca</span>
          </div>
        </div>
      </div>

      {/* Charts */}
      <RecoleccionesTrendChart
        data={trendData}
        mes={effectiveMes}
        anio={effectiveAnio}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <LitrosPorRutaChart data={litrosPorRuta} />
        <LitrosPorFincaChart data={litrosPorFinca} />
      </div>

      <GastosCooperativaChart data={gastosData} />
    </div>
  );
}
