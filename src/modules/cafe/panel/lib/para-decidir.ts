// «Para decidir hoy»: lista accionable del panel con lo que pide una decisión AHORA. Cada elemento enlaza a la pantalla donde se
// resuelve y solo aparece si hay algo que decidir: el panel avisa, no bloquea. Foto de ahora (no depende del periodo). No hay
// cartera: Cofradía no maneja estado de pago. Puro: sin base ni React.

export interface ItemDecidir {
  /** Único en la lista (`presentacion:Consumo 2.500 g`), para la `key` de React. */
  id: string;
  tipo: "presentacion" | "insumos" | "sin_recoger" | "proveedor";
  /** Frase corta: «Consumo 2.500 g agotado. Programar empaque.» */
  titulo: string;
  /** Qué más hay que saber: ritmo de venta, nombres, días. */
  detalle: string;
  href: string;
  tono: "ambar" | "rojo" | "gris";
}

export interface PresentacionAgotada {
  nombre: string;
  /** Unidades (bolsas) vendidas en las últimas 4 semanas. */
  unidades4Semanas: number;
}

export interface ProveedorFuera {
  terceroId: string | null;
  nombre: string;
  /** «humedad 13,2 % (rango 10–12 %)», «merma de tostión 23,0 % (18,0 ± 2 pts)». */
  detalles: string[];
}

export interface EntradaDecidir {
  presentacionesAgotadas: readonly PresentacionAgotada[];
  /** Nombres de los insumos activos bajo su mínimo. */
  insumosBajoMinimo: readonly string[];
  /** Códigos de los lotes de servicio listos que llevan más de `diasSinRecoger` días sin entregarse. */
  lotesSinRecoger: readonly string[];
  diasSinRecoger: number;
  proveedoresFuera: readonly ProveedorFuera[];
}

export const SEMANAS_RITMO = 4;

const unir = (xs: readonly string[], max = 3) => (xs.length <= max ? xs.join(", ") : `${xs.slice(0, max).join(", ")} y ${xs.length - max} más`);
const n = (c: number, uno: string, varios: string) => `${c} ${c === 1 ? uno : varios}`;

export const HREF_DECIDIR = {
  presentaciones: "/dashboard/cafe/inventario",
  insumos: "/dashboard/cafe/inventario?tab=insumos",
  sin_recoger: "/dashboard/cafe/inventario?tab=servicios",
  proveedor: (terceroId: string | null) => (terceroId ? `/dashboard/cafe/lotes?tercero=${terceroId}` : "/dashboard/cafe/lotes"),
} as const;

/** «se venden unas 12 bolsas por semana»: el promedio semanal de las últimas 4 semanas, o `null` sin ventas. */
export function ritmoSemanal(unidades4Semanas: number): string | null {
  if (!(unidades4Semanas > 0)) return null;
  const porSemana = Math.round(unidades4Semanas / SEMANAS_RITMO);
  if (porSemana < 1) return "se vende menos de 1 bolsa por semana";
  return porSemana === 1 ? "se vende 1 bolsa por semana" : `se venden unas ${porSemana} bolsas por semana`;
}

/** Los elementos de «Para decidir hoy», en este orden y solo los que tienen algo. Lista vacía = todo en orden. */
export function calcularParaDecidir(e: EntradaDecidir): ItemDecidir[] {
  const items: ItemDecidir[] = [];

  for (const p of e.presentacionesAgotadas) {
    const ritmo = ritmoSemanal(p.unidades4Semanas);
    items.push({
      id: `presentacion:${p.nombre}`,
      tipo: "presentacion",
      titulo: `${p.nombre} agotado. Programar empaque.`,
      detalle: ritmo ? `${ritmo.charAt(0).toUpperCase()}${ritmo.slice(1)}.` : "Sin ventas en las últimas 4 semanas.",
      href: HREF_DECIDIR.presentaciones,
      tono: "rojo",
    });
  }

  if (e.insumosBajoMinimo.length > 0) {
    items.push({
      id: "insumos",
      tipo: "insumos",
      titulo: `${n(e.insumosBajoMinimo.length, "insumo bajo", "insumos bajo")} el mínimo`,
      detalle: unir(e.insumosBajoMinimo),
      href: HREF_DECIDIR.insumos,
      tono: "ambar",
    });
  }

  if (e.lotesSinRecoger.length > 0) {
    items.push({
      id: "sin_recoger",
      tipo: "sin_recoger",
      titulo: `${n(e.lotesSinRecoger.length, "lote listo", "lotes listos")} sin recoger`,
      detalle: `${unir(e.lotesSinRecoger)} · más de ${e.diasSinRecoger} días`,
      href: HREF_DECIDIR.sin_recoger,
      tono: "gris",
    });
  }

  for (const p of e.proveedoresFuera) {
    items.push({
      id: `proveedor:${p.terceroId ?? p.nombre}`,
      tipo: "proveedor",
      titulo: `${p.nombre}: fuera de rango`,
      detalle: p.detalles.join(" · "),
      href: HREF_DECIDIR.proveedor(p.terceroId),
      tono: "ambar",
    });
  }
  return items;
}
