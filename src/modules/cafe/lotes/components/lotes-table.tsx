import Link from "next/link";
import { Fragment } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { calcularAvance } from "../lib/avance";
import { fechaCorta, formatearKg3, formatearMermaPct } from "../lib/formato";
import { hayFiltros, type FiltrosLotes } from "../lib/filtros";
import type { LoteListado } from "../queries/lotes.queries";
import { AlertasLote } from "./alertas-lote";
import { AvanceBarra } from "./avance-barra";
import { EstadoLoteBadge, TipoLoteBadge } from "./insignias";

const COLUMNAS = 11;

/**
 * Listado de lotes: código (enlace a la ficha), tipo, proveedor/cliente, tipo de café, fecha, kg recibidos y
 * actuales, merma total, avance, estado y alertas. Sin pestaña de línea (`Todos`), las filas se agrupan por línea
 * con un separador visible: el listado llega ordenado por línea y NUNCA se suma ningún peso entre filas, así que
 * los kilos de café propio y de clientes no se mezclan en ningún total.
 */
export function LotesTable({ lotes, filtros }: { lotes: LoteListado[]; filtros: FiltrosLotes }) {
  if (lotes.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500">
        {hayFiltros(filtros) ? "Ningún lote coincide con los filtros." : "Aún no hay lotes registrados."}
      </p>
    );
  }

  // Separadores de línea solo en «Todos»: en las otras pestañas todas las filas son de la misma línea.
  const agrupar = filtros.tipo === undefined;

  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Proveedor / cliente</TableHead>
            <TableHead>Tipo de café</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead className="text-right">Kg recibidos</TableHead>
            <TableHead className="text-right">Kg actuales</TableHead>
            <TableHead className="text-right">Merma total</TableHead>
            <TableHead>Avance</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Alertas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lotes.map((l, i) => {
            const separador = agrupar && (i === 0 || lotes[i - 1].linea !== l.linea);
            const avance = calcularAvance(
              {
                linea: l.linea,
                estado: l.estado,
                avanceTexto: l.avanceTexto,
                serviciosCompletados: l.serviciosCompletados,
                serviciosRequeridos: l.serviciosRequeridos,
              },
              l.etapas,
            );
            return (
              <Fragment key={l.id}>
                {separador && (
                  <TableRow className="bg-stone-100 hover:bg-stone-100">
                    <TableCell colSpan={COLUMNAS} className="py-1.5 text-xs font-semibold uppercase tracking-wide text-stone-600">
                      {l.linea === "marca_propia" ? "Marca propia (café comprado)" : "Servicios (café de clientes)"}
                    </TableCell>
                  </TableRow>
                )}
                <TableRow className={cn(l.estado === "anulado" && "opacity-60")}>
                  <TableCell className="font-medium tabular-nums">
                    <Link href={`/dashboard/cafe/lotes/${l.id}`} className="text-gray-800 underline-offset-2 hover:underline">
                      {l.codigo}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <TipoLoteBadge linea={l.linea} servicios={l.servicios} />
                  </TableCell>
                  <TableCell>{l.tercero}</TableCell>
                  <TableCell>{l.tipoCafe ?? "—"}</TableCell>
                  <TableCell className="tabular-nums">{fechaCorta(l.fechaRecepcion)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatearKg3(l.pesoRecibidoKg)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatearKg3(l.pesoActualKg)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatearMermaPct(l.mermaTotalKg, l.pesoRecibidoKg)}</TableCell>
                  <TableCell>
                    <AvanceBarra avance={avance} completo={l.estado === "listo" || l.estado === "entregado"} />
                  </TableCell>
                  <TableCell>
                    <EstadoLoteBadge estado={l.estado} />
                  </TableCell>
                  <TableCell>
                    <AlertasLote alertasCalidad={l.alertasCalidad} tieneDesvio={l.tieneDesvio} />
                  </TableCell>
                </TableRow>
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
