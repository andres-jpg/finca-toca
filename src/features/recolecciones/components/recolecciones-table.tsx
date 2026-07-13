"use client";

import { useState, useMemo } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Pencil, Trash2, Eye } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { EntityModal } from "@/components/shared/entity-modal";
import { DeleteConfirmationDialog } from "@/components/shared/delete-confirmation-dialog";
import { RecoleccionForm } from "@/features/recolecciones/components/recoleccion-form";
import { deleteRecoleccion } from "@/features/recolecciones/actions/recolecciones.actions";
import { toast } from "sonner";
import type { Recoleccion, FincaCooperativa, RutaCooperativa } from "@/types";

function RecoleccionDetail({ rec }: { rec: Recoleccion }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Finca</p>
          <p className="font-medium">{rec.finca_nombre}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Ruta</p>
          <p className="font-medium">{rec.ruta_nombre ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Fecha</p>
          <p className="font-medium">
            {format(new Date(rec.fecha + "T00:00:00"), "dd/MM/yyyy", { locale: es })}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Litros</p>
          <p className="font-medium">{rec.litros.toLocaleString("es-CO")} L</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Precio/litro</p>
          <p className="font-medium">
            ${rec.precio_litro.toLocaleString("es-CO", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Valor total</p>
          <p className="font-semibold text-teal-700">
            ${rec.valor_total.toLocaleString("es-CO", { minimumFractionDigits: 0 })}
          </p>
        </div>
      </div>
    </div>
  );
}

function RowActions({
  rec,
  fincas,
  rutas,
  canEdit,
  canDelete,
}: {
  rec: Recoleccion;
  fincas: FincaCooperativa[];
  rutas: RutaCooperativa[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [viewOpen, setViewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleDelete = async () => {
    try {
      await deleteRecoleccion(rec.id);
      toast.success("Recolección eliminada");
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
          <button
            onClick={() => setEditOpen(true)}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
            title="Editar"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        {canDelete && (
          <button
            onClick={() => setDeleteOpen(true)}
            className="p-1.5 rounded hover:bg-red-50 text-red-400"
            title="Eliminar"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <EntityModal open={viewOpen} onClose={() => setViewOpen(false)} title="Detalle de recolección">
        <RecoleccionDetail rec={rec} />
      </EntityModal>

      {canEdit && (
        <EntityModal open={editOpen} onClose={() => setEditOpen(false)} title="Editar recolección">
          <RecoleccionForm
            recoleccion={rec}
            fincas={fincas}
            rutas={rutas}
            lockDate={false}
            showPricing={true}
            onSuccess={() => setEditOpen(false)}
          />
        </EntityModal>
      )}

      <DeleteConfirmationDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDelete}
        itemName={`recolección de ${rec.finca_nombre} del ${rec.fecha}`}
      />
    </>
  );
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

interface RecoleccionesTableProps {
  recolecciones: Recoleccion[];
  fincas: FincaCooperativa[];
  rutas: RutaCooperativa[];
  canEdit: boolean;
  canDelete: boolean;
}

export function RecoleccionesTable({
  recolecciones,
  fincas,
  rutas,
  canEdit,
  canDelete,
}: RecoleccionesTableProps) {
  const rutaColorMap = useMemo(() => {
    const map = new Map<string, string>();
    let idx = 0;
    recolecciones.forEach((r) => {
      if (r.ruta_nombre && !map.has(r.ruta_nombre)) {
        map.set(r.ruta_nombre, RUTA_COLORS[idx % RUTA_COLORS.length]);
        idx++;
      }
    });
    return map;
  }, [recolecciones]);

  const totalLitros = useMemo(
    () => recolecciones.reduce((acc, r) => acc + r.litros, 0),
    [recolecciones]
  );

  const totalValor = useMemo(
    () => recolecciones.reduce((acc, r) => acc + r.valor_total, 0),
    [recolecciones]
  );

  const columns: ColumnDef<Recoleccion>[] = useMemo(
    () => [
      {
        accessorKey: "fecha",
        header: "Fecha",
        cell: ({ getValue }) =>
          format(new Date(getValue<string>() + "T00:00:00"), "dd/MM/yyyy", { locale: es }),
      },
      {
        accessorKey: "finca_nombre",
        header: "Finca",
      },
      {
        accessorKey: "ruta_nombre",
        header: "Ruta",
        cell: ({ getValue }) => {
          const ruta = getValue<string | null>();
          if (!ruta) return <span className="text-gray-400 text-sm">—</span>;
          const colorClass = rutaColorMap.get(ruta) ?? RUTA_COLORS[0];
          return (
            <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${colorClass}`}>
              {ruta}
            </span>
          );
        },
      },
      {
        accessorKey: "itinerario_nombre",
        header: "Itinerario",
        cell: ({ getValue }) => {
          const itinerario = getValue<string | null>();
          return itinerario ?? <span className="text-gray-400 text-sm">—</span>;
        },
      },
      {
        accessorKey: "litros",
        header: "Litros",
        cell: ({ getValue }) =>
          `${getValue<number>().toLocaleString("es-CO", { minimumFractionDigits: 1 })} L`,
      },
      {
        accessorKey: "precio_litro",
        header: "Precio/L",
        cell: ({ getValue }) =>
          `$${getValue<number>().toLocaleString("es-CO", { minimumFractionDigits: 2 })}`,
      },
      {
        accessorKey: "valor_total",
        header: "Valor total",
        cell: ({ getValue }) =>
          `$${getValue<number>().toLocaleString("es-CO", { minimumFractionDigits: 0 })}`,
      },
      {
        id: "actions",
        header: "Acciones",
        cell: ({ row }) => (
          <RowActions
            rec={row.original}
            fincas={fincas}
            rutas={rutas}
            canEdit={canEdit}
            canDelete={canDelete}
          />
        ),
      },
    ],
    [canEdit, canDelete, fincas, rutas, rutaColorMap]
  );

  return (
    <div className="space-y-3">
      {recolecciones.length > 0 && (
        <div className="flex gap-4 justify-end text-sm">
          <span className="text-gray-600">
            Total:{" "}
            <span className="font-semibold text-gray-800">
              {totalLitros.toLocaleString("es-CO", { minimumFractionDigits: 1 })} L
            </span>
          </span>
          <span className="text-gray-600">
            Valor:{" "}
            <span className="font-semibold text-teal-700">
              ${totalValor.toLocaleString("es-CO", { minimumFractionDigits: 0 })}
            </span>
          </span>
        </div>
      )}

      <DataTable
        data={recolecciones}
        columns={columns}
        filterPlaceholder="Buscar por finca, ruta o itinerario..."
      />
    </div>
  );
}
