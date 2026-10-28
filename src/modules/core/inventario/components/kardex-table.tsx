"use client";

import Link from "next/link";
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
  /** `created_by` → nombre a mostrar. Si se pasa, la tabla añade la columna «Usuario». */
  usuarios?: Record<string, string>;
  /** `ref_id` → nombre a mostrar (p. ej. el proveedor de una compra). Si se pasa, añade «Referencia». */
  referencias?: Record<string, string>;
  /** `ref_id` → ruta a la que enlaza su referencia (p. ej. el lote que se empacó). Sin entrada, solo texto. */
  enlaces?: Record<string, string>;
}

/** Kardex de un artículo: entradas, salidas y saldo tras cada movimiento (más reciente arriba). */
export function KardexTable({
  movimientos,
  unidad = "unidad",
  zonaHoraria = "America/Bogota",
  usuarios,
  referencias,
  enlaces,
}: KardexTableProps) {
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
      ...(referencias
        ? [
            {
              id: "referencia",
              header: "Referencia",
              accessorFn: (m: MovimientoKardex) => (m.ref_id ? (referencias[m.ref_id] ?? "") : ""),
              cell: ({ row }: { row: { original: MovimientoKardex } }) => {
                const texto = (row.original.ref_id && referencias[row.original.ref_id]) || "—";
                const href = row.original.ref_id ? enlaces?.[row.original.ref_id] : undefined;
                return href ? (
                  <Link href={href} className="block max-w-[10rem] truncate font-medium text-blue-700 underline-offset-2 hover:underline">
                    {texto}
                  </Link>
                ) : (
                  <span className="block max-w-[10rem] truncate">{texto}</span>
                );
              },
            } satisfies ColumnDef<MovimientoKardex>,
          ]
        : []),
      ...(usuarios
        ? [
            {
              id: "usuario",
              header: "Usuario",
              accessorFn: (m: MovimientoKardex) => (m.created_by ? (usuarios[m.created_by] ?? "") : ""),
              cell: ({ row }: { row: { original: MovimientoKardex } }) => (
                <span className="block max-w-[10rem] truncate">
                  {row.original.created_by ? (usuarios[row.original.created_by] ?? "—") : "Sistema"}
                </span>
              ),
            } satisfies ColumnDef<MovimientoKardex>,
          ]
        : []),
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
    [formatoFecha, unidad, usuarios, referencias, enlaces],
  );

  // El kardex llega del más antiguo al más reciente (así se acumula el saldo); en pantalla, al revés.
  const datos = useMemo(() => [...movimientos].reverse(), [movimientos]);

  return <DataTable data={datos} columns={columnas} filterPlaceholder="  Buscar movimiento..." />;
}
