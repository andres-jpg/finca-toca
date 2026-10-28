"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { cn } from "@/lib/utils";
import { ETIQUETA_MOTIVO, formatearCantidad, type UnidadArticulo } from "../lib/inventario";
import type { MovimientoKardex } from "../types";

interface KardexTableProps {
  movimientos: MovimientoKardex[];
  unidad?: UnidadArticulo;
  /** Zona horaria con la que se muestran las fechas (la del cliente: `tenants.zona_horaria`). */
  zonaHoraria?: string;
}

/** Kardex de un artículo: entradas, salidas y saldo tras cada movimiento (más reciente arriba). */
export function KardexTable({ movimientos, unidad = "unidad", zonaHoraria = "America/Bogota" }: KardexTableProps) {
  // Zona fija en el formateador: el servidor (UTC en Vercel) y el navegador mostrarían horas distintas.
  const formatoFecha = useMemo(
    () => new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: zonaHoraria }),
    [zonaHoraria],
  );

  const columnas = useMemo<ColumnDef<MovimientoKardex>[]>(
    () => [
      {
        accessorKey: "fecha",
        header: "Fecha",
        cell: ({ row }) => formatoFecha.format(new Date(row.original.fecha)),
      },
      {
        accessorKey: "motivo",
        header: "Motivo",
        cell: ({ row }) => ETIQUETA_MOTIVO[row.original.motivo],
      },
      {
        id: "entrada",
        header: "Entrada",
        accessorFn: (m) => (m.cantidad > 0 ? m.cantidad : 0),
        cell: ({ row }) =>
          row.original.cantidad > 0 ? (
            <span className="text-green-700">{formatearCantidad(row.original.cantidad, unidad)}</span>
          ) : null,
      },
      {
        id: "salida",
        header: "Salida",
        accessorFn: (m) => (m.cantidad < 0 ? -m.cantidad : 0),
        cell: ({ row }) =>
          row.original.cantidad < 0 ? (
            <span className="text-red-700">{formatearCantidad(-row.original.cantidad, unidad)}</span>
          ) : null,
      },
      {
        accessorKey: "saldo",
        header: "Saldo",
        cell: ({ row }) => (
          <span className={cn("font-medium", row.original.saldo < 0 && "text-red-700")}>
            {formatearCantidad(row.original.saldo, unidad)}
          </span>
        ),
      },
      {
        accessorKey: "observaciones",
        header: "Observaciones",
        cell: ({ row }) => (
          <span className="block max-w-xs truncate" title={row.original.observaciones ?? undefined}>
            {row.original.observaciones ?? "—"}
          </span>
        ),
      },
    ],
    [formatoFecha, unidad],
  );

  // El kardex llega del más antiguo al más reciente (así se acumula el saldo); en pantalla, al revés.
  const datos = useMemo(() => [...movimientos].reverse(), [movimientos]);

  return <DataTable data={datos} columns={columnas} filterPlaceholder="  Buscar movimiento..." />;
}
