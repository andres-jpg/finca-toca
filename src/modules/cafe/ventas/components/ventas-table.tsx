import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatearCOP } from "@/modules/cafe/compras/lib/compra";
import { fechaCorta } from "@/modules/cafe/lotes/lib/formato";
import { hayFiltrosVentas, type FiltrosVentas } from "../lib/filtros";
import type { VentaFila } from "../types";
import { InsigniaEstadoVenta, InsigniaTipoVenta, TextoFactura } from "./insignias";

/**
 * Listado de ventas y cortesías: número (enlace al detalle), fecha, tipo, cliente, líneas, total, factura de Aliados y
 * estado. Las anuladas se muestran tachadas (son historial). Las cortesías valen $0 y no suman: su total se pinta
 * atenuado.
 */
export function VentasTable({ ventas, filtros }: { ventas: VentaFila[]; filtros: FiltrosVentas }) {
  if (ventas.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500">
        {hayFiltrosVentas(filtros) ? "Ningún registro coincide con los filtros." : "Aún no hay ventas registradas."}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Número</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead className="text-right">Líneas</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Factura Aliados</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ventas.map((v) => {
            const anulada = v.estado === "anulada";
            return (
              <TableRow key={v.id} className={cn(anulada && "text-gray-500")}>
                <TableCell className={cn("font-medium tabular-nums", anulada && "line-through decoration-gray-400")}>
                  <Link href={`/dashboard/cafe/ventas/${v.id}`} className="inline-flex min-h-11 items-center text-sky-700 underline underline-offset-2 sm:min-h-0">
                    {v.numero}
                  </Link>
                </TableCell>
                <TableCell className="tabular-nums">{fechaCorta(v.fecha)}</TableCell>
                <TableCell>
                  <InsigniaTipoVenta tipo={v.tipo} />
                </TableCell>
                <TableCell>{v.esConsumidorFinal ? <span className="text-gray-600">Consumidor final</span> : v.clienteNombre}</TableCell>
                <TableCell className="text-right tabular-nums">{v.nLineas}</TableCell>
                <TableCell className={cn("text-right tabular-nums", v.tipo === "cortesia" && "text-gray-400")}>{formatearCOP(v.total)}</TableCell>
                <TableCell>
                  <TextoFactura estado={v.facturaEstado} numero={v.numeroFactura} anulada={anulada} />
                </TableCell>
                <TableCell>
                  <InsigniaEstadoVenta estado={v.estado} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
