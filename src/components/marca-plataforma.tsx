import Image from "next/image";
import { NOMBRE_PLATAFORMA } from "@/lib/plataforma";

/** Icono de la plataforma, centrado: cabecera de las pantallas de acceso (login y registro). El nombre va solo para lectores de pantalla. */
export function MarcaPlataforma() {
  return (
    <div className="flex justify-center">
      <Image src="/marca/blue.png" alt="" width={64} height={64} priority className="size-16" />
      <h1 className="sr-only">{NOMBRE_PLATAFORMA}</h1>
    </div>
  );
}
