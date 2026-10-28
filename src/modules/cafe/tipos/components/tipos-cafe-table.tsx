"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Power, PowerOff } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { DataTable } from "@/components/shared/data-table";
import { DeleteConfirmationDialog } from "@/components/shared/delete-confirmation-dialog";
import { EntityModal } from "@/components/shared/entity-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { desactivarTipoCafe, reactivarTipoCafe } from "../actions/tipos.actions";
import type { TipoCafe } from "../types";
import { TipoCafeForm } from "./tipo-cafe-form";

function RowActions({ tipo }: { tipo: TipoCafe }) {
  const [editando, setEditando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  async function cambiarEstado(activar: boolean) {
    const r = activar ? await reactivarTipoCafe(tipo.id) : await desactivarTipoCafe(tipo.id);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    toast.success(activar ? "Tipo de café reactivado" : "Tipo de café desactivado");
    setConfirmando(false);
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setEditando(true)}
          className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          title="Editar tipo de café"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        {tipo.activo ? (
          <button
            onClick={() => setConfirmando(true)}
            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
            title="Desactivar tipo de café"
          >
            <PowerOff className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            onClick={() => void cambiarEstado(true)}
            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-green-50 hover:text-green-600"
            title="Reactivar tipo de café"
          >
            <Power className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <EntityModal open={editando} onClose={() => setEditando(false)} title="Editar tipo de café">
        <TipoCafeForm tipo={tipo} onSuccess={() => setEditando(false)} />
      </EntityModal>

      <DeleteConfirmationDialog
        open={confirmando}
        onOpenChange={setConfirmando}
        onConfirm={() => void cambiarEstado(false)}
        title="¿Desactivar tipo de café?"
        description={`«${tipo.nombre}» dejará de ofrecerse en los lotes nuevos. Sus productos terminados y su historial se conservan, y puedes reactivarlo cuando quieras.`}
        confirmLabel="Desactivar"
      />
    </>
  );
}

export function TiposCafeTable({ tipos }: { tipos: TipoCafe[] }) {
  const [creando, setCreando] = useState(false);

  const columns: ColumnDef<TipoCafe>[] = useMemo(
    () => [
      {
        accessorKey: "nombre",
        header: "Nombre",
        cell: ({ row }) => <span className="font-medium text-gray-800">{row.original.nombre}</span>,
      },
      {
        accessorKey: "activo",
        header: "Estado",
        cell: ({ row }) =>
          row.original.activo ? (
            <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Activo</Badge>
          ) : (
            <Badge className="bg-gray-100 text-gray-600 hover:bg-gray-100">Inactivo</Badge>
          ),
      },
      {
        id: "actions",
        header: "Acciones",
        cell: ({ row }) => <RowActions tipo={row.original} />,
      },
    ],
    [],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-gray-800 sm:text-2xl">Tipos de café</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Catálogo de tipos (Consumo, Excelso…). Cada tipo activo genera un producto terminado por presentación de
            bolsa · {tipos.length} en total
          </p>
        </div>
        <Button onClick={() => setCreando(true)} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Nuevo tipo
        </Button>
      </div>

      <DataTable data={tipos} columns={columns} filterPlaceholder="  Buscar tipo de café..." />

      <EntityModal open={creando} onClose={() => setCreando(false)} title="Nuevo tipo de café">
        <TipoCafeForm key={String(creando)} onSuccess={() => setCreando(false)} />
      </EntityModal>
    </div>
  );
}
