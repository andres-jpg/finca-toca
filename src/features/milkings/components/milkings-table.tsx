"use client";

import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { EntityModal } from "@/components/shared/entity-modal";
import { MilkingForm } from "@/features/milkings/components/milking-form";
import { deleteMilking } from "@/features/milkings/actions/milkings.actions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Milking } from "@/types";

const columns: ColumnDef<Milking>[] = [
  {
    accessorKey: "date",
    header: "Fecha",
    cell: ({ getValue }) => {
      const date = new Date(getValue<string>() + "T00:00:00");
      return format(date, "dd/MM/yyyy", { locale: es });
    },
  },
  {
    accessorKey: "liters",
    header: "Litros",
    cell: ({ getValue }) => getValue<number>().toFixed(1),
  },
  {
    accessorKey: "observations",
    header: "Observaciones",
    cell: ({ getValue }) => getValue<string | null>() ?? "—",
  },
  {
    id: "actions",
    header: "Acciones",
    cell: ({ row }) => <RowActions milking={row.original} />,
  },
];

function RowActions({ milking }: { milking: Milking }) {
  const [editOpen, setEditOpen] = useState(false);

  const handleDelete = async () => {
    try {
      await deleteMilking(milking.id);
      toast.success("Ordeño eliminado");
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
      <EntityModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Editar ordeño"
      >
        <MilkingForm milking={milking} onSuccess={() => setEditOpen(false)} />
      </EntityModal>
    </div>
  );
}

interface MilkingsTableProps {
  milkings: Milking[];
}

export function MilkingsTable({ milkings }: MilkingsTableProps) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Ordeños</h2>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Agregar
        </Button>
      </div>
      <DataTable data={milkings} columns={columns} filterPlaceholder="Buscar ordeños..." />
      <EntityModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nuevo ordeño"
      >
        <MilkingForm onSuccess={() => setModalOpen(false)} />
      </EntityModal>
    </div>
  );
}
