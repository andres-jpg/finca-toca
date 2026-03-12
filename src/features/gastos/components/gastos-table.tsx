"use client";

import { useState, useMemo } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Plus, Pencil, Trash2, CalendarDays, Eye } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { EntityModal } from "@/components/shared/entity-modal";
import { DeleteConfirmationDialog } from "@/components/shared/delete-confirmation-dialog";
import { GastoForm } from "@/features/gastos/components/gasto-form";
import { deleteGasto } from "@/features/gastos/actions/gastos.actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MonthPicker } from "@/components/shared/month-picker";
import type { Gasto, ConceptoGasto } from "@/types";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-gray-900">{value || <span className="text-gray-400">—</span>}</p>
    </div>
  );
}

function GastoDetail({ gasto }: { gasto: Gasto }) {
  const fecha = format(new Date(gasto.fecha + "T00:00:00"), "dd 'de' MMMM yyyy", { locale: es });
  const valor = `$${gasto.valor.toLocaleString("es-CO", { minimumFractionDigits: 0 })}`;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Fecha" value={fecha} />
        <Field label="Valor" value={valor} />
        <Field
          label="Concepto"
          value={
            <>
              {gasto.concepto}
              {gasto.subconcepto && (
                <span className="text-gray-400"> › {gasto.subconcepto}</span>
              )}
            </>
          }
        />
        <Field label="Proveedor" value={gasto.proveedor} />
        <Field label="Número de factura" value={gasto.numero_factura} />
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pago</p>
        {!gasto.pagado ? (
          <Badge variant="outline" className="text-gray-500">No pagado</Badge>
        ) : (
          <div className="space-y-3">
            <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Pagado</Badge>
            {gasto.pago ? (
              <div className="grid grid-cols-2 gap-4 pt-1">
                <Field
                  label="Forma de pago"
                  value={gasto.pago.forma_pago === "efectivo" ? "Efectivo" : "Transferencia"}
                />
                {gasto.pago.forma_pago === "transferencia" && (
                  <>
                    <Field label="Tipo de cuenta" value={gasto.pago.tipo_cuenta} />
                    <Field label="Banco" value={gasto.pago.banco} />
                    <Field label="Número de cuenta" value={gasto.pago.numero_cuenta} />
                  </>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-400">Sin datos de forma de pago</p>
            )}
          </div>
        )}
      </div>

      {gasto.observaciones && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Observaciones</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{gasto.observaciones}</p>
        </div>
      )}
    </div>
  );
}

function RowActions({
  gasto,
  conceptos,
  canEdit,
}: {
  gasto: Gasto;
  conceptos: ConceptoGasto[];
  canEdit: boolean;
}) {
  const [viewOpen, setViewOpen] = useState(false);
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

  const gastoDate = format(new Date(gasto.fecha + "T00:00:00"), "dd/MM/yyyy", { locale: es });
  const gastoValue = `$${gasto.valor.toLocaleString("es-CO", { minimumFractionDigits: 0 })}`;

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
          </>
        )}
      </div>

      <EntityModal open={viewOpen} onClose={() => setViewOpen(false)} title="Detalle del gasto">
        <GastoDetail gasto={gasto} />
      </EntityModal>

      {canEdit && (
        <>
          <EntityModal open={editOpen} onClose={() => setEditOpen(false)} title="Editar gasto">
            <GastoForm gasto={gasto} conceptos={conceptos} onSuccess={() => setEditOpen(false)} />
          </EntityModal>

          <DeleteConfirmationDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            onConfirm={handleDelete}
            itemName={`${gasto.concepto} del ${gastoDate} (${gastoValue})`}
          />
        </>
      )}
    </>
  );
}

interface GastosTableProps {
  gastos: Gasto[];
  conceptos: ConceptoGasto[];
  canEdit: boolean;
}

export function GastosTable({ gastos, conceptos, canEdit }: GastosTableProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  const filteredGastos = useMemo(() => {
    return gastos.filter((gasto) => {
      const d = new Date(gasto.fecha + "T00:00:00");
      return (
        d.getMonth() === selectedMonth.getMonth() &&
        d.getFullYear() === selectedMonth.getFullYear()
      );
    });
  }, [gastos, selectedMonth]);

  const columns: ColumnDef<Gasto>[] = useMemo(
    () => [
      {
        accessorKey: "fecha",
        header: "Fecha",
        cell: ({ getValue }) =>
          format(new Date(getValue<string>() + "T00:00:00"), "dd/MM/yyyy", { locale: es }),
      },
      {
        id: "concepto_display",
        header: "Concepto",
        cell: ({ row }) => (
          <span>
            {row.original.concepto}
            {row.original.subconcepto && (
              <span className="text-gray-400"> › {row.original.subconcepto}</span>
            )}
          </span>
        ),
      },
      {
        accessorKey: "proveedor",
        header: "Proveedor",
        cell: ({ getValue }) => getValue<string | null>() ?? "—",
      },
      {
        accessorKey: "valor",
        header: "Valor",
        cell: ({ getValue }) =>
          `$${getValue<number>().toLocaleString("es-CO", { minimumFractionDigits: 0 })}`,
      },
      {
        accessorKey: "numero_factura",
        header: "Factura",
        cell: ({ getValue }) => getValue<string | null>() ?? "—",
      },
      {
        id: "pagado_display",
        header: "Pagado",
        cell: ({ row }) => {
          const { pagado, pago } = row.original;
          if (!pagado) return <Badge variant="outline" className="text-gray-500">No pagado</Badge>;
          if (!pago) return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Pagado</Badge>;
          if (pago.forma_pago === "transferencia") {
            const label = pago.banco ? `Transferencia · ${pago.banco}` : "Transferencia";
            return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">{label}</Badge>;
          }
          return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Efectivo</Badge>;
        },
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
          <RowActions gasto={row.original} conceptos={conceptos} canEdit={canEdit} />
        ),
      },
    ],
    [canEdit, conceptos]
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800 tracking-tight">Gastos</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {filteredGastos.length} registro(s) este mes
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setModalOpen(true)} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Agregar Gasto
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

      <DataTable data={filteredGastos} columns={columns} filterPlaceholder="" />

      {canEdit && (
        <EntityModal open={modalOpen} onClose={() => setModalOpen(false)} title="Nuevo gasto">
          <GastoForm conceptos={conceptos} onSuccess={() => setModalOpen(false)} />
        </EntityModal>
      )}
    </div>
  );
}
