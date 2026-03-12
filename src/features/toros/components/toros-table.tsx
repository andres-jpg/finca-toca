"use client";

import { useState, useMemo } from "react";
import { Plus, Pencil, Trash2, ArrowUpCircle } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { EntityModal } from "@/components/shared/entity-modal";
import { DeleteConfirmationDialog } from "@/components/shared/delete-confirmation-dialog";
import { ToroForm } from "@/features/toros/components/toro-form";
import { deleteToro } from "@/features/toros/actions/toros.actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { Toro, Vaca } from "@/types";

const ORIGEN_LABELS: Record<string, string> = {
  finca: "Finca",
  externa: "Externa",
};

function RowActions({
  toro,
  vacas,
  canEdit,
}: {
  toro: Toro;
  vacas: Vaca[];
  canEdit: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleDelete = async () => {
    try {
      await deleteToro(toro.id);
      toast.success("Toro eliminado");
      setDeleteOpen(false);
    } catch {
      toast.error("Error al eliminar");
    }
  };

  if (!canEdit) {
    return <span className="text-xs text-gray-400">Solo lectura</span>;
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setEditOpen(true)}
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          title="Editar"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => setDeleteOpen(true)}
          className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          title="Eliminar"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <EntityModal open={editOpen} onClose={() => setEditOpen(false)} title="Editar toro">
        <ToroForm toro={toro} vacas={vacas} onSuccess={() => setEditOpen(false)} />
      </EntityModal>

      <DeleteConfirmationDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDelete}
        itemName={`${toro.nombre} (#${toro.toro_id})`}
      />
    </>
  );
}

interface TorosTableProps {
  toros: Toro[];
  vacas: Vaca[];
  canEdit: boolean;
}

export function TorosTable({ toros, vacas, canEdit }: TorosTableProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [mostrarDeBaja, setMostrarDeBaja] = useState(false);

  const torosDeAlta = useMemo(() => toros.filter((t) => t.alta), [toros]);
  const torosDeBaja = useMemo(() => toros.filter((t) => !t.alta), [toros]);
  const torosMostrados = mostrarDeBaja ? torosDeBaja : torosDeAlta;

  const columns: ColumnDef<Toro>[] = useMemo(
    () => [
      {
        accessorKey: "toro_id",
        header: "ID",
        cell: ({ getValue }) => (
          <span className="font-mono text-gray-500">#{getValue<number>()}</span>
        ),
      },
      { accessorKey: "nombre", header: "Nombre" },
      {
        accessorKey: "origen",
        header: "Origen",
        cell: ({ getValue }) => {
          const val = getValue<string | null>();
          if (!val) return <span className="text-gray-400">—</span>;
          return (
            <Badge
              variant="outline"
              className={val === "externa" ? "text-orange-600 border-orange-300" : "text-gray-600"}
            >
              {ORIGEN_LABELS[val] ?? val}
            </Badge>
          );
        },
      },
      {
        accessorKey: "madre_nombre",
        header: "Madre",
        cell: ({ getValue }) => getValue<string | null>() ?? "—",
      },
      {
        id: "actions",
        header: "Acciones",
        cell: ({ row }) => (
          <RowActions toro={row.original} vacas={vacas} canEdit={canEdit} />
        ),
      },
    ],
    [canEdit, vacas]
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800 tracking-tight">Toros</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {mostrarDeBaja
              ? `${torosDeBaja.length} toro(s) de baja`
              : `${torosDeAlta.length} toro(s) de alta`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button
            variant="outline"
            onClick={() => setMostrarDeBaja((v) => !v)}
            className={mostrarDeBaja ? "border-orange-400 text-orange-600 hover:bg-orange-50" : ""}
          >
            <ArrowUpCircle className="h-4 w-4 mr-2" />
            {mostrarDeBaja ? "Ver de alta" : "Ver de baja"}
            {!mostrarDeBaja && torosDeBaja.length > 0 && (
              <span className="ml-1.5 text-xs bg-orange-100 text-orange-600 rounded-full px-1.5 py-0.5">
                {torosDeBaja.length}
              </span>
            )}
          </Button>
          {canEdit && !mostrarDeBaja && (
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Agregar Toro
            </Button>
          )}
        </div>
      </div>

      <DataTable data={torosMostrados} columns={columns} filterPlaceholder="Buscar toro..." />

      {canEdit && (
        <EntityModal open={modalOpen} onClose={() => setModalOpen(false)} title="Nuevo toro">
          <ToroForm vacas={vacas} onSuccess={() => setModalOpen(false)} />
        </EntityModal>
      )}
    </div>
  );
}
