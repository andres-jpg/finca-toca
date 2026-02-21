"use client";

import { useState, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
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
import { ChevronLeft, ChevronRight, Search, ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";

interface DataTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData>[];
  filterPlaceholder?: string;
}

export function DataTable<TData>({
  data,
  columns,
  filterPlaceholder = "Buscar...",
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });

  const filteredData = useMemo(() => {
    if (!globalFilter) return data;
    const lower = globalFilter.toLowerCase();
    return data.filter((row) =>
      Object.values(row as Record<string, unknown>).some((val) =>
        String(val).toLowerCase().includes(lower)
      )
    );
  }, [data, globalFilter]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, columnFilters, pagination },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const totalPages = Math.max(1, table.getPageCount());
  const currentPage = table.getState().pagination.pageIndex + 1;

  return (
    <div>
      {filterPlaceholder && (
        <div className="relative">
          <input
            placeholder={filterPlaceholder}
            value={globalFilter}
            onChange={(e) => {
              setGlobalFilter(e.target.value);
              setPagination((prev) => ({ ...prev, pageIndex: 0 }));
            }}
            className="pl-4 pr-9 py-2 text-sm w-full sm:max-w-xs rounded-lg border border-stone-200 bg-white text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-green-600/20 focus:border-green-600 transition-colors"
          />
        </div>
      )}

      <div className="rounded-xl border border-stone-200 overflow-hidden shadow-sm bg-white mt-2">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="border-b border-stone-200 hover:bg-transparent">
                  {headerGroup.headers.map((header) => {
                    const sorted = header.column.getIsSorted();
                    return (
                      <TableHead
                        key={header.id}
                        className="cursor-pointer select-none whitespace-nowrap bg-stone-50 font-medium text-stone-600 text-xs uppercase tracking-wide py-3"
                        onClick={() =>
                          header.column.toggleSorting(sorted === "asc")
                        }
                      >
                        <div className="flex items-center gap-1.5">
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                          {sorted === "asc" ? (
                            <ChevronUp className="h-3 w-3 text-green-600" />
                          ) : sorted === "desc" ? (
                            <ChevronDown className="h-3 w-3 text-green-600" />
                          ) : (
                            <ChevronsUpDown className="h-3 w-3 text-stone-300" />
                          )}
                        </div>
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowCount() === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="text-center text-stone-400 py-12 text-sm"
                  >
                    No se encontraron registros
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="border-b border-stone-100 hover:bg-stone-50/70 transition-colors duration-100"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="whitespace-nowrap py-3 text-sm text-stone-700">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1">
        <span className="text-xs text-stone-400 order-2 sm:order-1">
          Página {currentPage} de {totalPages}
        </span>
        <div className="flex gap-1.5 order-1 sm:order-2 mt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="h-8 border-stone-200 text-stone-600 hover:bg-stone-50 disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline ml-1">Anterior</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="h-8 border-stone-200 text-stone-600 hover:bg-stone-50 disabled:opacity-40"
          >
            <span className="hidden sm:inline mr-1">Siguiente</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
