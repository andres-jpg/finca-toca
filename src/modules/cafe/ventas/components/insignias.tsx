import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { etiquetaEstadoVenta, etiquetaTipoVenta, textoFactura } from "../lib/venta";
import type { EstadoFactura, EstadoVenta, TipoVenta } from "../types";

/** Venta (neutra) o Cortesía (violeta): se distinguen por la palabra, no solo por el color. */
export function InsigniaTipoVenta({ tipo }: { tipo: TipoVenta }) {
  return (
    <Badge className={cn(tipo === "cortesia" ? "bg-violet-100 text-violet-800 hover:bg-violet-100" : "bg-stone-100 text-stone-800 hover:bg-stone-100")}>
      {etiquetaTipoVenta(tipo)}
    </Badge>
  );
}

export function InsigniaEstadoVenta({ estado }: { estado: EstadoVenta }) {
  return (
    <Badge className={estado === "vigente" ? "bg-teal-100 text-teal-800 hover:bg-teal-100" : "bg-red-100 text-red-700 hover:bg-red-100"}>
      {etiquetaEstadoVenta(estado)}
    </Badge>
  );
}

/**
 * La factura de Aliados: el número (con ✔) si ya se emitió, «Pendiente» en ámbar si se requiere y falta el número, o
 * «—» si la venta no la requiere. En una venta anulada nunca se pinta como pendiente.
 */
export function TextoFactura({ estado, numero, anulada = false }: { estado: EstadoFactura; numero: string | null; anulada?: boolean }) {
  if (estado === "pendiente" && !anulada) {
    return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Pendiente</Badge>;
  }
  if (estado === "emitida") {
    return (
      <span className="inline-flex items-center gap-1 tabular-nums text-teal-800">
        <span aria-hidden>✔</span>
        {textoFactura(estado, numero)}
      </span>
    );
  }
  return <span className="text-gray-400">—</span>;
}
