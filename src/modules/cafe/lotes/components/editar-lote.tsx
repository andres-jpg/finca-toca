import { getBloqueoEdicion, getDatosEdicion } from "../queries/edicion.queries";
import { EditarLoteModal } from "./editar-lote-modal";

const MENSAJE: Record<string, string> = {
  lote_anulado: "Lote anulado: no se puede editar.",
  lote_entregado: "No editable: primero anula la remisión.",
  lote_con_ventas: "No editable: primero anula las ventas de sus productos.",
};

/**
 * «Editar» de la ficha (A-18 · FIN-136). Solo se monta para owner/admin (la página decide; para los demás ni siquiera se
 * renderiza). Un lote entregado o con ventas no es editable y se explica por qué. Cosmético: la RPC `cafe.editar_lote`,
 * el RLS y los triggers de la base son la frontera real.
 */
export async function EditarLote({ loteId, esAdmin, zona }: { loteId: string; esAdmin: boolean; zona: string }) {
  if (!esAdmin) return null;
  const datos = await getDatosEdicion(loteId);
  if (!datos) {
    const bloqueo = await getBloqueoEdicion(loteId);
    return bloqueo ? <p className="self-center text-xs text-gray-500">{MENSAJE[bloqueo]}</p> : null;
  }
  return <EditarLoteModal datos={datos} zona={zona} />;
}
