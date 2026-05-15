"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, ArrowUpCircle, Eye } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { EntityModal } from "@/components/shared/entity-modal";
import { DeleteConfirmationDialog } from "@/components/shared/delete-confirmation-dialog";
import { VacaForm } from "@/features/vacas/components/vaca-form";
import { venderVaca } from "@/features/vacas/actions/vacas.actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { Vaca, Toro, PajillaPorToro } from "@/types";

const ESTADO_LABELS: Record<string, string> = {
  produccion: "Producción",
  secado: "Secado",
  pre_jardin: "Pre-jardín",
  jardin: "Jardín",
};

const ESTADO_COLORS: Record<string, string> = {
  produccion: "bg-green-100 text-green-700 hover:bg-green-100",
  secado: "bg-yellow-100 text-yellow-700 hover:bg-yellow-100",
  pre_jardin: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  jardin: "bg-purple-100 text-purple-700 hover:bg-purple-100",
};

const ORIGEN_LABELS: Record<string, string> = {
  finca: "Finca",
  externa: "Externa",
};

function RowActions({
  vaca,
  vacas,
  toros,
  pajillasPorToro,
  canEdit,
}: {
  vaca: Vaca;
  vacas: Vaca[];
  toros: Toro[];
  pajillasPorToro: PajillaPorToro[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleDelete = async () => {
    try {
      await venderVaca(vaca.id);
      toast.success("Vaca dada de baja");
      setDeleteOpen(false);
    } catch {
      toast.error("Error al dar de baja");
    }
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <button
          onClick={() => router.push(`/dashboard/vacas/${vaca.id}`)}
          className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          title="Ver ficha"
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
            {vaca.alta && (
              <button
                onClick={() => setDeleteOpen(true)}
                className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                title="Dar de baja"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </>
        )}
      </div>

      {canEdit && (
        <EntityModal open={editOpen} onClose={() => setEditOpen(false)} title="Editar vaca">
          <VacaForm vaca={vaca} vacas={vacas} toros={toros} pajillasPorToro={pajillasPorToro} onSuccess={() => setEditOpen(false)} />
        </EntityModal>
      )}

      <DeleteConfirmationDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDelete}
        title="¿Dar de baja esta vaca?"
        description={`"${vaca.nombre} (#${vaca.vaca_id})" pasará a la lista de bajas. Podrás consultarla desde "Ver de baja".`}
        confirmLabel="Dar de baja"
      />
    </>
  );
}

interface VacasTableProps {
  vacas: Vaca[];
  toros: Toro[];
  pajillasPorToro: PajillaPorToro[];
  canEdit: boolean;
}

export function VacasTable({ vacas, toros, pajillasPorToro, canEdit }: VacasTableProps) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [mostrarDeBaja, setMostrarDeBaja] = useState(false);

  const vacasDeAlta = useMemo(() => vacas.filter((v) => v.alta), [vacas]);
  const vacasDeBaja = useMemo(() => vacas.filter((v) => !v.alta), [vacas]);
  const vacasMostradas = mostrarDeBaja ? vacasDeBaja : vacasDeAlta;

  const columns: ColumnDef<Vaca>[] = useMemo(
    () => [
      {
        accessorKey: "vaca_id",
        header: "ID",
        cell: ({ getValue }) => (
          <span className="font-mono text-gray-500">#{getValue<number>()}</span>
        ),
      },
      { accessorKey: "nombre", header: "Nombre" },
      {
        accessorKey: "estado",
        header: "Estado",
        cell: ({ getValue }) => {
          const val = getValue<string | null>();
          if (!val) return <span className="text-gray-400">—</span>;
          return (
            <Badge className={ESTADO_COLORS[val] ?? ""}>
              {ESTADO_LABELS[val] ?? val}
            </Badge>
          );
        },
      },
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
          <RowActions vaca={row.original} vacas={vacasDeAlta} toros={toros} pajillasPorToro={pajillasPorToro} canEdit={canEdit} />
        ),
      },
    ],
    [canEdit, vacasDeAlta, toros]
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800 tracking-tight">Vacas</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {mostrarDeBaja
              ? `${vacasDeBaja.length} vaca(s) de baja`
              : `${vacasDeAlta.length} vaca(s) de alta`}
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
            {!mostrarDeBaja && vacasDeBaja.length > 0 && (
              <span className="ml-1.5 text-xs bg-orange-100 text-orange-600 rounded-full px-1.5 py-0.5">
                {vacasDeBaja.length}
              </span>
            )}
          </Button>
          {canEdit && !mostrarDeBaja && (
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Agregar Vaca
            </Button>
          )}
        </div>
      </div>

      <DataTable data={vacasMostradas} columns={columns} filterPlaceholder="  Buscar vaca..." />

      {canEdit && (
        <EntityModal open={modalOpen} onClose={() => setModalOpen(false)} title="Nueva vaca">
          <VacaForm vacas={vacasDeAlta} toros={toros} pajillasPorToro={pajillasPorToro} onSuccess={() => setModalOpen(false)} />
        </EntityModal>
      )}
    </div>
  );
}
