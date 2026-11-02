import { redirect } from "next/navigation";

/** Ruta anterior (A-08): ahora es «Recibir café» con Servicios a terceros preseleccionado. */
export default function NuevaRecepcionPage() {
  redirect("/dashboard/cafe/recibir?tipo=servicios");
}
