import { getStock } from "@/modules/core/inventario/queries/inventario.queries";
import type { ConceptoTarifaDef } from "@/modules/core/tarifas/registry";
import { conceptoPrecio } from "../lib/precios";

// Módulo plano (no "use server"). Lo registra `src/modules/registry.ts` como proveedor de conceptos de tarifa del
// módulo `cafe.ventas`: la pantalla «Tarifas y parámetros» muestra una sección «Precios de venta» con un concepto por
// producto terminado ACTIVO del cliente (el RLS filtra por cliente: cada cliente ve los suyos).

/** Un concepto de tarifa por producto terminado activo: `cafe.precio_<uuid sin guiones>`, por unidad. */
export async function conceptosPrecioVenta(): Promise<ConceptoTarifaDef[]> {
  const productos = await getStock({ tipo: "producto_terminado" });
  return productos.map((p) => ({
    concepto: conceptoPrecio(p.articulo_id),
    modulo: "cafe.ventas",
    etiqueta: p.nombre,
    ayuda: "Precio de venta por unidad. Sin precio, la venta pide el valor a mano.",
    unidad: "unidad",
  }));
}
