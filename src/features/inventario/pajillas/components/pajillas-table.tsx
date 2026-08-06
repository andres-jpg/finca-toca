"use client";

import { useState, useMemo } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Plus, Trash2, Eye, Pencil, FlaskConical, FlaskRound } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { EntityModal } from "@/components/shared/entity-modal";
import { DeleteConfirmationDialog } from "@/components/shared/delete-confirmation-dialog";
import { PajillaForm } from "@/features/inventario/pajillas/components/pajilla-form";
import { UsarPajillasForm } from "@/features/inventario/pajillas/components/usar-pajillas-form";
import { deletePajilla } from "@/features/inventario/pajillas/actions/pajillas.actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RAZA_LABELS } from "@/lib/animales/razas";
import { toast } from "sonner";
import type { Pajilla, PajillaPorToro } from "@/types";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-gray-900">{value || <span className="text-gray-400">—</span>}</p>
    </div>
  );
}

function PajillaDetail({ pajilla }: { pajilla: Pajilla }) {
  const fecha = format(new Date(pajilla.fecha_compra + "T00:00:00"), "dd 'de' MMMM yyyy", { locale: es });
  const usadas = pajilla.cantidad - pajilla.cantidad_disponible;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Nombre del toro" value={pajilla.toro_nombre} />
        <Field label="ID del toro" value={pajilla.toro_ref_id} />
        <Field label="Raza" value={pajilla.raza ? RAZA_LABELS[pajilla.raza] : null} />
        <Field label="Proveedor" value={pajilla.proveedor} />
        <Field label="Fecha de compra" value={fecha} />
        <Field label="Cantidad inicial" value={`${pajilla.cantidad} pajillas`} />
        <Field
          label="Disponibles"
          value={
            <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
              {pajilla.cantidad_disponible} pajillas
            </Badge>
          }
        />
        <Field
          label="Usadas"
          value={
            usadas > 0 ? (
              <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                {usadas} pajillas
              </Badge>
            ) : (
              <span className="text-gray-400">Ninguna</span>
            )
          }
        />
      </div>
      {pajilla.observaciones && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Observaciones</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{pajilla.observaciones}</p>
        </div>
      )}
    </div>
  );
}

