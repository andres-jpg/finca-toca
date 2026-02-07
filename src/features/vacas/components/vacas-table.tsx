"use client";

import { useState, useMemo } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { EntityModal } from "@/components/shared/entity-modal";
import { DeleteConfirmationDialog } from "@/components/shared/delete-confirmation-dialog";
import { VacaForm } from "@/features/vacas/components/vaca-form";
import { deleteVaca } from "@/features/vacas/actions/vacas.actions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Vaca } from "@/types";

function RowActions({ vaca, canEdit }: { vaca: Vaca; canEdit: boolean }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleDelete = async () => {
    try {
      await deleteVaca(vaca.id);
      toast.success("Vaca eliminada");
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
      <div className="flex gap-2">
        <button
          onClick={() => setEditOpen(true)}
          className="text-gray-500 hover:text-gray-700"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={() => setDeleteOpen(true)}
          className="text-gray-500 hover:text-red-600"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <EntityModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Editar vaca"
      >
        <VacaForm vaca={vaca} onSuccess={() => setEditOpen(false)} />
      </EntityModal>

      <DeleteConfirmationDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDelete}
        itemName={`${vaca.nombre} (#${vaca.vaca_id})`}
      />
    </>
  );
}

interface VacasTableProps {
  vacas: Vaca[];
  canEdit: boolean;
}

export function VacasTable({ vacas, canEdit }: VacasTableProps) {
  const [modalOpen, setModalOpen] = useState(false);

  const columns: ColumnDef<Vaca>[] = useMemo(
    () => [
      {
        accessorKey: "vaca_id",
        header: "ID",
        cell: ({ getValue }) => `#${getValue<number>()}`,
      },
      {
        accessorKey: "nombre",
        header: "Nombre",
      },
      {
        id: "actions",
        header: "Acciones",
        cell: ({ row }) => <RowActions vaca={row.original} canEdit={canEdit} />,
      },
    ],
    [canEdit]
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Vacas</h2>
          <p className="text-sm text-gray-500 mt-1">
            {vacas.length} vaca(s) registrada(s)
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setModalOpen(true)} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Agregar Vaca
          </Button>
        )}
      </div>

      <DataTable data={vacas} columns={columns} filterPlaceholder="Buscar vaca..." />
      {canEdit && (
        <EntityModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Nueva vaca"
        >
          <VacaForm onSuccess={() => setModalOpen(false)} />
        </EntityModal>
      )}
    </div>
  );
}
