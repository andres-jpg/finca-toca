"use client";

import { useState, useMemo } from "react";
import { Plus, Pencil, Trash2, Eye, ListOrdered, ArrowLeft } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { EntityModal } from "@/components/shared/entity-modal";
import { DeleteConfirmationDialog } from "@/components/shared/delete-confirmation-dialog";
import { RutaForm } from "@/features/rutas-cooperativa/components/ruta-form";
import { FincasOrderEditor } from "@/features/rutas-cooperativa/components/fincas-order-editor";
import { deleteRuta } from "@/features/rutas-cooperativa/actions/rutas.actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { RutaCooperativa, FincaCooperativa } from "@/types";

function RutaDetail({ ruta }: { ruta: RutaCooperativa }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wide">Nombre</p>
        <p className="font-medium text-lg">{ruta.nombre}</p>
      </div>
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
          Fincas asignadas ({ruta.fincas.length})
        </p>
        <div className="space-y-2">
          {ruta.fincas.length === 0 ? (
            <p className="text-sm text-gray-400">Sin fincas asignadas</p>
          ) : (
            ruta.fincas.map((f, i) => (
              <div
                key={f.id}
                className="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2 bg-gray-50"
              >
                <span className="text-xs text-gray-400 w-4 text-right select-none">{i + 1}.</span>
                <p className="text-sm font-medium flex-1">{f.nombre}</p>
                <span className="text-sm text-teal-700 font-medium">
                  ${f.precio_litro.toLocaleString("es-CO", { minimumFractionDigits: 2 })}/L
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function OrderDialog({
  ruta,
  open,
  onClose,
}: {
  ruta: RutaCooperativa;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        showCloseButton={false}
        className="inset-0 translate-x-0 translate-y-0 max-w-none w-screen h-screen rounded-none border-0 p-0 flex flex-col gap-0"
      >
        <DialogTitle className="sr-only">Editar orden de fincas — {ruta.nombre}</DialogTitle>

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-gray-200 px-6 py-4 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </button>
          <div className="h-4 w-px bg-gray-200" />
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide leading-none mb-0.5">
              Orden de fincas
            </p>
            <p className="font-semibold text-gray-900">{ruta.nombre}</p>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-xl mx-auto px-6 py-8">
            <p className="text-sm text-gray-500 mb-6">
              Arrastra las fincas para establecer el orden en que aparecerán al registrar una recolección.
            </p>
            <FincasOrderEditor fincas={ruta.fincas} rutaId={ruta.id} onDone={onClose} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RowActions({
  ruta,
  fincas,
  fincaRutaMap,
  canEdit,
}: {
  ruta: RutaCooperativa;
  fincas: FincaCooperativa[];
  fincaRutaMap: Map<number, string>;
  canEdit: boolean;
}) {
  const [viewOpen, setViewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleDelete = async () => {
    try {
      await deleteRuta(ruta.id);
      toast.success("Ruta eliminada");
      setDeleteOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al eliminar");
    }
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setViewOpen(true)}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
          title="Ver detalle"
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
        {canEdit && (
          <>
            {ruta.fincas.length > 1 && (
              <button
                onClick={() => setOrderOpen(true)}
                className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                title="Editar orden de fincas"
              >
                <ListOrdered className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => setEditOpen(true)}
              className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
              title="Editar"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setDeleteOpen(true)}
              className="p-1.5 rounded hover:bg-red-50 text-red-400"
              title="Eliminar"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>

      <EntityModal open={viewOpen} onClose={() => setViewOpen(false)} title="Detalle de ruta">
        <RutaDetail ruta={ruta} />
      </EntityModal>

      {canEdit && (
        <>
          <EntityModal open={editOpen} onClose={() => setEditOpen(false)} title="Editar ruta">
            <RutaForm ruta={ruta} fincas={fincas} fincaRutaMap={fincaRutaMap} onSuccess={() => setEditOpen(false)} />
          </EntityModal>

          <OrderDialog ruta={ruta} open={orderOpen} onClose={() => setOrderOpen(false)} />
        </>
      )}

      <DeleteConfirmationDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDelete}
        itemName={ruta.nombre}
      />
    </>
  );
}

interface RutasTableProps {
  rutas: RutaCooperativa[];
  fincas: FincaCooperativa[];
  canEdit: boolean;
}

export function RutasTable({ rutas, fincas, canEdit }: RutasTableProps) {
  const [modalOpen, setModalOpen] = useState(false);

  const fincaRutaMap = useMemo(() => {
    const map = new Map<number, string>();
    rutas.forEach((r) => r.fincas.forEach((f) => map.set(f.id, r.nombre)));
    return map;
  }, [rutas]);

  const columns: ColumnDef<RutaCooperativa>[] = useMemo(
    () => [
      {
        accessorKey: "nombre",
        header: "Ruta",
      },
      {
        id: "fincas_count",
        header: "Fincas",
        cell: ({ row }) => {
          const fincasRuta = row.original.fincas;
          if (fincasRuta.length === 0) {
            return <span className="text-gray-400 text-sm">Sin fincas</span>;
          }
          return (
            <Badge variant="secondary" className="text-xs">
              {fincasRuta.length} finca{fincasRuta.length !== 1 ? "s" : ""}
            </Badge>
          );
        },
      },
      {
        id: "actions",
        header: "Acciones",
        cell: ({ row }) => (
          <RowActions ruta={row.original} fincas={fincas} fincaRutaMap={fincaRutaMap} canEdit={canEdit} />
        ),
      },
    ],
    [canEdit, fincas, fincaRutaMap]
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800 tracking-tight">
            Rutas
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {rutas.length} ruta(s) registrada(s)
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nueva ruta
          </Button>
        )}
      </div>

      <DataTable data={rutas} columns={columns} filterPlaceholder="Buscar ruta..." />

      {canEdit && (
        <EntityModal open={modalOpen} onClose={() => setModalOpen(false)} title="Nueva ruta">
          <RutaForm fincas={fincas} fincaRutaMap={fincaRutaMap} onSuccess={() => setModalOpen(false)} />
        </EntityModal>
      )}
    </div>
  );
}