function RowActions({
  pajilla,
  canEdit,
}: {
  pajilla: Pajilla;
  canEdit: boolean;
}) {
  const [viewOpen, setViewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [usarOpen, setUsarOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleDelete = async () => {
    try {
      await deletePajilla(pajilla.id);
      toast.success("Lote eliminado");
      setDeleteOpen(false);
    } catch {
      toast.error("Error al eliminar");
    }
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setViewOpen(true)}
          className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          title="Ver detalle"
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
        {canEdit && (
          <>
            <button
              onClick={() => setEditOpen(true)}
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              title="Editar lote"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setUsarOpen(true)}
              disabled={pajilla.cantidad_disponible === 0}
              className="p-1.5 rounded-md text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Usar pajillas"
            >
              <FlaskConical className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setDeleteOpen(true)}
              className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              title="Eliminar lote"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>

      <EntityModal open={viewOpen} onClose={() => setViewOpen(false)} title="Detalle del lote">
        <PajillaDetail pajilla={pajilla} />
      </EntityModal>

      {canEdit && (
        <>
          <EntityModal open={editOpen} onClose={() => setEditOpen(false)} title="Editar lote">
            <PajillaForm pajilla={pajilla} onSuccess={() => setEditOpen(false)} />
          </EntityModal>

          <EntityModal open={usarOpen} onClose={() => setUsarOpen(false)} title="Usar pajillas">
            <UsarPajillasForm pajilla={pajilla} onSuccess={() => setUsarOpen(false)} />
          </EntityModal>

          <DeleteConfirmationDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            onConfirm={handleDelete}
            itemName={`lote de ${pajilla.toro_nombre} (${pajilla.cantidad} pajillas)`}
          />
        </>
      )}
    </>
  );
}

function ResumenPorToro({ porToro }: { porToro: PajillaPorToro[] }) {
  if (porToro.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-sm font-semibold text-gray-700">Disponibles por toro</p>
      </div>
      <div className="divide-y divide-gray-100">
        {porToro.map((item) => (
          <div key={item.clave} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-800">{item.toro_nombre}</p>
              <p className="text-xs text-gray-400">{item.toro_ref_id}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-gray-900">{item.total_disponible}</p>
              <p className="text-xs text-gray-400">de {item.total_inicial}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface PajillasTableProps {
  pajillas: Pajilla[];
  porToro: PajillaPorToro[];
  canEdit: boolean;
}

export function PajillasTable({ pajillas, porToro, canEdit }: PajillasTableProps) {
  const [modalOpen, setModalOpen] = useState(false);

  const totalDisponible = useMemo(
    () => pajillas.reduce((sum, p) => sum + p.cantidad_disponible, 0),
    [pajillas]
  );

  const totalInicial = useMemo(
    () => pajillas.reduce((sum, p) => sum + p.cantidad, 0),
    [pajillas]
  );

  const columns: ColumnDef<Pajilla>[] = useMemo(
    () => [
      {
        accessorKey: "toro_nombre",
        header: "Toro",
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-gray-800">{row.original.toro_nombre}</p>
            <p className="text-xs text-gray-400">{row.original.toro_ref_id}</p>
          </div>
        ),
      },
      {
        accessorKey: "raza",
        header: "Raza",
        cell: ({ getValue }) => {
          const raza = getValue<Pajilla["raza"]>();
          return raza ? RAZA_LABELS[raza] : <span className="text-gray-400">—</span>;
        },
      },
      {
        accessorKey: "fecha_compra",
        header: "Fecha compra",
        cell: ({ getValue }) =>
          format(new Date(getValue<string>() + "T00:00:00"), "dd/MM/yyyy", { locale: es }),
      },
      {
        accessorKey: "cantidad",
        header: "Inicial",
        cell: ({ getValue }) => (
          <span className="font-medium">{getValue<number>()}</span>
        ),
      },
      {
        accessorKey: "cantidad_disponible",
        header: "Disponibles",
        cell: ({ getValue, row }) => {
          const disponible = getValue<number>();
          const total = row.original.cantidad;
          const agotado = disponible === 0;
          return (
            <Badge
              className={
                agotado
                  ? "bg-red-100 text-red-700 hover:bg-red-100"
                  : disponible === total
                  ? "bg-green-100 text-green-700 hover:bg-green-100"
                  : "bg-amber-100 text-amber-700 hover:bg-amber-100"
              }
            >
              {disponible}
            </Badge>
          );
        },
      },
      {
        id: "usadas",
        header: "Usadas",
        cell: ({ row }) => {
          const usadas = row.original.cantidad - row.original.cantidad_disponible;
          return <span className="text-gray-500">{usadas}</span>;
        },
      },
      {
        id: "actions",
        header: "Acciones",
        cell: ({ row }) => (
          <RowActions pajilla={row.original} canEdit={canEdit} />
        ),
      },
    ],
    [canEdit]
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800 tracking-tight">Pajillas</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {pajillas.length} lote(s) registrado(s)
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setModalOpen(true)} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Agregar pajillas
          </Button>
        )}
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
            <FlaskRound className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total disponibles</p>
            <p className="text-2xl font-bold text-gray-900">{totalDisponible}</p>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
            <FlaskConical className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total histórico</p>
            <p className="text-2xl font-bold text-gray-900">{totalInicial}</p>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
            <FlaskConical className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total usadas</p>
            <p className="text-2xl font-bold text-gray-900">{totalInicial - totalDisponible}</p>
          </div>
        </div>
      </div>

      {/* Breakdown by bull */}
      {porToro.length > 0 && <ResumenPorToro porToro={porToro} />}

      {/* Table */}
      <DataTable
        data={pajillas}
        columns={columns}
        filterPlaceholder="Buscar por toro, ID..."
      />

      {canEdit && (
        <EntityModal open={modalOpen} onClose={() => setModalOpen(false)} title="Agregar pajillas">
          <PajillaForm onSuccess={() => setModalOpen(false)} />
        </EntityModal>
      )}
    </div>
  );
}
