import { Ban, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fechaCorta, fechaHoraZona, formatearKg3 } from "@/modules/cafe/lotes/lib/formato";
import { remisionVigente, rutaTiquete } from "../lib/estado";
import { resumenEntrega, valorReferencia } from "../lib/tiquete";
import type { Remision } from "../types";
import { AnularRemisionButton } from "./anular-remision-button";

/**
 * Sección «Remisión de entrega» de la ficha del lote: la vigente con sus enlaces para imprimir (el tiquete abre en
 * otra pestaña; «con copia» saca además el «COPIA CLIENTE») y las anuladas como historial. Gerencia la ve sin
 * botón de anular. El número REM de una anulada no se reutiliza.
 */
export function RemisionLoteSeccion({
  remisiones,
  puedeAnular,
  zonaHoraria,
}: {
  remisiones: Remision[];
  puedeAnular: boolean;
  zonaHoraria: string;
}) {
  if (remisiones.length === 0) return null;
  const vigente = remisionVigente(remisiones);
  const anuladas = remisiones.filter((r) => r.anulacion !== null);

  return (
    <section className="space-y-2" aria-labelledby="titulo-remision">
      <h2 id="titulo-remision" className="text-lg font-semibold text-gray-800">
        Remisión de entrega
      </h2>

      {vigente ? (
        <div className="space-y-3 rounded-lg border border-teal-200 bg-teal-50/60 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-bold tabular-nums text-gray-800">{vigente.numero}</span>
            <Badge className="bg-teal-100 text-teal-800 hover:bg-teal-100">Vigente</Badge>
            {vigente.forzada && <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Con servicios pendientes</Badge>}
          </div>
          <p className="text-sm text-gray-700">
            Entregado el <span className="tabular-nums">{fechaCorta(vigente.fecha)}</span> a {vigente.clienteNombre}:{" "}
            <span className="tabular-nums font-medium">{formatearKg3(vigente.pesoEntregadoKg)} kg</span> de{" "}
            <span className="tabular-nums">{formatearKg3(vigente.pesoRecibidoKg)} kg</span> recibidos (merma{" "}
            <span className="tabular-nums">{resumenEntrega(vigente).mermaPct}</span>). Valor de los servicios{" "}
            <span className="tabular-nums">{valorReferencia(vigente.valorServicios)}</span> (referencia: no es una factura).
          </p>
          {vigente.observaciones && <p className="text-sm italic text-gray-600">{vigente.observaciones}</p>}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild className="h-11 sm:h-9">
              <a href={rutaTiquete(vigente.id)} target="_blank" rel="noopener noreferrer">
                <Printer className="mr-2 h-4 w-4" />
                Imprimir
              </a>
            </Button>
            <Button asChild variant="outline" className="h-11 sm:h-9">
              <a href={rutaTiquete(vigente.id, 2)} target="_blank" rel="noopener noreferrer">
                <Printer className="mr-2 h-4 w-4" />
                Imprimir con copia
              </a>
            </Button>
            {puedeAnular && <AnularRemisionButton remisionId={vigente.id} numero={vigente.numero} />}
          </div>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500">
          La remisión anterior se anuló: el lote no tiene una remisión vigente.
        </p>
      )}

      {anuladas.length > 0 && (
        <ul className="space-y-1 text-sm text-gray-600">
          {anuladas.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <Ban className="h-3.5 w-3.5 text-red-600" aria-hidden />
              <span className="tabular-nums line-through decoration-gray-400">{r.numero}</span>
              <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Anulada</Badge>
              {r.anulacion && (
                <span>
                  {fechaHoraZona(r.anulacion.en, zonaHoraria)} · {r.anulacion.motivo}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
