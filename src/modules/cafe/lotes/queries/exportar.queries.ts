import { createClient } from "@/lib/supabase/server";
import { callRpc } from "@/modules/core/rpc/call-rpc";
import { fetchAllPaginado } from "@/modules/core/export/lib/paginar";
import { aplicarFiltrosLotes, type FiltrosLotes } from "../lib/filtros";
import type { LoteExport, ProcesoExport } from "../lib/exportar";

// Lectura de la exportación a Excel. Módulo plano (no "use server"): solo lo llama el exportador, ya autorizado por
// la ruta `/api/export/[recurso]`. La frontera real es el RLS: las vistas son `security_invoker`, así que sin el
// módulo `cafe.recepcion` o sin membresía en el cliente actual todo sale vacío. Lanza (`ExportError`) si una página
// falla o si hay demasiadas filas: un Excel truncado que parece completo es peor que un error.

const num = (n: number | null | undefined): number => (n === null || n === undefined ? 0 : Number(n));

/** Lotes por consulta al traer sus procesos: el filtro `in (…)` va en la URL y cada uuid pesa ~37 caracteres. */
const LOTES_POR_LOTE_DE_PROCESOS = 100;

const COLUMNAS_LOTES =
  "id, codigo, linea, servicios, tercero_nombre, tercero_identificacion, tipo_cafe_nombre, fecha_recepcion, num_bultos, peso_recibido_kg, humedad_pct, densidad, alertas_calidad, nivel_tueste, precio_compra_kg, valor_compra, peso_actual_kg, merma_total_kg, valor_servicios, estado, avance_texto";

/**
 * Los lotes del listado con los MISMOS filtros (`aplicarFiltrosLotes`, la única traducción de `tipo`, `estado`,
 * `desde`, `hasta`, `tercero` y `q`) y el mismo orden que `listarLotes`: línea (marca propia primero), fecha de
 * recepción y creación descendentes. Sin página: trae todos.
 */
