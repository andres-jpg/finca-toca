import { cache } from "react";
import { getParametro } from "@/modules/core/parametros/queries/parametros.queries";
import { getStock } from "@/modules/core/inventario/queries/inventario.queries";
import { PARAMETROS_CAFE } from "../../parametros";
import { estadoPresentacion } from "../../inventario/lib/inventario";
import { getInsumosBajoMinimo } from "../../empaque/queries/empaque.queries";
import { diasEntre } from "../../procesos/lib/cola";
import { getColaPlanta } from "../../procesos/queries/planta.queries";
import { calcularParaDecidir, type ItemDecidir } from "../lib/para-decidir";
import { lineaPanel } from "../lib/kpis";
import type { LineaPanel } from "../types";

// «Para decidir hoy» (A-19): junta lo que ya leen Inventario y Planta. Módulo plano (no "use server"). La
// autorización es el RLS de cada tabla: un módulo que el cliente no tiene aporta una lista vacía, nunca un error.

/** Los elementos de «Para decidir hoy» para la línea elegida (foto de ahora: no depende del periodo). */
export const getParaDecidir = cache(async (linea: LineaPanel | null, hoy: string): Promise<ItemDecidir[]> => {
  const [insumos, productos, cola, diasSinRecoger] = await Promise.all([
    getInsumosBajoMinimo(),
    getStock({ tipo: "producto_terminado" }),
    getColaPlanta(),
    getParametro(PARAMETROS_CAFE.diasSinRecoger),
  ]);

  const sinRecoger = cola
    .filter((t) => t.estado === "listo" && t.linea === "servicio" && t.listoDesde && diasEntre(t.listoDesde, hoy) > diasSinRecoger)
    .map((t) => ({ codigo: t.codigo, linea: lineaPanel(t.linea, t.serviciosRequeridos) }));

  return calcularParaDecidir({
    linea,
    insumosBajoMinimo: insumos.map((i) => i.nombre),
    presentaciones: productos.filter((p) => p.activo).map((p) => ({ nombre: p.nombre, estado: estadoPresentacion(p.stock, p.stock_minimo) })),
    lotesSinRecoger: sinRecoger,
    diasSinRecoger,
  });
});
