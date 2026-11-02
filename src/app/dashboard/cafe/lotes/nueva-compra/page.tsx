import { redirect } from "next/navigation";

/** Ruta anterior (A-08): ahora es «Recibir café» con Marca propia preseleccionada. */
export default function NuevaCompraPage() {
  redirect("/dashboard/cafe/recibir?tipo=marca-propia");
}
