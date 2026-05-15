"use client";

import { useState, useMemo } from "react";
import { Plus, Pencil, Trash2, Eye } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { EntityModal } from "@/components/shared/entity-modal";
import { DeleteConfirmationDialog } from "@/components/shared/delete-confirmation-dialog";
import { FincaForm } from "@/features/fincas-cooperativa/components/finca-form";
import { deleteFinca } from "@/features/fincas-cooperativa/actions/fincas.actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { FincaCooperativa, RutaCooperativa } from "@/types";

function FincaDetail({ finca }: { finca: FincaCooperativa }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Nombre</p>
          <p className="font-medium">{finca.nombre}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Ruta</p>
          <p className="font-medium">{finca.ruta_nombre ?? "Sin ruta"}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Precio por litro</p>
          <p className="font-medium">
            ${finca.precio_litro.toLocaleString("es-CO", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Estado</p>
          <Badge variant={finca.activa ? "default" : "secondary"}>
            {finca.activa ? "Activa" : "Inactiva"}
          </Badge>
        </div>
      </div>
    </div>
  );
}

function RowActions({
  finca,
  rutas,
  canEdit,
}: {
  finca: FincaCooperativa;
  rutas: RutaCooperativa[];
  canEdit: boolean;
}) {
  const [viewOpen, setViewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleDelete = async () => {
    try {
      await deleteFinca(finca.id);
      toast.success("Finca eliminada");
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

      <EntityModal open={viewOpen} onClose={() => setViewOpen(false)} title="Detalle de finca">
        <FincaDetail finca={finca} />
      </EntityModal>

      {canEdit && (
        <EntityModal open={editOpen} onClose={() => setEditOpen(false)} title="Editar finca">
          <FincaForm finca={finca} rutas={rutas} onSuccess={() => setEditOpen(false)} />
        </EntityModal>
      )}

      <DeleteConfirmationDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDelete}
        itemName={finca.nombre}
      />
    </>
  );
}

interface FincasTableProps {
  fincas: FincaCooperativa[];
  rutas: RutaCooperativa[];
  canEdit: boolean;
}

const RUTA_COLORS = [
  "bg-teal-100 text-teal-800",
  "bg-blue-100 text-blue-800",
  "bg-violet-100 text-violet-800",
  "bg-orange-100 text-orange-800",
  "bg-pink-100 text-pink-800",
  "bg-yellow-100 text-yellow-800",
  "bg-green-100 text-green-800",
  "bg-red-100 text-red-800",
];

export function FincasTable({ fincas, rutas, canEdit }: FincasTableProps) {
  const [modalOpen, setModalOpen] = useState(false);

  // Asigna un color fijo a cada nombre de ruta
  const rutaColorMap = useMemo(() => {
    const map = new Map<string, string>();
    let idx = 0;
    fincas.forEach((f) => {
      if (f.ruta_nombre && !map.has(f.ruta_nombre)) {
        map.set(f.ruta_nombre, RUTA_COLORS[idx % RUTA_COLORS.length]);
        idx++;
      }
    });
    return map;
  }, [fincas]);

  const columns: ColumnDef<FincaCooperativa>[] = useMemo(
    () => [
      {
        accessorKey: "nombre",
        header: "Finca",
      },
      {
        accessorKey: "ruta_nombre",
        header: "Ruta",
        cell: ({ getValue }) => {
          const ruta = getValue<string | null>();
          if (!ruta) return <span className="text-gray-400 text-sm">Sin ruta</span>;
          const colorClass = rutaColorMap.get(ruta) ?? RUTA_COLORS[0];
          return (
            <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${colorClass}`}>
              {ruta}
            </span>
          );
        },
      },
      {
        accessorKey: "precio_litro",
        header: "Precio/litro",
        cell: ({ getValue }) =>
          `$${getValue<number>().toLocaleString("es-CO", { minimumFractionDigits: 2 })}`,
      },
      {
        accessorKey: "activa",
        header: "Estado",
        cell: ({ getValue }) => (
          <Badge variant={getValue<boolean>() ? "default" : "secondary"}>
            {getValue<boolean>() ? "Activa" : "Inactiva"}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: "Acciones",
        cell: ({ row }) => <RowActions finca={row.original} rutas={rutas} canEdit={canEdit} />,
      },
    ],
    [canEdit, rutaColorMap]
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800 tracking-tight">
            Fincas
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {fincas.length} finca(s) registrada(s)
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nueva finca
          </Button>
        )}
      </div>

      <DataTable data={fincas} columns={columns} filterPlaceholder="Buscar finca..." />

      {canEdit && (
        <EntityModal open={modalOpen} onClose={() => setModalOpen(false)} title="Nueva finca">
          <FincaForm rutas={rutas} onSuccess={() => setModalOpen(false)} />
        </EntityModal>
      )}
    </div>
  );
}
