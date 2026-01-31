"use client";

import { useState } from "react";
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
import type { Ingreso } from "@/types";

const columns: ColumnDef<Ingreso>[] = [
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
    cell: ({ getValue }) => `$${getValue<number>().toLocaleString("es-AR", { minimumFractionDigits: 2 })}`,
  },
  {
    accessorKey: "observaciones",
    header: "Observaciones",
    cell: ({ getValue }) => getValue<string | null>() ?? "—",
  },
  {
    id: "actions",
    header: "Acciones",
    cell: ({ row }) => <RowActions ingreso={row.original} />,
  },
];

function RowActions({ ingreso }: { ingreso: Ingreso }) {
  const [editOpen, setEditOpen] = useState(false);

  const handleDelete = async () => {
    try {
      await deleteIngreso(ingreso.id);
      toast.success("Ingreso eliminado");
    } catch {
      toast.error("Error al eliminar");
    }
  };

  return (
    <div className="flex gap-2">
      <button onClick={() => setEditOpen(true)} className="text-gray-500 hover:text-gray-700">
        <Pencil className="h-4 w-4" />
      </button>
      <button onClick={handleDelete} className="text-gray-500 hover:text-red-600">
        <Trash2 className="h-4 w-4" />
      </button>
      <EntityModal open={editOpen} onClose={() => setEditOpen(false)} title="Editar ingreso">
        <IngresoForm ingreso={ingreso} onSuccess={() => setEditOpen(false)} />
      </EntityModal>
    </div>
  );
}

interface IngresosTableProps {
  ingresos: Ingreso[];
}

export function IngresosTable({ ingresos }: IngresosTableProps) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Ingresos</h2>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Agregar
        </Button>
      </div>
      <DataTable data={ingresos} columns={columns} filterPlaceholder="Buscar ingresos..." />
      <EntityModal open={modalOpen} onClose={() => setModalOpen(false)} title="Nuevo ingreso">
        <IngresoForm onSuccess={() => setModalOpen(false)} />
      </EntityModal>
    </div>
  );
}
