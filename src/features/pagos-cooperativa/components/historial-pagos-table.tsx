"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ColumnDef,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  flexRender,
  ColumnFiltersState,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/shared/date-picker";
import { Label } from "@/components/ui/label";
import type { PagoFinca, Itinerario } from "@/types";
import { updateEstadoPago } from "../actions/pagos.actions";

const ESTADO_BADGE: Record<string, { label: string; className: string }> = {
  pendiente: { label: "Pendiente", className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  pagado: { label: "Pagado", className: "bg-green-100 text-green-800 border-green-200" },
  punto_venta: { label: "Punto de venta", className: "bg-blue-100 text-blue-800 border-blue-200" },
  devuelto: { label: "No asignado", className: "bg-red-100 text-red-800 border-red-200" },
};

const RESPONSABLE_LABELS: Record<string, string> = {
  conductor: "Conductor",
  punto_venta: "Punto de venta",
  gerente: "Gerente",
};

function EstadoSelector({
  pago,
  onUpdated,
}: {
  pago: PagoFinca;
  onUpdated: (id: number, estado: PagoFinca["estado"]) => void;
}) {
  const [isPending, startTransition] = useTransition();

  const handleChange = (val: string) => {
    const nuevo = val as PagoFinca["estado"];
    startTransition(async () => {
      try {
        await updateEstadoPago(pago.id, nuevo);
        onUpdated(pago.id, nuevo);
        toast.success("Estado actualizado");
      } catch {
        toast.error("Error al actualizar el estado");
      }
    });
  };

  return (
    <Select value={pago.estado} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger className="h-7 text-xs w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="pendiente">Pendiente</SelectItem>
        <SelectItem value="pagado">Pagado</SelectItem>
        <SelectItem value="punto_venta">Punto de venta</SelectItem>
        <SelectItem value="devuelto">No asignado</SelectItem>
      </SelectContent>
    </Select>
  );
}

interface HistorialPagosTableProps {
  initialData: PagoFinca[];
  itinerarios: Pick<Itinerario, "id" | "nombre">[];
}

export function HistorialPagosTable({ initialData, itinerarios }: HistorialPagosTableProps) {
  const [data, setData] = useState<PagoFinca[]>(initialData);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  // Filtros locales
  const [filterItinerario, setFilterItinerario] = useState("todos");
  const [filterEstado, setFilterEstado] = useState("todos");
  const [filterResponsable, setFilterResponsable] = useState("todos");
  const [filterDesde, setFilterDesde] = useState<Date | undefined>();
  const [filterHasta, setFilterHasta] = useState<Date | undefined>();

  const toISO = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(d);

  const filtered = data.filter((p) => {
    if (filterItinerario !== "todos" && String(p.itinerario_id ?? "__none__") !== filterItinerario) return false;
    if (filterEstado !== "todos" && p.estado !== filterEstado) return false;
    if (filterResponsable !== "todos" && p.responsable !== filterResponsable) return false;
    if (filterDesde && p.fecha_inicio < toISO(filterDesde)) return false;
    if (filterHasta && p.fecha_fin > toISO(filterHasta)) return false;
    return true;
  });

  const handleUpdated = useCallback((id: number, estado: PagoFinca["estado"]) => {
    setData((prev) => prev.map((p) => (p.id === id ? { ...p, estado } : p)));
  }, []);

  const columns: ColumnDef<PagoFinca>[] = useMemo(() => [
    {
      accessorKey: "finca_nombre",
      header: "Finca",
    },
    {
      accessorKey: "itinerario_nombre",
      header: "Itinerario",
      cell: ({ row }) => row.original.itinerario_nombre ?? <span className="text-muted-foreground text-xs">Sin itinerario</span>,
    },
    {
      id: "periodo",
      header: "Período",
      cell: ({ row }) => {
        const { fecha_inicio, fecha_fin } = row.original;
        const fmt = (s: string) => format(new Date(s + "T12:00:00"), "d MMM", { locale: es });
        return `${fmt(fecha_inicio)} – ${fmt(fecha_fin)}`;
      },
    },
    {
      accessorKey: "responsable",
      header: "Responsable",
      cell: ({ row }) => RESPONSABLE_LABELS[row.original.responsable] ?? row.original.responsable,
    },
    {
      accessorKey: "litros",
      header: "Litros",
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.litros.toLocaleString("es-CO", { maximumFractionDigits: 1 })} L
        </span>
      ),
    },
    {
      accessorKey: "estado",
      header: "Estado",
      cell: ({ row }) => {
        const badge = ESTADO_BADGE[row.original.estado];
        return (
          <Badge variant="outline" className={badge?.className}>
            {badge?.label ?? row.original.estado}
          </Badge>
        );
      },
    },
    {
      accessorKey: "fecha_marcado",
      header: "Marcado el",
      cell: ({ row }) => {
        const fm = row.original.fecha_marcado;
        if (!fm) return <span className="text-muted-foreground text-xs">—</span>;
        return format(new Date(fm), "d MMM yyyy HH:mm", { locale: es });
      },
    },
    {
      id: "acciones",
      header: "Cambiar estado",
      cell: ({ row }) => (
        <EstadoSelector pago={row.original} onUpdated={handleUpdated} />
      ),
    },
  ], [handleUpdated]);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { columnFilters },
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <h3 className="text-sm font-semibold">Filtros</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Itinerario</Label>
            <Select value={filterItinerario} onValueChange={setFilterItinerario}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {itinerarios.map((it) => (
                  <SelectItem key={it.id} value={String(it.id)}>
                    {it.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Estado</Label>
            <Select value={filterEstado} onValueChange={setFilterEstado}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pendiente">Pendiente</SelectItem>
                <SelectItem value="pagado">Pagado</SelectItem>
                <SelectItem value="punto_venta">Punto de venta</SelectItem>
                <SelectItem value="devuelto">No asignado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Responsable</Label>
            <Select value={filterResponsable} onValueChange={setFilterResponsable}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="conductor">Conductor</SelectItem>
                <SelectItem value="punto_venta">Punto de venta</SelectItem>
                <SelectItem value="gerente">Gerente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Desde</Label>
            <DatePicker
              value={filterDesde}
              onChange={setFilterDesde}
              placeholder="Fecha inicio"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Hasta</Label>
            <DatePicker
              value={filterHasta}
              onChange={setFilterHasta}
              placeholder="Fecha fin"
            />
          </div>
        </div>

        {(filterItinerario !== "todos" || filterEstado !== "todos" || filterResponsable !== "todos" || filterDesde || filterHasta) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilterItinerario("todos");
              setFilterEstado("todos");
              setFilterResponsable("todos");
              setFilterDesde(undefined);
              setFilterHasta(undefined);
            }}
          >
            Limpiar filtros
          </Button>
        )}
      </div>

      {/* Contador */}
      <p className="text-xs text-muted-foreground">
        {filtered.length} registro{filtered.length !== 1 ? "s" : ""}
        {filtered.length !== data.length ? ` de ${data.length}` : ""}
      </p>

      {/* Tabla */}
      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id} className="text-xs font-medium whitespace-nowrap">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-10 text-muted-foreground text-sm">
                  Sin registros
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="text-sm py-2.5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Paginación */}
      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount()}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
