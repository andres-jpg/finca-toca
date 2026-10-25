import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { aLista, aUno } from "@/lib/supabase/relaciones";
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
  // null = sin registro ese día (conductor no pasó por la finca); 0 = registro con 0 litros
  dias: (number | null)[];
  precioLitro: number;
  totalLitros: number;
  precioBruto: number;
  desFedegan: number;
  // Porcentaje usado para desFedegan (0 para rutas exentas) — expuesto para que el
  // Excel pueda escribir la fórmula de Des. Fedegan con el mismo % por fila.
  fedeganPct: number;
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
  titulo: string;
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
  activa: boolean;
};

type DayRec = { litros: number; precio_litro: number };

// Fincas inactivas se excluyen del informe salvo que tengan al menos una
// extracción registrada dentro del rango — así no desaparece historial real,
// pero tampoco se listan fincas dadas de baja sin datos en el período.
function fincaTieneDatosEnRango(fincaId: number, recMap: Map<number, Map<string, DayRec>>): boolean {
  const dayMap = recMap.get(fincaId);
  return !!dayMap && dayMap.size > 0;
}

function filtrarFincasVisibles<T extends { id: number; activa: boolean }>(
  fincas: T[],
  recMap: Map<number, Map<string, DayRec>>,
): T[] {
  return fincas.filter((f) => f.activa || fincaTieneDatosEnRango(f.id, recMap));
}

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
  const dias = dates.map((iso) => dayMap.get(iso)?.litros ?? null);
  const totalLitros = dias.reduce((s: number, v) => s + (v ?? 0), 0);
  const precioBrutoRaw = dates.reduce((s, iso) => {
    const rec = dayMap.get(iso);
    return s + (rec ? rec.litros * rec.precio_litro : 0);
  }, 0);
  const fedeganPct = getFedeganPct(fedeganRutaNombre);
  const precioBruto = Math.round(precioBrutoRaw);
  const desFedegan = Math.round(precioBrutoRaw * fedeganPct);
  const precioNeto = precioBruto - desFedegan;

  return {
    fincaId: finca.id,
    nombre: finca.nombre,
    dias,
    precioLitro: finca.precio_litro,
    totalLitros,
    precioBruto,
    desFedegan,
    fedeganPct,
    precioNeto,
  };
}

function acumularTotales(
  totales: InformeTotales,
  fuente: { dias: (number | null)[]; totalLitros: number; precioBruto: number; desFedegan: number; precioNeto: number },
) {
  fuente.dias.forEach((v, i) => {
    totales.dias[i] += v ?? 0;
  });
  totales.totalLitros += fuente.totalLitros;
  totales.precioBruto += fuente.precioBruto;
  totales.desFedegan += fuente.desFedegan;
  totales.precioNeto += fuente.precioNeto;
}

async function resolveFincasFinca(supabase: SupabaseClient<Database>, id: number): Promise<FincaInfo[]> {
  const { data, error } = await supabase
    .from("fincas_cooperativa")
    .select("id, nombre, precio_litro, activa, rutas_fincas(rutas_cooperativa(nombre))")
    .eq("id", id)
    .single();
  if (error || !data) throw new InformeDataError("Finca no encontrada", 404);
  const rutaNombreFinca: string | null = aUno(aUno(data.rutas_fincas)?.rutas_cooperativa)?.nombre ?? null;
  return [
    {
      id: data.id,
      nombre: data.nombre,
      precio_litro: Number(data.precio_litro),
      ruta_nombre: rutaNombreFinca,
      activa: data.activa,
    },
  ];
}

async function resolveFincasRuta(supabase: SupabaseClient<Database>, id: number): Promise<FincaInfo[]> {
  const { data, error } = await supabase
    .from("rutas_cooperativa")
    .select(
      "nombre, rutas_fincas(orden, fincas_cooperativa(id, nombre, precio_litro, activa, itinerarios_fincas(orden, itinerario_id)))",
    )
    .eq("id", id)
    .single();
  if (error || !data) throw new InformeDataError("Ruta no encontrada", 404);
  const fincasConItinerario = aLista(data.rutas_fincas).flatMap((rf) => {
    const f = aUno(rf.fincas_cooperativa);
    if (!f) return [];
    const it = aLista(f.itinerarios_fincas)[0];
    return [
      {
        id: f.id,
        nombre: f.nombre,
        precio_litro: Number(f.precio_litro),
        ruta_nombre: data.nombre,
        activa: f.activa,
        rutaOrden: rf.orden ?? 0,
        itinerarioId: it?.itinerario_id ?? null,
        itinerarioOrden: it?.orden ?? 0,
      },
    ];
  });
  return ordenarFincasPorItinerario(fincasConItinerario, data.nombre);
}

