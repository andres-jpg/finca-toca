"use client";

import { useState, useMemo } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { EntityModal } from "@/components/shared/entity-modal";
import { DeleteConfirmationDialog } from "@/components/shared/delete-confirmation-dialog";
import { GastoForm } from "@/features/gastos/components/gasto-form";
import { deleteGasto } from "@/features/gastos/actions/gastos.actions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MonthPicker } from "@/components/shared/month-picker";
import type { Gasto } from "@/types";

function RowActions({ gasto, canEdit }: { gasto: Gasto; canEdit: boolean }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleDelete = async () => {
    try {
      await deleteGasto(gasto.id);
      toast.success("Gasto eliminado");
      setDeleteOpen(false);
    } catch {
      toast.error("Error al eliminar");
    }
  };

  if (!canEdit) {
    return <span className="text-xs text-gray-400">Solo lectura</span>;
  }

  const gastoDate = format(
    new Date(gasto.fecha + "T00:00:00"),
    "dd/MM/yyyy",
    { locale: es }
  );
  const gastoValue = `$${gasto.valor.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;

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
        title="Editar gasto"
      >
        <GastoForm gasto={gasto} onSuccess={() => setEditOpen(false)} />
      </EntityModal>

      <DeleteConfirmationDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDelete}
        itemName={`${gasto.concepto} del ${gastoDate} (${gastoValue})`}
      />
    </>
  );
}

interface GastosTableProps {
  gastos: Gasto[];
  canEdit: boolean;
}

export function GastosTable({ gastos, canEdit }: GastosTableProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  // Filtrar gastos por mes seleccionado
  const filteredGastos = useMemo(() => {
    return gastos.filter((gasto) => {
      const gastoDate = new Date(gasto.fecha + "T00:00:00");
      return (
        gastoDate.getMonth() === selectedMonth.getMonth() &&
        gastoDate.getFullYear() === selectedMonth.getFullYear()
      );
    });
  }, [gastos, selectedMonth]);

  const columns: ColumnDef<Gasto>[] = useMemo(
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
        cell: ({ row }) => <RowActions gasto={row.original} canEdit={canEdit} />,
      },
    ],
    [canEdit]
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Gastos</h2>
          <p className="text-sm text-gray-500 mt-1">
            {filteredGastos.length} registro(s)
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setModalOpen(true)} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Agregar Gasto
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-white p-4 rounded-lg border">
        <span className="text-sm font-medium text-gray-700 flex-shrink-0">Filtrar por mes:</span>
        <MonthPicker value={selectedMonth} onChange={setSelectedMonth} />
      </div>

      <DataTable
        data={filteredGastos}
        columns={columns}
        filterPlaceholder=""
      />
      {canEdit && (
        <EntityModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Nuevo gasto"
        >
          <GastoForm onSuccess={() => setModalOpen(false)} />
        </EntityModal>
      )}
    </div>
  );
}
