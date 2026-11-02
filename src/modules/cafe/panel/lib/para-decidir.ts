import type { EstadoPresentacion } from "../../inventario/lib/inventario";
import type { LineaPanel } from "../types";

// «Para decidir hoy» (A-19): lista accionable del panel con lo que pide una decisión AHORA. Cada elemento enlaza a la pantalla
// donde se resuelve y solo aparece si hay algo que decidir: el panel avisa, no bloquea. Es una FOTO de ahora (no depende del
// periodo), pero respeta la línea elegida: los insumos y las presentaciones son de marca propia; los lotes sin recoger son de
// servicios a terceros. Puro: sin base ni React.

export type IdDecidir = "insumos" | "presentaciones" | "sin_recoger";

export interface ItemDecidir {
  id: IdDecidir;
  /** Frase corta con la cuenta: «2 insumos bajo el mínimo». */
  titulo: string;
  /** Qué elementos (hasta 3 y «y N más»). */
  detalle: string;
  cantidad: number;
  href: string;
  tono: "ambar" | "rojo" | "gris";
}

export interface EntradaDecidir {
  linea: LineaPanel | null;
  /** Nombres de los insumos activos bajo su mínimo. */
  insumosBajoMinimo: readonly string[];
  /** Productos terminados activos con su estado de stock (solo cuentan `agotado` y `bajo`). */
  presentaciones: readonly { nombre: string; estado: EstadoPresentacion }[];
  /** Lotes de servicio listos que llevan más de `diasSinRecoger` días sin entregarse, con su línea del panel. */
  lotesSinRecoger: readonly { codigo: string; linea: LineaPanel }[];
  diasSinRecoger: number;
}

const unir = (xs: readonly string[], max = 3) => (xs.length <= max ? xs.join(", ") : `${xs.slice(0, max).join(", ")} y ${xs.length - max} más`);
const n = (c: number, uno: string, varios: string) => `${c} ${c === 1 ? uno : varios}`;

export const HREF_DECIDIR: Readonly<Record<IdDecidir, string>> = {
  insumos: "/dashboard/cafe/inventario?tab=insumos",
  presentaciones: "/dashboard/cafe/inventario",
  sin_recoger: "/dashboard/cafe/inventario?tab=servicios",
};

/** Los elementos de «Para decidir hoy», en este orden y solo los que tienen algo. Lista vacía = todo en orden. */
export function calcularParaDecidir(e: EntradaDecidir): ItemDecidir[] {
  const items: ItemDecidir[] = [];
  const esMarcaPropia = e.linea === null || e.linea === "marca_propia";
  const esServicio = e.linea === null || e.linea === "trilla" || e.linea === "maquila";

  if (e.insumosBajoMinimo.length > 0) {
    items.push({
      id: "insumos",
      titulo: `${n(e.insumosBajoMinimo.length, "insumo bajo", "insumos bajo")} el mínimo`,
      detalle: unir(e.insumosBajoMinimo),
      cantidad: e.insumosBajoMinimo.length,
      href: HREF_DECIDIR.insumos,
      tono: "ambar",
    });
  }

  if (esMarcaPropia) {
    const agotadas = e.presentaciones.filter((p) => p.estado === "agotado");
    const bajas = e.presentaciones.filter((p) => p.estado === "bajo");
    const todas = [...agotadas, ...bajas];
    if (todas.length > 0) {
      items.push({
        id: "presentaciones",
        titulo:
          agotadas.length > 0 && bajas.length > 0
            ? `${n(agotadas.length, "presentación agotada", "presentaciones agotadas")} y ${n(bajas.length, "baja", "bajas")}`
            : agotadas.length > 0
              ? n(agotadas.length, "presentación agotada", "presentaciones agotadas")
              : n(bajas.length, "presentación baja", "presentaciones bajas"),
        detalle: unir(todas.map((p) => p.nombre)),
        cantidad: todas.length,
        href: HREF_DECIDIR.presentaciones,
        tono: agotadas.length > 0 ? "rojo" : "ambar",
      });
    }
  }

  if (esServicio) {
    const sinRecoger = e.lotesSinRecoger.filter((l) => e.linea === null || l.linea === e.linea);
    if (sinRecoger.length > 0) {
      items.push({
        id: "sin_recoger",
        titulo: `${n(sinRecoger.length, "lote listo", "lotes listos")} sin recoger`,
        detalle: `${unir(sinRecoger.map((l) => l.codigo))} · más de ${e.diasSinRecoger} días`,
        cantidad: sinRecoger.length,
        href: HREF_DECIDIR.sin_recoger,
        tono: "gris",
      });
    }
  }
  return items;
}
