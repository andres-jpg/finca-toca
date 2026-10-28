import Link from "next/link";
import { cn } from "@/lib/utils";
import { serializarFiltros, type FiltrosLotes, type TipoFiltro } from "../lib/filtros";

const PESTANAS: { id: "todos" | "marca_propia" | "servicios"; etiqueta: string; tipo: TipoFiltro | undefined }[] = [
  { id: "todos", etiqueta: "Todos", tipo: undefined },
  { id: "marca_propia", etiqueta: "Marca propia", tipo: "marca_propia" },
  { id: "servicios", etiqueta: "Servicios", tipo: "servicios" },
];

/** La pestaña de un filtro de tipo: trilla y maquila viven dentro de «Servicios». */
function pestanaActiva(tipo: TipoFiltro | undefined): "todos" | "marca_propia" | "servicios" {
  if (!tipo) return "todos";
  return tipo === "marca_propia" ? "marca_propia" : "servicios";
}

/**
 * Pestañas «Todos / Marca propia / Servicios». Cambiar de pestaña conserva los demás filtros (menos la página y
 * el subtipo, que ya no aplica). Son enlaces: la pestaña activa también está en la URL.
 */
export function LotesPestanas({ filtros, ruta }: { filtros: FiltrosLotes; ruta: string }) {
  const activa = pestanaActiva(filtros.tipo);
  return (
    <nav aria-label="Línea de negocio" className="flex gap-1 border-b border-stone-200">
      {PESTANAS.map((p) => {
        const qs = serializarFiltros({ ...filtros, tipo: p.tipo });
        return (
          <Link
            key={p.id}
            href={qs ? `${ruta}?${qs}` : ruta}
            aria-current={activa === p.id ? "page" : undefined}
            className={cn(
              "-mb-px min-h-11 border-b-2 px-4 py-2.5 text-sm font-medium sm:min-h-9 sm:py-2",
              activa === p.id ? "border-stone-800 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800",
            )}
          >
            {p.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
