import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { checkRoutePermission } from "@/lib/auth/check-permissions";
import { Droplets, DollarSign, Building2, TrendingUp } from "lucide-react";
import { DashboardFilter } from "@/components/dashboard/dashboard-filter";
import dynamic from "next/dynamic";

const RecoleccionesTrendChart = dynamic(() =>
  import("@/charts/recolecciones-trend-chart").then((m) => m.RecoleccionesTrendChart)
);
const LitrosPorRutaChart = dynamic(() =>
  import("@/charts/litros-por-ruta-chart").then((m) => m.LitrosPorRutaChart)
);
const LitrosPorFincaChart = dynamic(() =>
  import("@/charts/litros-por-finca-chart").then((m) => m.LitrosPorFincaChart)
);
const GastosCooperativaChart = dynamic(() =>
  import("@/charts/gastos-cooperativa-chart").then((m) => m.GastosCooperativaChart)
);

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
  await checkRoutePermission(["cooperativa_admin"]);

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

  async function fetchRecMes() {
    const PAGE = 1000;
    const all: any[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("recolecciones")
        .select("litros, precio_litro, fecha, fincas_cooperativa(nombre, rutas_fincas(rutas_cooperativa(nombre)))")
        .gte("fecha", start)
        .lte("fecha", end)
        .range(from, from + PAGE - 1);
      if (error || !data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return all;
  }

  async function fetchAllRec() {
    const PAGE = 1000;
    const all: any[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("recolecciones")
        .select("fecha, litros, precio_litro")
        .order("fecha", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error || !data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return all;
  }

  const [
    registros,
    allRecData,
    { data: fincasActivas },
    { data: rutasData },
  ] = await Promise.all([
    fetchRecMes(),
    fetchAllRec(),
    supabase.from("fincas_cooperativa").select("id").eq("activa", true),
    supabase.from("rutas_cooperativa").select("id, nombre").order("nombre", { ascending: true }),
  ]);

  // KPIs del mes
  const totalLitros = registros.reduce((s, r: any) => s + Number(r.litros), 0);
  const totalValor = registros.reduce(
    (s, r: any) => s + Number(r.litros) * Number(r.precio_litro),
    0
  );

  // Quincenas y aportación Fedegan (0.75%)
  const APORTACION_PCT = 0.0075;
  const q1Registros = registros.filter((r: any) => parseInt(r.fecha.split("-")[2]) <= 15);
  const q2Registros = registros.filter((r: any) => parseInt(r.fecha.split("-")[2]) > 15);
  const quincenas = {
    q1Litros: q1Registros.reduce((s: number, r: any) => s + Number(r.litros), 0),
    q1Valor: q1Registros.reduce((s: number, r: any) => s + Number(r.litros) * Number(r.precio_litro), 0),
    q2Litros: q2Registros.reduce((s: number, r: any) => s + Number(r.litros), 0),
    q2Valor: q2Registros.reduce((s: number, r: any) => s + Number(r.litros) * Number(r.precio_litro), 0),
  };
  const q1Aportacion = quincenas.q1Valor * APORTACION_PCT;
  const q2Aportacion = quincenas.q2Valor * APORTACION_PCT;
  const fincasActivasCount = (fincasActivas ?? []).length;
  const rutasCount = (rutasData ?? []).length;
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

  // Litros por finca (con rutas para filtrado en el chart)
  const fincaDataMap = new Map<string, { litros: number; rutas: Set<string> }>();
  registros.forEach((r: any) => {
    const finca = Array.isArray(r.fincas_cooperativa)
      ? r.fincas_cooperativa[0]
      : r.fincas_cooperativa;
    const nombre = finca?.nombre ?? "Desconocida";
    const entry = fincaDataMap.get(nombre) ?? { litros: 0, rutas: new Set<string>() };
    entry.litros += Number(r.litros);
    const rutasFincas = finca?.rutas_fincas;
    const rfList: any[] = Array.isArray(rutasFincas) ? rutasFincas : rutasFincas ? [rutasFincas] : [];
    rfList.forEach((rf: any) => {
      const rutaObj = Array.isArray(rf.rutas_cooperativa) ? rf.rutas_cooperativa[0] : rf.rutas_cooperativa;
      if (rutaObj?.nombre) entry.rutas.add(rutaObj.nombre);
    });
    fincaDataMap.set(nombre, entry);
  });
  const litrosPorFinca = Array.from(fincaDataMap.entries()).map(([finca, d]) => ({
    finca,
    litros: d.litros,
    rutas: Array.from(d.rutas),
  }));

  // Datos para el trend chart (todos los registros históricos para el mes actual)
  const trendData = allRecData.map((r: any) => ({
    fecha: r.fecha as string,
    litros: Number(r.litros),
  }));

  // Datos para el chart de gastos mensuales (histórico completo)
  const gastosData = allRecData.map((r: any) => ({
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
          <div className="mt-3 pt-3 border-t border-stone-100 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-stone-400">Q1</span>
              <span className="text-xs text-stone-500">
                {quincenas.q1Litros.toLocaleString("es-CO", { minimumFractionDigits: 1 })} L
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-stone-400">Q2</span>
              <span className="text-xs text-stone-500">
                {quincenas.q2Litros.toLocaleString("es-CO", { minimumFractionDigits: 1 })} L
              </span>
            </div>
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
          <div className="mt-3 pt-3 border-t border-stone-100 space-y-1.5">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-stone-400">Compra Q1</span>
                <span className="text-xs text-stone-500">
                  {quincenas.q1Litros.toLocaleString("es-CO", { minimumFractionDigits: 1 })} L · ${quincenas.q1Valor.toLocaleString("es-CO", { minimumFractionDigits: 0 })}
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
                <span className="text-xs text-stone-400">Compra Q2</span>
                <span className="text-xs text-stone-500">
                  {quincenas.q2Litros.toLocaleString("es-CO", { minimumFractionDigits: 1 })} L · ${quincenas.q2Valor.toLocaleString("es-CO", { minimumFractionDigits: 0 })}
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
          <div className="mt-3 pt-3 border-t border-stone-100 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-stone-400">Con recolección este mes</span>
              <span className="text-xs text-stone-500">{fincasConRecoleccion}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-stone-400">Rutas activas</span>
              <span className="text-xs text-stone-500">{rutasCount}</span>
            </div>
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
        <LitrosPorFincaChart data={litrosPorFinca} rutas={rutasData ?? []} />
      </div>

      <GastosCooperativaChart data={gastosData} />
    </div>
  );
}
