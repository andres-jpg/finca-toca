import { createClienteInventario } from "../lib/cliente";
import type { TipoArticulo } from "../lib/inventario";
import type { MovimientoKardex, StockArticulo } from "../types";

// Módulo plano (no "use server"): solo lo llama código de servidor. La autorización es el RLS: un
// usuario sin membresía en el cliente actual recibe listas vacías.

/** Filas por página: el tope de PostgREST (`max_rows`) es 1000. */
const PAGINA = 1000;

/** Recorre una consulta con `.range()` hasta agotarla (ver *PostgREST row cap* en CLAUDE.md). */
async function leerTodo<T>(
  pagina: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  mensajeError: string,
): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await pagina(desde, desde + PAGINA - 1);
    if (error) throw new Error(mensajeError);
    filas.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGINA) return filas;
  }
}

export interface FiltrosStock {
  tipo?: TipoArticulo;
  /** Solo los que están por debajo de su mínimo (lo que alimenta la alerta). */
  soloBajoMinimo?: boolean;
  /** Por defecto solo los activos. */
  incluirInactivos?: boolean;
}

/** Stock actual por artículo (`v_stock`): la suma de sus movimientos, nunca un número guardado. */
export async function getStock(filtros: FiltrosStock = {}): Promise<StockArticulo[]> {
  const supabase = await createClienteInventario();
  return leerTodo<StockArticulo>(
    (desde, hasta) => {
      let consulta = supabase.from("v_stock").select("*");
      if (!filtros.incluirInactivos) consulta = consulta.eq("activo", true);
      if (filtros.tipo) consulta = consulta.eq("tipo", filtros.tipo);
      if (filtros.soloBajoMinimo) consulta = consulta.eq("bajo_minimo", true);
      return consulta.order("nombre").order("articulo_id").range(desde, hasta);
    },
    "No se pudo cargar el inventario",
  );
}

export interface RangoKardex {
  /** Inicio del rango (ISO 8601, inclusivo). */
  desde?: string;
  /** Fin del rango (ISO 8601, inclusivo). */
  hasta?: string;
}

/**
 * Movimientos de un artículo con el saldo tras cada uno, del más antiguo al más reciente. El saldo
 * se calcula sobre TODOS los movimientos del artículo, así que un rango no lo reinicia.
 */
export async function getKardex(articuloId: string, rango: RangoKardex = {}): Promise<MovimientoKardex[]> {
  const supabase = await createClienteInventario();
  return leerTodo<MovimientoKardex>(
    (desde, hasta) => {
      let consulta = supabase.from("v_kardex").select("*").eq("articulo_id", articuloId);
      if (rango.desde) consulta = consulta.gte("fecha", rango.desde);
      if (rango.hasta) consulta = consulta.lte("fecha", rango.hasta);
      return consulta.order("fecha").order("created_at").order("seq").range(desde, hasta);
    },
    "No se pudo cargar el kardex",
  );
}
