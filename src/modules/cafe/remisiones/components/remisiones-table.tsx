import Link from "next/link";
import { Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatearCOP } from "@/modules/cafe/compras/lib/compra";
import { fechaCorta, formatearKg3 } from "@/modules/cafe/lotes/lib/formato";
import { estadoRemision, etiquetaEstadoRemision, rutaTiquete } from "../lib/estado";
import { hayFiltrosRemisiones, type FiltrosRemisiones } from "../lib/filtros";
import { resumenEntrega } from "../lib/tiquete";
import type { Remision } from "../types";

/**
 * Listado de remisiones: número, fecha de entrega, lote (enlace a la ficha), cliente, kilos entregados, merma, valor de
 * los servicios (referencia: no es una factura), estado y reimpresión (original o con copia). Las anuladas se
 * muestran tachadas, sin reimpresión: son historial. Una remisión puede llevar varios lotes: los kilos y el valor de cada fila son la suma de los suyos.
 */
export function RemisionesTable({ remisiones, filtros }: { remisiones: Remision[]; filtros: FiltrosRemisiones }) {
  if (remisiones.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500">
        {hayFiltrosRemisiones(filtros) ? "Ninguna remisión coincide con los filtros." : "Aún no hay remisiones generadas."}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Número</TableHead>
            <TableHead>Entrega</TableHead>
            <TableHead>Lotes</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Recibió</TableHead>
            <TableHead className="text-right">Kg entregados</TableHead>
            <TableHead className="text-right">Merma</TableHead>
            <TableHead className="text-right">Valor servicios</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Imprimir</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {remisiones.map((r) => {
            const estado = estadoRemision(r);
            const resumen = resumenEntrega(r);
            return (
              <TableRow key={r.id} className={cn(estado === "anulada" && "text-gray-500")}>
                <TableCell className={cn("font-medium tabular-nums", estado === "anulada" && "line-through decoration-gray-400")}>
                  {r.numero}
                </TableCell>
                <TableCell className="tabular-nums">{fechaCorta(r.fecha)}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    {(r.lotes.length ? r.lotes : [{ loteId: r.loteId, loteCodigo: r.loteCodigo }]).map((l) => (
                      <Link key={l.loteId} href={`/dashboard/cafe/lotes/${l.loteId}`} className="tabular-nums text-sky-700 underline underline-offset-2">
                        {l.loteCodigo}
                      </Link>
                    ))}
                  </div>
                </TableCell>
                <TableCell>{r.clienteNombre}</TableCell>
                <TableCell>
                  {r.recibeNombre}
                  <span className="block text-xs text-gray-500 tabular-nums">{r.recibeDocumento}</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatearKg3(r.pesoEntregadoKg)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatearKg3(r.mermaTotalKg)} <span className="text-xs text-gray-500">({resumen.mermaPct})</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatearCOP(r.valorServicios)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge
                      className={
                        estado === "entregada"
                          ? "bg-teal-100 text-teal-800 hover:bg-teal-100"
                          : "bg-red-100 text-red-700 hover:bg-red-100"
                      }
                    >
                      {etiquetaEstadoRemision(estado)}
                    </Badge>
                    {r.forzada && <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Pendientes</Badge>}
                  </div>
                </TableCell>
                <TableCell>
                  {estado === "entregada" ? (
                    <div className="flex gap-1">
                      <Button asChild variant="outline" size="sm" className="h-11 sm:h-8">
                        <a href={rutaTiquete(r.id)} target="_blank" rel="noopener noreferrer">
                          <Printer className="mr-1 h-3.5 w-3.5" />
                          Original
                        </a>
                      </Button>
                      <Button asChild variant="outline" size="sm" className="h-11 sm:h-8">
                        <a href={rutaTiquete(r.id, 2)} target="_blank" rel="noopener noreferrer">
                          Con copia
                        </a>
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
