"use client";

import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { EntityModal } from "@/components/shared/entity-modal";
import { GastoForm } from "@/features/gastos/components/gasto-form";
import { deleteGasto } from "@/features/gastos/actions/gastos.actions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Gasto } from "@/types";

const columns: ColumnDef<Gasto>[] = [
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
    cell: ({ row }) => <RowActions gasto={row.original} />,
  },
];

function RowActions({ gasto }: { gasto: Gasto }) {
  const [editOpen, setEditOpen] = useState(false);

  const handleDelete = async () => {
    try {
      await deleteGasto(gasto.id);
      toast.success("Gasto eliminado");
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
      <EntityModal open={editOpen} onClose={() => setEditOpen(false)} title="Editar gasto">
        <GastoForm gasto={gasto} onSuccess={() => setEditOpen(false)} />
      </EntityModal>
    </div>
  );
}

interface GastosTableProps {
  gastos: Gasto[];
}

export function GastosTable({ gastos }: GastosTableProps) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Gastos</h2>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Agregar
        </Button>
      </div>
      <DataTable data={gastos} columns={columns} filterPlaceholder="Buscar gastos..." />
      <EntityModal open={modalOpen} onClose={() => setModalOpen(false)} title="Nuevo gasto">
        <GastoForm onSuccess={() => setModalOpen(false)} />
      </EntityModal>
    </div>
  );
}
