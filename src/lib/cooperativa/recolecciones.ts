import type { SupabaseClient } from "@supabase/supabase-js";

export const FEDEGAN_PCT = 0.0075;

export const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export type RecRow = {
  finca_id: number;
  fecha: string;
  litros: number;
  precio_litro: number;
};

export async function fetchAllRecolecciones(
  supabase: SupabaseClient,
  fincaIds: number[],
  start: string,
  end: string,
): Promise<RecRow[]> {
  const PAGE = 1000;
  const all: RecRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("recolecciones")
      .select("finca_id, fecha, litros, precio_litro")
      .in("finca_id", fincaIds)
      .gte("fecha", start)
      .lte("fecha", end)
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all.push(
      ...(data as RecRow[]).map((r) => ({
        ...r,
        litros: Number(r.litros),
        precio_litro: Number(r.precio_litro),
      })),
    );
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}
