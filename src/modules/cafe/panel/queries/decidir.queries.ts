import { cache } from "react";
import { getStock } from "@/modules/core/inventario/queries/inventario.queries";
import { getParametro } from "@/modules/core/parametros/queries/parametros.queries";
import { formatPct } from "@/modules/core/formato/numeros";
import { PARAMETROS_CAFE } from "../../parametros";
import { getInsumosBajoMinimo } from "../../empaque/queries/empaque.queries";
import { estadoPresentacion } from "../../inventario/lib/inventario";
import { diasEntre } from "../../procesos/lib/cola";
import { getColaPlanta } from "../../procesos/queries/planta.queries";
import { calcularParaDecidir, SEMANAS_RITMO, type ItemDecidir, type ProveedorFuera } from "../lib/para-decidir";
import { estadoProveedor } from "../lib/proveedores";
import { resolverPeriodo, sumarDias } from "../lib/periodo";
import { getProveedoresMarcaPropia, getRangoHumedad, getReferenciasPanel, getVentasPresentacion } from "./panel.queries";

// «Para decidir hoy»: junta lo que ya leen Inventario y Planta, el ritmo de venta de las últimas 4 semanas y los proveedores del
// mes. Módulo plano (no "use server"). La autorización es el RLS de cada tabla: un módulo que el cliente no tiene aporta una
// lista vacía, nunca un error.

/** Los elementos de «Para decidir hoy» (foto de ahora: no depende del periodo elegido). */
export const getParaDecidir = cache(async (hoy: string): Promise<ItemDecidir[]> => {
  const mes = resolverPeriodo("mes", hoy);
  const [insumos, productos, cola, diasSinRecoger, ventas, proveedores, humedad, refs] = await Promise.all([
    getInsumosBajoMinimo(),
    getStock({ tipo: "producto_terminado" }),
    getColaPlanta(),
    getParametro(PARAMETROS_CAFE.diasSinRecoger),
    getVentasPresentacion(sumarDias(hoy, -(SEMANAS_RITMO * 7 - 1)), hoy).catch(() => []),
    getProveedoresMarcaPropia(mes.desde, mes.hasta),
    getRangoHumedad(),
    getReferenciasPanel(),
  ]);

  const unidades = new Map<string, number>();
  for (const v of ventas) unidades.set(v.articuloId, (unidades.get(v.articuloId) ?? 0) + v.unidades);

  const fuera: ProveedorFuera[] = proveedores.flatMap((p) => {
    const e = estadoProveedor(p, humedad, refs.tostion, refs.toleranciaPts);
    if (!e.fuera) return [];
    const detalles: string[] = [];
    if (e.humedad === "fuera") detalles.push(`humedad ${formatPct(p.humedadPct)} (rango ${humedad.min}–${humedad.max} %)`);
    if (e.merma === "fuera" && refs.tostion !== null) detalles.push(`merma de tostión ${formatPct(p.mermaTostionPct)} (${formatPct(refs.tostion)} ± ${refs.toleranciaPts} pts)`);
    return [{ terceroId: p.terceroId, nombre: p.nombre, detalles }];
  });

  return calcularParaDecidir({
    presentacionesAgotadas: productos
      .filter((p) => p.activo && estadoPresentacion(p.stock, p.stock_minimo) === "agotado")
      .map((p) => ({ nombre: p.nombre, unidades4Semanas: unidades.get(p.articulo_id) ?? 0 })),
    insumosBajoMinimo: insumos.map((i) => i.nombre),
    lotesSinRecoger: cola
      .filter((t) => t.estado === "listo" && t.linea === "servicio" && t.listoDesde && diasEntre(t.listoDesde, hoy) > diasSinRecoger)
      .map((t) => t.codigo),
    diasSinRecoger,
    proveedoresFuera: fuera,
  });
});