export async function leerLotesExport(filtros: FiltrosLotes): Promise<LoteExport[]> {
  const supabase = await createClient();
  const filas = await fetchAllPaginado((desde, hasta) =>
    aplicarFiltrosLotes(supabase.schema("cafe").from("v_lotes").select(COLUMNAS_LOTES), filtros)
      .order("linea", { ascending: true })
      .order("fecha_recepcion", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(desde, hasta),
  );

  return filas.map(
    (l): LoteExport => ({
      id: l.id,
      codigo: l.codigo,
      linea: l.linea,
      servicios: l.servicios,
      tercero: l.tercero_nombre,
      identificacion: l.tercero_identificacion,
      tipoCafe: l.tipo_cafe_nombre,
      fechaRecepcion: l.fecha_recepcion,
      numBultos: l.num_bultos,
      pesoRecibidoKg: num(l.peso_recibido_kg),
      humedadPct: l.humedad_pct === null ? null : Number(l.humedad_pct),
      densidad: l.densidad === null ? null : Number(l.densidad),
      alertasCalidad: l.alertas_calidad,
      nivelTueste: l.nivel_tueste,
      precioCompraKg: l.precio_compra_kg === null ? null : Number(l.precio_compra_kg),
      valorCompra: l.valor_compra === null ? null : Number(l.valor_compra),
      pesoActualKg: num(l.peso_actual_kg),
      mermaTotalKg: num(l.merma_total_kg),
      valorServicios: num(l.valor_servicios),
      estado: l.estado ?? "recibido",
      avanceTexto: l.avance_texto,
      remision: null, // CO-32 (remisión) lo rellenará; hoy no existe el dato.
    }),
  );
}

/**
 * Los procesos de esos lotes (vigentes y anulados), con el filtro de fecha aplicado a la **fecha del proceso**
 * (`desde`/`hasta`). Va en trozos de lotes para no desbordar la URL; cada trozo se pagina por completo.
 */
export async function leerProcesosExport(
  lotes: readonly Pick<LoteExport, "id" | "codigo" | "linea">[],
  filtros: Pick<FiltrosLotes, "desde" | "hasta">,
): Promise<ProcesoExport[]> {
  if (lotes.length === 0) return [];
  const supabase = await createClient();
  const cafe = supabase.schema("cafe");
  const lotePorId = new Map(lotes.map((l) => [l.id, l]));
  const ids = lotes.map((l) => l.id);

  const procesos = [];
  const bultosPorProceso = new Map<string, number>();
  for (let i = 0; i < ids.length; i += LOTES_POR_LOTE_DE_PROCESOS) {
    const trozo = ids.slice(i, i + LOTES_POR_LOTE_DE_PROCESOS);

    const [filas, bultos] = await Promise.all([
      fetchAllPaginado((desde, hasta) => {
        let consulta = cafe
          .from("procesos")
          .select(
            "id, lote_id, tipo, fecha, created_at, created_by, peso_entrada_kg, peso_salida_kg, merma_kg, merma_referencia_pct, desvio, nivel_tueste, tarifa_kg, valor, anulado_at, motivo_anulacion",
          )
          .in("lote_id", trozo);
        if (filtros.desde) consulta = consulta.gte("fecha", filtros.desde);
        if (filtros.hasta) consulta = consulta.lte("fecha", filtros.hasta);
        return consulta.order("fecha", { ascending: true }).order("created_at", { ascending: true }).order("id", { ascending: true }).range(desde, hasta);
      }),
      // Un proceso anulado libera sus bultos (se borran sus filas): para esos el conteo queda sin dato.
      fetchAllPaginado((desde, hasta) =>
        cafe.from("proceso_bultos").select("proceso_id, bulto_id").in("lote_id", trozo).order("proceso_id").order("bulto_id").range(desde, hasta),
      ),
    ]);
    procesos.push(...filas);
    for (const b of bultos) bultosPorProceso.set(b.proceso_id, (bultosPorProceso.get(b.proceso_id) ?? 0) + 1);
  }

  const usuarios = await nombresUsuarios([...new Set(procesos.flatMap((p) => (p.created_by ? [p.created_by] : [])))]);

  return procesos.map((p): ProcesoExport => {
    const lote = lotePorId.get(p.lote_id);
    const anulado = p.anulado_at !== null;
    return {
      loteCodigo: lote?.codigo ?? "—",
      linea: lote?.linea ?? "servicio",
      fecha: p.fecha,
      tipo: p.tipo,
      numBultos: anulado ? null : (bultosPorProceso.get(p.id) ?? null),
      pesoEntradaKg: num(p.peso_entrada_kg),
      pesoSalidaKg: num(p.peso_salida_kg),
      mermaKg: num(p.merma_kg),
      mermaReferenciaPct: p.merma_referencia_pct === null ? null : Number(p.merma_referencia_pct),
      desvio: p.desvio === true,
      nivelTueste: p.nivel_tueste,
      tarifaKg: num(p.tarifa_kg),
      valor: num(p.valor),
      registradoPor: p.created_by ? (usuarios.get(p.created_by) ?? null) : null,
      creadoEn: p.created_at,
      anulado,
      motivoAnulacion: p.motivo_anulacion,
    };
  });
}

/**
 * Email de quienes registraron los procesos: `public.nombres_usuarios_tenant` solo da el de miembros del cliente
 * actual y a cualquier miembro (también Gerencia, que puede exportar). Es un dato accesorio: si falla, la columna
 * sale vacía en vez de impedir la exportación.
 */
async function nombresUsuarios(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const r = await callRpc<"public", "nombres_usuarios_tenant", { user_id: string; email: string }[]>("public", "nombres_usuarios_tenant", {
    p_ids: ids,
  });
  if (!r.ok) return new Map();
  return new Map((r.data ?? []).map((u) => [u.user_id, u.email]));
}
