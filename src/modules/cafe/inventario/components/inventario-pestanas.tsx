import Link from "next/link";
import { cn } from "@/lib/utils";
import { ETIQUETA_PESTANA, PESTANAS_INVENTARIO, hrefPestana, type PestanaInventario } from "../lib/inventario";

/** Pestañas del inventario. Son enlaces: la pestaña activa vive en la URL (`?tab=`). Objetivo táctil de 44 px. */
export function InventarioPestanas({ activa }: { activa: PestanaInventario }) {
  return (
    <nav aria-label="Inventario" className="flex gap-1 overflow-x-auto border-b border-stone-200">
      {PESTANAS_INVENTARIO.map((p) => (
        <Link
          key={p}
          href={hrefPestana(p)}
          aria-current={activa === p ? "page" : undefined}
          className={cn(
            "-mb-px inline-flex min-h-11 shrink-0 items-center border-b-2 px-4 py-2 text-sm font-medium",
            activa === p ? "border-stone-800 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800",
          )}
        >
          {ETIQUETA_PESTANA[p]}
        </Link>
      ))}
    </nav>
  );
}
