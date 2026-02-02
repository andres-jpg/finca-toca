"use client";

import { useState, useMemo } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { EntityModal } from "@/components/shared/entity-modal";
import { ExtraccionForm } from "@/features/extracciones/components/extraccion-form";
import { deleteExtraccion } from "@/features/extracciones/actions/extracciones.actions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MonthPicker } from "@/components/shared/month-picker";
import type { ExtraccionLeche } from "@/types";

function RowActions({
  extraccion,
  canEdit,
}: {
  extraccion: ExtraccionLeche;
  canEdit: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);

  const handleDelete = async () => {
    try {
      await deleteExtraccion(extraccion.id);
      toast.success("Extracción eliminada");
    } catch {
      toast.error("Error al eliminar");
    }
  };

  if (!canEdit) {
    return <span className="text-xs text-gray-400">Solo lectura</span>;
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => setEditOpen(true)}
        className="text-gray-500 hover:text-gray-700"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        onClick={handleDelete}
        className="text-gray-500 hover:text-red-600"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <EntityModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Editar extracción"
      >
        <ExtraccionForm
          extraccion={extraccion}
          onSuccess={() => setEditOpen(false)}
        />
      </EntityModal>
    </div>
  );
}

interface ExtraccionesTableProps {
  extracciones: ExtraccionLeche[];
  canEdit: boolean;
}

export function ExtraccionesTable({
  extracciones,
  canEdit,
}: ExtraccionesTableProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  // Filtrar extracciones por mes seleccionado
  const filteredExtracciones = useMemo(() => {
    return extracciones.filter((extraccion) => {
      const extraccionDate = new Date(extraccion.fecha + "T00:00:00");
      return (
        extraccionDate.getMonth() === selectedMonth.getMonth() &&
        extraccionDate.getFullYear() === selectedMonth.getFullYear()
      );
    });
  }, [extracciones, selectedMonth]);

  const columns: ColumnDef<ExtraccionLeche>[] = useMemo(
    () => [
      {
        accessorKey: "fecha",
        header: "Fecha",
        cell: ({ getValue }) => {
          const date = new Date(getValue<string>() + "T00:00:00");
          return format(date, "dd/MM/yyyy", { locale: es });
        },
      },
      {
        accessorKey: "litros",
        header: "Litros",
        cell: ({ getValue }) => `${getValue<number>().toFixed(1)} L`,
      },
      {
        id: "actions",
        header: "Acciones",
        cell: ({ row }) => (
          <RowActions extraccion={row.original} canEdit={canEdit} />
        ),
      },
    ],
    [canEdit]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Extracciones de Leche</h2>
        {canEdit && (
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Agregar
          </Button>
        )}
      </div>

      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-600">Filtrar por mes:</span>
        <MonthPicker value={selectedMonth} onChange={setSelectedMonth} />
        <span className="text-sm text-gray-500">
          {filteredExtracciones.length} registro(s)
        </span>
      </div>

      <DataTable
        data={filteredExtracciones}
        columns={columns}
        filterPlaceholder=""
      />
      {canEdit && (
        <EntityModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Nueva extracción"
        >
          <ExtraccionForm onSuccess={() => setModalOpen(false)} />
        </EntityModal>
      )}
    </div>
  );
}
