"use client";

import { useState, useMemo } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { EntityModal } from "@/components/shared/entity-modal";
import { IngresoForm } from "@/features/ingresos/components/ingreso-form";
import { deleteIngreso } from "@/features/ingresos/actions/ingresos.actions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MonthPicker } from "@/components/shared/month-picker";
import type { Ingreso } from "@/types";

function RowActions({ ingreso, canEdit }: { ingreso: Ingreso; canEdit: boolean }) {
  const [editOpen, setEditOpen] = useState(false);

  const handleDelete = async () => {
    try {
      await deleteIngreso(ingreso.id);
      toast.success("Ingreso eliminado");
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
        title="Editar ingreso"
      >
        <IngresoForm ingreso={ingreso} onSuccess={() => setEditOpen(false)} />
      </EntityModal>
    </div>
  );
}

interface IngresosTableProps {
  ingresos: Ingreso[];
  canEdit: boolean;
}

export function IngresosTable({ ingresos, canEdit }: IngresosTableProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  // Filtrar ingresos por mes seleccionado
  const filteredIngresos = useMemo(() => {
    return ingresos.filter((ingreso) => {
      const ingresoDate = new Date(ingreso.fecha + "T00:00:00");
      return (
        ingresoDate.getMonth() === selectedMonth.getMonth() &&
        ingresoDate.getFullYear() === selectedMonth.getFullYear()
      );
    });
  }, [ingresos, selectedMonth]);

  const columns: ColumnDef<Ingreso>[] = useMemo(
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
        accessorKey: "concepto",
        header: "Concepto",
      },
      {
        accessorKey: "valor",
        header: "Valor",
        cell: ({ getValue }) =>
          `$${getValue<number>().toLocaleString("es-AR", { minimumFractionDigits: 2 })}`,
      },
      {
        accessorKey: "observaciones",
        header: "Observaciones",
        cell: ({ getValue }) => getValue<string | null>() ?? "—",
      },
      {
        id: "actions",
        header: "Acciones",
        cell: ({ row }) => (
          <RowActions ingreso={row.original} canEdit={canEdit} />
        ),
      },
    ],
    [canEdit]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Ingresos</h2>
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
          {filteredIngresos.length} registro(s)
        </span>
      </div>

      <DataTable
        data={filteredIngresos}
        columns={columns}
        filterPlaceholder=""
      />
      {canEdit && (
        <EntityModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Nuevo ingreso"
        >
          <IngresoForm onSuccess={() => setModalOpen(false)} />
        </EntityModal>
      )}
    </div>
  );
}