async function resolveFincasItinerario(
  supabase: SupabaseClient<Database>,
  id: number,
): Promise<{ fincas: FincaInfo[]; itinerarioNombre: string | null; conductorName: string | null }> {
  const [itResult, usersResult] = await Promise.all([
    supabase
      .from("itinerarios")
      .select(
        "nombre, itinerarios_fincas(orden, fincas_cooperativa(id, nombre, precio_litro, activa, rutas_fincas(rutas_cooperativa(nombre))))",
      )
      .eq("id", id)
      .single(),
    supabase.rpc("get_cooperativa_users"),
  ]);
  if (itResult.error || !itResult.data) throw new InformeDataError("Itinerario no encontrado", 404);
  const data = itResult.data;
  const itinerarioNombre = data.nombre;
  const fincas: FincaInfo[] = [...aLista(data.itinerarios_fincas)]
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    .flatMap((itF) => {
      const f = aUno(itF.fincas_cooperativa);
      if (!f) return [];
      return [
        {
          id: f.id,
          nombre: f.nombre,
          precio_litro: Number(f.precio_litro),
          ruta_nombre: aUno(aUno(f.rutas_fincas)?.rutas_cooperativa)?.nombre ?? null,
          activa: f.activa,
        },
      ];
    });
  const conductores = (usersResult.data ?? [])
    .filter((u) => u.itinerario_id === id)
    .map((u) => u.email as string);
  return { fincas, itinerarioNombre, conductorName: conductores[0] ?? null };
}

async function buildInformeGeneral(
  supabase: SupabaseClient<Database>,
  periodo: InformePeriodo,
): Promise<InformeGeneralData> {
  const { data: rutasRaw, error: rutasErr } = await supabase
    .from("rutas_cooperativa")
    .select("id, nombre, rutas_fincas(orden, fincas_cooperativa(id, nombre, precio_litro, activa, itinerarios_fincas(orden, itinerario_id)))")
    .order("nombre");

  if (rutasErr) throw new InformeDataError("Error al obtener rutas", 500);

  type RutaSection = { id: number; nombre: string; fincas: FincaInfo[] };

  const rutas: RutaSection[] = (rutasRaw ?? [])
    .map((r) => {
      const fincasConItinerario = aLista(r.rutas_fincas).flatMap((rf) => {
        const f = aUno(rf.fincas_cooperativa);
        if (!f) return [];
        const it = aLista(f.itinerarios_fincas)[0];
        return [
          {
            id: f.id,
            nombre: f.nombre,
            precio_litro: Number(f.precio_litro),
            activa: f.activa,
            rutaOrden: rf.orden ?? 0,
            itinerarioId: it?.itinerario_id ?? null,
            itinerarioOrden: it?.orden ?? 0,
          },
        ];
      });
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
  const rutasSecciones: InformeRutaSeccion[] = rutas
    .map((ruta) => {
      const fincasVisibles = filtrarFincasVisibles(ruta.fincas, recMapGen);
      const subtotales = emptyTotales(periodo.dates.length);
      const filas = fincasVisibles.map((finca) => {
        const fila = buildFilaSimple(finca, recMapGen, periodo.dates, ruta.nombre);
        acumularTotales(subtotales, fila);
        return fila;
      });
      acumularTotales(granTotales, subtotales);
      return { id: ruta.id, nombre: ruta.nombre, filas, subtotales };
    })
    .filter((r) => r.filas.length > 0);

  return { kind: "general", periodoLabel: periodo.periodoLabel, dayLabels: periodo.dayLabels, rutas: rutasSecciones, granTotales };
}

async function buildInformeItinerario(
  supabase: SupabaseClient<Database>,
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

  const fincasVisibles = filtrarFincasVisibles(fincas, recMap);
  const totales = emptyTotales(periodo.dates.length);
  const filas: InformeFilaItinerario[] = fincasVisibles.map((finca) => {
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
  supabase: SupabaseClient<Database>,
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

  const fincasVisibles = filtrarFincasVisibles(fincas, recMap);
  const totales = emptyTotales(periodo.dates.length);
  const filas = fincasVisibles.map((finca) => {
    const fila = buildFilaSimple(finca, recMap, periodo.dates, finca.ruta_nombre);
    acumularTotales(totales, fila);
    return fila;
  });

  const titulo = tipo === "finca" ? fincas[0].nombre : (fincas[0].ruta_nombre ?? "Ruta");

  return { kind: tipo, titulo, periodoLabel: periodo.periodoLabel, dayLabels: periodo.dayLabels, filas, totales };
}

export async function buildInformeData(
  supabase: SupabaseClient<Database>,
  tipo: InformeTipo,
  id: number | undefined,
  periodo: InformePeriodo,
): Promise<InformeData> {
  if (tipo === "general") return buildInformeGeneral(supabase, periodo);
  if (tipo === "itinerario") return buildInformeItinerario(supabase, id!, periodo);
  return buildInformeSimple(supabase, tipo, id!, periodo);
}
