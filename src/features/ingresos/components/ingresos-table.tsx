"use client";

import { useState, useMemo } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Plus, Pencil, Trash2, CalendarDays } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { EntityModal } from "@/components/shared/entity-modal";
import { DeleteConfirmationDialog } from "@/components/shared/delete-confirmation-dialog";
import { IngresoForm } from "@/features/ingresos/components/ingreso-form";
import { deleteIngreso } from "@/features/ingresos/actions/ingresos.actions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MonthPicker } from "@/components/shared/month-picker";
import type { Ingreso } from "@/types";

function RowActions({ ingreso, canEdit }: { ingreso: Ingreso; canEdit: boolean }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleDelete = async () => {
    try {
      await deleteIngreso(ingreso.id);
      toast.success("Ingreso eliminado");
      setDeleteOpen(false);
    } catch {
      toast.error("Error al eliminar");
    }
  };

  if (!canEdit) {
    return <span className="text-xs text-gray-400">Solo lectura</span>;
  }

  const ingresoDate = format(new Date(ingreso.fecha + "T00:00:00"), "dd/MM/yyyy", { locale: es });
  const ingresoValue = `$${ingreso.valor.toLocaleString("es-CO", { minimumFractionDigits: 0 })}`;

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

      <EntityModal open={editOpen} onClose={() => setEditOpen(false)} title="Editar ingreso">
        <IngresoForm ingreso={ingreso} onSuccess={() => setEditOpen(false)} />
      </EntityModal>

      <DeleteConfirmationDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDelete}
        itemName={`${ingreso.concepto} del ${ingresoDate} (${ingresoValue})`}
      />
    </>
  );
}

interface IngresosTableProps {
  ingresos: Ingreso[];
  canEdit: boolean;
}

export function IngresosTable({ ingresos, canEdit }: IngresosTableProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  const filteredIngresos = useMemo(() => {
    return ingresos.filter((ingreso) => {
      const d = new Date(ingreso.fecha + "T00:00:00");
      return d.getMonth() === selectedMonth.getMonth() && d.getFullYear() === selectedMonth.getFullYear();
    });
  }, [ingresos, selectedMonth]);

  const columns: ColumnDef<Ingreso>[] = useMemo(
    () => [
      {
        accessorKey: "fecha",
        header: "Fecha",
        cell: ({ getValue }) => format(new Date(getValue<string>() + "T00:00:00"), "dd/MM/yyyy", { locale: es }),
      },
      { accessorKey: "concepto", header: "Concepto" },
      {
        accessorKey: "valor",
        header: "Valor",
        cell: ({ getValue }) =>
          `$${getValue<number>().toLocaleString("es-CO", { minimumFractionDigits: 0 })}`,
      },
      {
        accessorKey: "observaciones",
        header: "Observaciones",
        cell: ({ getValue }) => getValue<string | null>() ?? "—",
      },
      {
        id: "actions",
        header: "Acciones",
        cell: ({ row }) => <RowActions ingreso={row.original} canEdit={canEdit} />,
      },
    ],
    [canEdit]
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800 tracking-tight">Ingresos</h2>
          <p className="text-sm text-gray-500 mt-0.5">{filteredIngresos.length} registro(s) este mes</p>
        </div>
        {canEdit && (
          <Button onClick={() => setModalOpen(true)} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Agregar Ingreso
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 text-gray-500 shrink-0">
          <CalendarDays className="h-4 w-4" />
          <span className="text-sm font-medium">Filtrar por mes</span>
        </div>
        <div className="h-4 w-px bg-gray-200 hidden sm:block" />
        <MonthPicker value={selectedMonth} onChange={setSelectedMonth} />
      </div>

      <DataTable data={filteredIngresos} columns={columns} filterPlaceholder="" />

      {canEdit && (
        <EntityModal open={modalOpen} onClose={() => setModalOpen(false)} title="Nuevo ingreso">
          <IngresoForm onSuccess={() => setModalOpen(false)} />
        </EntityModal>
      )}
    </div>
  );
}
