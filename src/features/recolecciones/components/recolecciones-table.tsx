"use client";

import { useState, useMemo } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Plus, Pencil, Trash2, Eye } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { EntityModal } from "@/components/shared/entity-modal";
import { DeleteConfirmationDialog } from "@/components/shared/delete-confirmation-dialog";
import { RecoleccionForm } from "@/features/recolecciones/components/recoleccion-form";
import { deleteRecoleccion } from "@/features/recolecciones/actions/recolecciones.actions";
import { Button } from "@/components/ui/button";
import { MonthPicker } from "@/components/shared/month-picker";
import { DatePicker } from "@/components/shared/date-picker";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import type { Recoleccion, FincaCooperativa, RutaCooperativa } from "@/types";

function RecoleccionDetail({ rec }: { rec: Recoleccion }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Finca</p>
          <p className="font-medium">{rec.finca_nombre}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Ruta</p>
          <p className="font-medium">{rec.ruta_nombre ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Fecha</p>
          <p className="font-medium">
            {format(new Date(rec.fecha + "T00:00:00"), "dd/MM/yyyy", { locale: es })}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Litros</p>
          <p className="font-medium">{rec.litros.toLocaleString("es-CO")} L</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Precio/litro</p>
          <p className="font-medium">
            ${rec.precio_litro.toLocaleString("es-CO", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Valor total</p>
          <p className="font-semibold text-teal-700">
            ${rec.valor_total.toLocaleString("es-CO", { minimumFractionDigits: 0 })}
          </p>
        </div>
      </div>
    </div>
  );
}

function RowActions({
  rec,
  fincas,
  rutas,
  canEdit,
  canDelete,
  canViewDetail,
  lockDate,
  showPricing,
}: {
  rec: Recoleccion;
  fincas: FincaCooperativa[];
  rutas: RutaCooperativa[];
  canEdit: boolean;
  canDelete: boolean;
  canViewDetail: boolean;
  lockDate: boolean;
  showPricing: boolean;
}) {
  const [viewOpen, setViewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleDelete = async () => {
    try {
      await deleteRecoleccion(rec.id);
      toast.success("Recolección eliminada");
      setDeleteOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al eliminar");
    }
  };

  return (
    <>
      <div className="flex items-center gap-1">
        {canViewDetail && (
          <button
            onClick={() => setViewOpen(true)}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
            title="Ver detalle"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        )}
        {canEdit && (
          <button
            onClick={() => setEditOpen(true)}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
            title="Editar"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        {canDelete && (
          <button
            onClick={() => setDeleteOpen(true)}
            className="p-1.5 rounded hover:bg-red-50 text-red-400"
            title="Eliminar"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <EntityModal open={viewOpen} onClose={() => setViewOpen(false)} title="Detalle de recolección">
        <RecoleccionDetail rec={rec} />
      </EntityModal>

      {canEdit && (
        <EntityModal open={editOpen} onClose={() => setEditOpen(false)} title="Editar recolección">
          <RecoleccionForm
            recoleccion={rec}
            fincas={fincas}
            rutas={rutas}
            lockDate={lockDate}
            showPricing={showPricing}
            onSuccess={() => setEditOpen(false)}
          />
        </EntityModal>
      )}

      <DeleteConfirmationDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDelete}
        itemName={`recolección de ${rec.finca_nombre} del ${rec.fecha}`}
      />
    </>
  );
}

const RUTA_COLORS = [
  "bg-teal-100 text-teal-800",
  "bg-blue-100 text-blue-800",
  "bg-violet-100 text-violet-800",
  "bg-orange-100 text-orange-800",
  "bg-pink-100 text-pink-800",
  "bg-yellow-100 text-yellow-800",
  "bg-green-100 text-green-800",
  "bg-red-100 text-red-800",
];

interface RecoleccionesTableProps {
  recolecciones: Recoleccion[];
  fincas: FincaCooperativa[];
  rutas: RutaCooperativa[];
  canEdit: boolean;
  canDelete: boolean;
  canViewDetail: boolean;
  lockDate: boolean;
  todayOnly: boolean;
  showPricing: boolean;
}

export function RecoleccionesTable({
  recolecciones,
  fincas,
  rutas,
  canEdit,
  canDelete,
  canViewDetail,
  lockDate,
  todayOnly,
  showPricing,
}: RecoleccionesTableProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [periodMode, setPeriodMode] = useState<"mes" | "rango">("mes");
  const [fechaDesde, setFechaDesde] = useState<Date | undefined>(undefined);
  const [fechaHasta, setFechaHasta] = useState<Date | undefined>(undefined);
  const rangoInvalido = Boolean(fechaDesde && fechaHasta && fechaDesde > fechaHasta);
  const rangoActivo = periodMode === "rango" && fechaDesde && fechaHasta && !rangoInvalido;

  const rutaColorMap = useMemo(() => {
    const map = new Map<string, string>();
    let idx = 0;
    recolecciones.forEach((r) => {
      if (r.ruta_nombre && !map.has(r.ruta_nombre)) {
        map.set(r.ruta_nombre, RUTA_COLORS[idx % RUTA_COLORS.length]);
        idx++;
      }
    });
    return map;
  }, [recolecciones]);

  const filtered = useMemo(() => {
    if (todayOnly) {
      const today = formatDate(new Date()); // browser local date
      return recolecciones.filter((r) => r.fecha === today);
    }
    if (rangoActivo && fechaDesde && fechaHasta) {
      const desde = formatDate(fechaDesde);
      const hasta = formatDate(fechaHasta);
      return recolecciones.filter((r) => r.fecha >= desde && r.fecha <= hasta);
    }
    const year = selectedMonth.getFullYear();
    const month = String(selectedMonth.getMonth() + 1).padStart(2, "0");
    const prefix = `${year}-${month}`;
    return recolecciones.filter((r) => r.fecha.startsWith(prefix));
  }, [recolecciones, selectedMonth, todayOnly, rangoActivo, fechaDesde, fechaHasta]);

  // Fincas disponibles para CREAR: excluye las ya recolectadas hoy (solo para cooperativa_user)
  const fincasParaCrear = useMemo(() => {
    if (!todayOnly) return fincas;
    const recolectadasHoy = new Set(filtered.map((r) => r.finca_id));
    return fincas.filter((f) => !recolectadasHoy.has(f.id));
  }, [fincas, filtered, todayOnly]);

  const totalLitros = useMemo(
    () => filtered.reduce((acc, r) => acc + r.litros, 0),
    [filtered]
  );

  const totalValor = useMemo(
    () => filtered.reduce((acc, r) => acc + r.valor_total, 0),
    [filtered]
  );

  const columns: ColumnDef<Recoleccion>[] = useMemo(() => {
    const base: ColumnDef<Recoleccion>[] = [
      {
        accessorKey: "fecha",
        header: "Fecha",
        cell: ({ getValue }) =>
          format(new Date(getValue<string>() + "T00:00:00"), "dd/MM/yyyy", { locale: es }),
      },
      {
        accessorKey: "finca_nombre",
        header: "Finca",
      },
      {
        accessorKey: "ruta_nombre",
        header: "Ruta",
        cell: ({ getValue }) => {
          const ruta = getValue<string | null>();
          if (!ruta) return <span className="text-gray-400 text-sm">—</span>;
          const colorClass = rutaColorMap.get(ruta) ?? RUTA_COLORS[0];
          return (
            <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${colorClass}`}>
              {ruta}
            </span>
          );
        },
      },
      {
        accessorKey: "litros",
        header: "Litros",
        cell: ({ getValue }) =>
          `${getValue<number>().toLocaleString("es-CO", { minimumFractionDigits: 1 })} L`,
      },
    ];

    if (showPricing) {
      base.push(
        {
          accessorKey: "precio_litro",
          header: "Precio/L",
          cell: ({ getValue }) =>
            `$${getValue<number>().toLocaleString("es-CO", { minimumFractionDigits: 2 })}`,
        },
        {
          accessorKey: "valor_total",
          header: "Valor total",
          cell: ({ getValue }) =>
            `$${getValue<number>().toLocaleString("es-CO", { minimumFractionDigits: 0 })}`,
        }
      );
    }

    base.push({
      id: "actions",
      header: "Acciones",
      cell: ({ row }) => (
        <RowActions
          rec={row.original}
          fincas={fincas}
          rutas={rutas}
          canEdit={canEdit}
          canDelete={canDelete}
          canViewDetail={canViewDetail}
          lockDate={lockDate}
          showPricing={showPricing}
        />
      ),
    });

    return base;
  }, [canEdit, canDelete, canViewDetail, lockDate, showPricing, fincas, rutas, rutaColorMap]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800 tracking-tight">
            Recolecciones
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {filtered.length} registro(s) {rangoActivo ? "en el rango seleccionado" : "este mes"}
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nueva recolección
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm">
        {todayOnly ? (
          <span className="text-sm font-medium text-gray-600">
            Recolecciones de hoy
          </span>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setPeriodMode("mes")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  periodMode === "mes"
                    ? "bg-teal-600 text-white border-teal-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-teal-300"
                }`}
              >
                Por mes
              </button>
              <button
                type="button"
                onClick={() => setPeriodMode("rango")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  periodMode === "rango"
                    ? "bg-teal-600 text-white border-teal-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-teal-300"
                }`}
              >
                Rango libre
              </button>
            </div>

            {periodMode === "mes" ? (
              <MonthPicker value={selectedMonth} onChange={setSelectedMonth} />
            ) : (
              <div className="flex flex-col gap-1">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="w-40">
                    <DatePicker
                      value={fechaDesde}
                      onChange={setFechaDesde}
                      placeholder="Desde"
                      disableFuture
                    />
                  </div>
                  <div className="w-40">
                    <DatePicker
                      value={fechaHasta}
                      onChange={setFechaHasta}
                      placeholder="Hasta"
                      disableFuture
                    />
                  </div>
                </div>
                {rangoInvalido && (
                  <span className="text-xs text-red-500">
                    La fecha inicio debe ser anterior a la fecha fin
                  </span>
                )}
              </div>
            )}
          </div>
        )}
        {filtered.length > 0 && (
          <div className="flex gap-4 ml-auto text-sm">
            <span className="text-gray-600">
              Total:{" "}
              <span className="font-semibold text-gray-800">
                {totalLitros.toLocaleString("es-CO", { minimumFractionDigits: 1 })} L
              </span>
            </span>
            {showPricing && (
              <span className="text-gray-600">
                Valor:{" "}
                <span className="font-semibold text-teal-700">
                  ${totalValor.toLocaleString("es-CO", { minimumFractionDigits: 0 })}
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        filterPlaceholder="Buscar por finca o ruta..."
      />

      {canEdit && (
        <EntityModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Nueva recolección"
        >
          <RecoleccionForm
            fincas={fincasParaCrear}
            rutas={rutas}
            lockDate={lockDate}
            showPricing={showPricing}
            onSuccess={() => setModalOpen(false)}
          />
        </EntityModal>
      )}
    </div>
  );
}
