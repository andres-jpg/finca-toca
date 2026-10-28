import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { serializarFiltros, type FiltrosLotes } from "../lib/filtros";

/** Anterior / siguiente con el total, conservando los filtros en la URL. */
export function LotesPaginacion({
  filtros,
  ruta,
  total,
  totalPaginas,
}: {
  filtros: FiltrosLotes;
  ruta: string;
  total: number;
  totalPaginas: number;
}) {
  const hrefDe = (pagina: number) => {
    const qs = serializarFiltros({ ...filtros, pagina }, { conPagina: true });
    return qs ? `${ruta}?${qs}` : ruta;
  };
  const pagina = Math.min(filtros.pagina, totalPaginas);

  return (
    <div className="flex flex-col items-center justify-between gap-2 text-sm text-gray-600 sm:flex-row">
      <span>
        {total === 1 ? "1 lote" : `${total} lotes`}
        {totalPaginas > 1 ? ` · página ${pagina} de ${totalPaginas}` : ""}
      </span>
      {totalPaginas > 1 && (
        <div className="flex gap-2">
          {pagina > 1 ? (
            <Button asChild variant="outline" className="h-11 sm:h-9">
              <Link href={hrefDe(pagina - 1)}>
                <ChevronLeft className="mr-1 h-4 w-4" />
                Anterior
              </Link>
            </Button>
          ) : (
            <Button variant="outline" disabled className="h-11 sm:h-9">
              <ChevronLeft className="mr-1 h-4 w-4" />
              Anterior
            </Button>
          )}
          {pagina < totalPaginas ? (
            <Button asChild variant="outline" className="h-11 sm:h-9">
              <Link href={hrefDe(pagina + 1)}>
                Siguiente
                <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <Button variant="outline" disabled className="h-11 sm:h-9">
              Siguiente
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
