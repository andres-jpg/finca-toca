import { redirect } from "next/navigation";

/** A-15: Insumos es una pestaña del Inventario. Esta ruta se conserva solo para los enlaces y marcadores antiguos. */
export default function InsumosRedirect() {
  redirect("/dashboard/cafe/inventario?tab=insumos");
}
