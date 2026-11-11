import Link from "next/link";
import { cn } from "@/lib/utils";
import { PESTANAS_INVENTARIO, etiquetaPestana, hrefPestana, type PestanaInventario } from "../lib/inventario";

/**
 * Pestañas del inventario. Son enlaces: la pestaña activa vive en la URL (`?tab=`). Objetivo táctil de 44 px. Llevan su contador:
 * «Servicios a terceros · 6 en planta», «Insumos · 2 bajos».
 */
export function InventarioPestanas({ activa, enPlanta = 0, bajos = 0 }: { activa: PestanaInventario; enPlanta?: number; bajos?: number }) {
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
          {etiquetaPestana(p, { enPlanta, bajos })}
        </Link>
      ))}
    </nav>
  );
}
