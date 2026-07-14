import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { fetchAllRecolecciones, MESES } from "@/lib/cooperativa/recolecciones";
import { ordenarFincasPorItinerario } from "@/lib/cooperativa/orden-rutas";
import { getFedeganPct } from "@/lib/cooperativa/fedegan";

export type InformeTipo = "finca" | "ruta" | "itinerario" | "general";

// Query params compartidos por el export Excel y el preview JSON — mismos filtros,
// misma validación, para garantizar que ambos flujos parten de los mismos datos.
export const informeQuerySchema = z
  .object({
    tipo: z.enum(["finca", "ruta", "itinerario", "general"]),
    id: z.coerce.number().int().positive().optional(),
    // Modo quincena
    quincena: z.enum(["1", "2"]).optional(),
    mes: z.coerce.number().int().min(1).max(12).optional(),
    anio: z.coerce.number().int().min(2000).max(2100).optional(),
    // Modo rango libre
    fechaDesde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    fechaHasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine((d) => d.tipo === "general" || d.id !== undefined, {
    message: "id requerido para tipo finca, ruta o itinerario",
  })
  .refine(
    (d) => {
      const hasQuincena = d.quincena !== undefined && d.mes !== undefined && d.anio !== undefined;
      const hasCustom = d.fechaDesde !== undefined && d.fechaHasta !== undefined;
      return hasQuincena || hasCustom;
    },
    { message: "Se requiere quincena+mes+anio o fechaDesde+fechaHasta" },
  );

export class InformeDataError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type InformePeriodoParams = {
  quincena?: "1" | "2";
  mes?: number;
  anio?: number;
  fechaDesde?: string;
  fechaHasta?: string;
};

export type InformePeriodo = {
  startDate: string;
  endDate: string;
  periodoLabel: string;
  isSameMonth: boolean;
  dates: string[];
  dayLabels: (number | string)[];
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// Genera todas las fechas ISO entre start y end (inclusive)
function generateDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const cur = new Date(sy, sm - 1, sd);
  const endD = new Date(ey, em - 1, ed);
  while (cur <= endD) {
    dates.push(
      `${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`,
    );
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

export function resolveInformePeriodo(params: InformePeriodoParams): InformePeriodo {
  const { quincena, mes, anio, fechaDesde, fechaHasta } = params;

  let startDate: string;
  let endDate: string;
  let periodoLabel: string;
  let isSameMonth: boolean;

  if (quincena && mes !== undefined && anio !== undefined) {
    const lastDay = new Date(anio, mes, 0).getDate();
    const startDay = quincena === "1" ? 1 : 16;
    const endDay = quincena === "1" ? 15 : lastDay;
    startDate = `${anio}-${pad(mes)}-${pad(startDay)}`;
    endDate = `${anio}-${pad(mes)}-${pad(endDay)}`;
    periodoLabel = `Q${quincena} ${MESES[mes - 1]} ${anio}`;
    isSameMonth = true;
  } else {
    startDate = fechaDesde!;
    endDate = fechaHasta!;
    const [sy, sm] = startDate.split("-").map(Number);
    const [ey, em] = endDate.split("-").map(Number);
    isSameMonth = sy === ey && sm === em;
    periodoLabel = `${startDate} a ${endDate}`;
  }

  const dates = generateDates(startDate, endDate);
  const dayLabels: (number | string)[] = dates.map((iso) => {
    const parts = iso.split("-");
    const d = parseInt(parts[2]);
    const m = parseInt(parts[1]);
    return isSameMonth ? d : `${pad(d)}/${pad(m)}`;
  });

  return { startDate, endDate, periodoLabel, isSameMonth, dates, dayLabels };
}

export type InformeFilaSimple = {
  fincaId: number;
  nombre: string;
  dias: number[];
  precioLitro: number;
  totalLitros: number;
  precioBruto: number;
  desFedegan: number;
  precioNeto: number;
};

export type InformeFilaItinerario = InformeFilaSimple & { rutaNombre: string | null };

export type InformeTotales = {
  dias: number[];
  totalLitros: number;
  precioBruto: number;
  desFedegan: number;
  precioNeto: number;
};

export type InformeSimpleData = {
  kind: "finca" | "ruta";
  periodoLabel: string;
  dayLabels: (number | string)[];
  filas: InformeFilaSimple[];
  totales: InformeTotales;
};

export type InformeItinerarioData = {
  kind: "itinerario";
  itinerarioNombre: string | null;
  conductorName: string | null;
  periodoLabel: string;
  dayLabels: (number | string)[];
  filas: InformeFilaItinerario[];
  totales: InformeTotales;
};

export type InformeRutaSeccion = {
  id: number;
  nombre: string;
  filas: InformeFilaSimple[];
  subtotales: InformeTotales;
};

export type InformeGeneralData = {
  kind: "general";
  periodoLabel: string;
  dayLabels: (number | string)[];
  rutas: InformeRutaSeccion[];
  granTotales: InformeTotales;
};

export type InformeData = InformeSimpleData | InformeItinerarioData | InformeGeneralData;

type FincaInfo = {
  id: number;
  nombre: string;
  precio_litro: number;
  ruta_nombre?: string | null;
};

type DayRec = { litros: number; precio_litro: number };

function emptyTotales(numDates: number): InformeTotales {
  return { dias: new Array(numDates).fill(0), totalLitros: 0, precioBruto: 0, desFedegan: 0, precioNeto: 0 };
}

function buildFilaSimple(
  finca: FincaInfo,
  recMap: Map<number, Map<string, DayRec>>,
  dates: string[],
  fedeganRutaNombre: string | null | undefined,
): InformeFilaSimple {
  const dayMap = recMap.get(finca.id) ?? new Map<string, DayRec>();
  const dias = dates.map((iso) => dayMap.get(iso)?.litros ?? 0);
  const totalLitros = dias.reduce((s, v) => s + v, 0);
  const precioBrutoRaw = dates.reduce((s, iso) => {
    const rec = dayMap.get(iso);
    return s + (rec ? rec.litros * rec.precio_litro : 0);
  }, 0);
  const precioBruto = Math.round(precioBrutoRaw);
  const desFedegan = Math.round(precioBrutoRaw * getFedeganPct(fedeganRutaNombre));
  const precioNeto = precioBruto - desFedegan;

  return {
    fincaId: finca.id,
    nombre: finca.nombre,
    dias,
    precioLitro: finca.precio_litro,
    totalLitros,
    precioBruto,
    desFedegan,
    precioNeto,
  };
}

function acumularTotales(totales: InformeTotales, fuente: InformeTotales) {
  fuente.dias.forEach((v, i) => {
    totales.dias[i] += v;
  });
  totales.totalLitros += fuente.totalLitros;
  totales.precioBruto += fuente.precioBruto;
  totales.desFedegan += fuente.desFedegan;
  totales.precioNeto += fuente.precioNeto;
}

async function resolveFincasFinca(supabase: SupabaseClient, id: number): Promise<FincaInfo[]> {
  const { data, error } = await supabase
    .from("fincas_cooperativa")
    .select("id, nombre, precio_litro, rutas_fincas(rutas_cooperativa(nombre))")
    .eq("id", id)
    .single();
  if (error || !data) throw new InformeDataError("Finca no encontrada", 404);
  const rfRaw = data.rutas_fincas;
  const rfArr: any[] = Array.isArray(rfRaw) ? rfRaw : rfRaw ? [rfRaw] : [];
  const rutaRaw = rfArr[0]?.rutas_cooperativa;
  const rutaNombreFinca: string | null = rutaRaw
    ? Array.isArray(rutaRaw)
      ? (rutaRaw[0]?.nombre ?? null)
      : (rutaRaw.nombre ?? null)
    : null;
  return [
    {
      id: data.id,
      nombre: data.nombre,
      precio_litro: Number(data.precio_litro),
      ruta_nombre: rutaNombreFinca,
    },
  ];
}

async function resolveFincasRuta(supabase: SupabaseClient, id: number): Promise<FincaInfo[]> {
  const { data, error } = await supabase
    .from("rutas_cooperativa")
    .select(
      "nombre, rutas_fincas(orden, fincas_cooperativa(id, nombre, precio_litro, itinerarios_fincas(orden, itinerario_id)))",
    )
    .eq("id", id)
    .single();
  if (error || !data) throw new InformeDataError("Ruta no encontrada", 404);
  const rfList: any[] = Array.isArray(data.rutas_fincas) ? data.rutas_fincas : [];
  const fincasConItinerario = rfList
    .map((rf: any) => {
      const f = Array.isArray(rf.fincas_cooperativa) ? rf.fincas_cooperativa[0] : rf.fincas_cooperativa;
      if (!f) return null;
      const itList: any[] = Array.isArray(f.itinerarios_fincas)
        ? f.itinerarios_fincas
        : f.itinerarios_fincas
          ? [f.itinerarios_fincas]
          : [];
      return {
        id: f.id,
        nombre: f.nombre,
        precio_litro: Number(f.precio_litro),
        ruta_nombre: data.nombre,
        rutaOrden: rf.orden ?? 0,
        itinerarioId: itList[0]?.itinerario_id ?? null,
        itinerarioOrden: itList[0]?.orden ?? 0,
      };
    })
    .filter(Boolean) as ((FincaInfo & { rutaOrden: number; itinerarioId: number | null; itinerarioOrden: number })[]);
  return ordenarFincasPorItinerario(fincasConItinerario, data.nombre);
}

async function resolveFincasItinerario(
  supabase: SupabaseClient,
  id: number,
): Promise<{ fincas: FincaInfo[]; itinerarioNombre: string | null; conductorName: string | null }> {
  const [itResult, usersResult] = await Promise.all([
    supabase
      .from("itinerarios")
      .select(
        "nombre, itinerarios_fincas(orden, fincas_cooperativa(id, nombre, precio_litro, rutas_fincas(rutas_cooperativa(nombre))))",
      )
      .eq("id", id)
      .single(),
    supabase.rpc("get_cooperativa_users"),
  ]);
  if (itResult.error || !itResult.data) throw new InformeDataError("Itinerario no encontrado", 404);
  const data = itResult.data;
  const itinerarioNombre = data.nombre;
  const ifList: any[] = Array.isArray(data.itinerarios_fincas) ? data.itinerarios_fincas : [];
  const fincas = ifList
    .sort((a: any, b: any) => (a.orden ?? 0) - (b.orden ?? 0))
    .map((itF: any) => {
      const f = Array.isArray(itF.fincas_cooperativa) ? itF.fincas_cooperativa[0] : itF.fincas_cooperativa;
      if (!f) return null;
      const rutasFincasRaw = f.rutas_fincas;
      const rutasFincas: any[] = Array.isArray(rutasFincasRaw) ? rutasFincasRaw : rutasFincasRaw ? [rutasFincasRaw] : [];
      const primeraRuta = rutasFincas[0]?.rutas_cooperativa;
      const rutaNombre: string | null = primeraRuta
        ? Array.isArray(primeraRuta)
          ? (primeraRuta[0]?.nombre ?? null)
          : (primeraRuta.nombre ?? null)
        : null;
      return {
        id: f.id,
        nombre: f.nombre,
        precio_litro: Number(f.precio_litro),
        ruta_nombre: rutaNombre,
      };
    })
    .filter(Boolean) as FincaInfo[];
  const conductores = (usersResult.data ?? [])
    .filter((u: any) => u.itinerario_id === id)
    .map((u: any) => u.email as string);
  return { fincas, itinerarioNombre, conductorName: conductores[0] ?? null };
}

async function buildInformeGeneral(
  supabase: SupabaseClient,
  periodo: InformePeriodo,
): Promise<InformeGeneralData> {
  const { data: rutasRaw, error: rutasErr } = await supabase
    .from("rutas_cooperativa")
    .select("id, nombre, rutas_fincas(orden, fincas_cooperativa(id, nombre, precio_litro, itinerarios_fincas(orden, itinerario_id)))")
    .order("nombre");

  if (rutasErr) throw new InformeDataError("Error al obtener rutas", 500);

  type RutaSection = { id: number; nombre: string; fincas: FincaInfo[] };

  const rutas: RutaSection[] = (rutasRaw ?? [])
    .map((r: any) => {
      const rfList: any[] = Array.isArray(r.rutas_fincas) ? r.rutas_fincas : [];
      const fincasConItinerario = rfList
        .map((rf: any) => {
          const f = Array.isArray(rf.fincas_cooperativa) ? rf.fincas_cooperativa[0] : rf.fincas_cooperativa;
          if (!f) return null;
          const itList: any[] = Array.isArray(f.itinerarios_fincas)
            ? f.itinerarios_fincas
            : f.itinerarios_fincas
              ? [f.itinerarios_fincas]
              : [];
          return {
            id: f.id,
            nombre: f.nombre,
            precio_litro: Number(f.precio_litro),
            rutaOrden: rf.orden ?? 0,
            itinerarioId: itList[0]?.itinerario_id ?? null,
            itinerarioOrden: itList[0]?.orden ?? 0,
          };
        })
        .filter(Boolean) as ((FincaInfo & { rutaOrden: number; itinerarioId: number | null; itinerarioOrden: number })[]);
      const fincasOrdenadas = ordenarFincasPorItinerario(fincasConItinerario, r.nombre);
      return { id: r.id, nombre: r.nombre, fincas: fincasOrdenadas };
    })
    .filter((r: RutaSection) => r.fincas.length > 0);

  if (rutas.length === 0) throw new InformeDataError("Sin rutas con fincas", 404);

  const allFincaIds = rutas.flatMap((r) => r.fincas.map((f) => f.id));
  const recsGen = await fetchAllRecolecciones(supabase, allFincaIds, periodo.startDate, periodo.endDate);

  const recMapGen = new Map<number, Map<string, DayRec>>();
  for (const rec of recsGen) {
    const fecha = rec.fecha as string;
    if (!recMapGen.has(rec.finca_id)) recMapGen.set(rec.finca_id, new Map());
    recMapGen.get(rec.finca_id)!.set(fecha, { litros: Number(rec.litros), precio_litro: Number(rec.precio_litro) });
  }

  const granTotales = emptyTotales(periodo.dates.length);
  const rutasSecciones: InformeRutaSeccion[] = rutas.map((ruta) => {
    const subtotales = emptyTotales(periodo.dates.length);
    const filas = ruta.fincas.map((finca) => {
      const fila = buildFilaSimple(finca, recMapGen, periodo.dates, ruta.nombre);
      acumularTotales(subtotales, fila);
      return fila;
    });
    acumularTotales(granTotales, subtotales);
    return { id: ruta.id, nombre: ruta.nombre, filas, subtotales };
  });

  return { kind: "general", periodoLabel: periodo.periodoLabel, dayLabels: periodo.dayLabels, rutas: rutasSecciones, granTotales };
}

async function buildInformeItinerario(
  supabase: SupabaseClient,
  id: number,
  periodo: InformePeriodo,
): Promise<InformeItinerarioData> {
  const { fincas, itinerarioNombre, conductorName } = await resolveFincasItinerario(supabase, id);
  if (fincas.length === 0) throw new InformeDataError("Sin fincas para generar el informe", 404);

  const fincaIds = fincas.map((f) => f.id);
  const recs = await fetchAllRecolecciones(supabase, fincaIds, periodo.startDate, periodo.endDate);

  const recMap = new Map<number, Map<string, DayRec>>();
  for (const rec of recs) {
    const fecha = rec.fecha as string;
    if (!recMap.has(rec.finca_id)) recMap.set(rec.finca_id, new Map());
    recMap.get(rec.finca_id)!.set(fecha, { litros: Number(rec.litros), precio_litro: Number(rec.precio_litro) });
  }

  const totales = emptyTotales(periodo.dates.length);
  const filas: InformeFilaItinerario[] = fincas.map((finca) => {
    const fila = buildFilaSimple(finca, recMap, periodo.dates, finca.ruta_nombre);
    acumularTotales(totales, fila);
    return { ...fila, rutaNombre: finca.ruta_nombre ?? null };
  });

  return {
    kind: "itinerario",
    itinerarioNombre,
    conductorName,
    periodoLabel: periodo.periodoLabel,
    dayLabels: periodo.dayLabels,
    filas,
    totales,
  };
}

async function buildInformeSimple(
  supabase: SupabaseClient,
  tipo: "finca" | "ruta",
  id: number,
  periodo: InformePeriodo,
): Promise<InformeSimpleData> {
  const fincas = tipo === "finca" ? await resolveFincasFinca(supabase, id) : await resolveFincasRuta(supabase, id);
  if (fincas.length === 0) throw new InformeDataError("Sin fincas para generar el informe", 404);

  const fincaIds = fincas.map((f) => f.id);
  const recolecciones = await fetchAllRecolecciones(supabase, fincaIds, periodo.startDate, periodo.endDate);

  const recMap = new Map<number, Map<string, DayRec>>();
  for (const rec of recolecciones) {
    const fecha = rec.fecha as string;
    if (!recMap.has(rec.finca_id)) recMap.set(rec.finca_id, new Map());
    recMap.get(rec.finca_id)!.set(fecha, { litros: Number(rec.litros), precio_litro: Number(rec.precio_litro) });
  }

  const totales = emptyTotales(periodo.dates.length);
  const filas = fincas.map((finca) => {
    const fila = buildFilaSimple(finca, recMap, periodo.dates, finca.ruta_nombre);
    acumularTotales(totales, fila);
    return fila;
  });

  return { kind: tipo, periodoLabel: periodo.periodoLabel, dayLabels: periodo.dayLabels, filas, totales };
}

export async function buildInformeData(
  supabase: SupabaseClient,
  tipo: InformeTipo,
  id: number | undefined,
  periodo: InformePeriodo,
): Promise<InformeData> {
  if (tipo === "general") return buildInformeGeneral(supabase, periodo);
  if (tipo === "itinerario") return buildInformeItinerario(supabase, id!, periodo);
  return buildInformeSimple(supabase, tipo, id!, periodo);
}
