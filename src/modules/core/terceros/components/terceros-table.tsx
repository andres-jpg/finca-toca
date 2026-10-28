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
import { desactivarTercero, reactivarTercero } from "../actions/terceros.actions";
import { normalizarIdentificacion } from "../lib/normalizar";
import { ETIQUETA_ROL_TERCERO_CORTA, ROLES_TERCERO, type RolTercero } from "../lib/roles";
import type { Tercero } from "../types";
import { TerceroForm } from "./tercero-form";

const CLASE_SELECT =
  "border-input h-9 rounded-md border bg-white px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

type FiltroEstado = "activos" | "inactivos" | "todos";

function RowActions({ tercero, puedeEditar }: { tercero: Tercero; puedeEditar: boolean }) {
  const [editando, setEditando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  // El Consumidor final es un registro del sistema: ni se edita ni se desactiva.
  if (!puedeEditar || tercero.es_consumidor_final) return null;

  async function cambiarEstado(activar: boolean) {
    const r = activar ? await reactivarTercero(tercero.id) : await desactivarTercero(tercero.id);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    toast.success(activar ? "Tercero reactivado" : "Tercero desactivado");
    setConfirmando(false);
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setEditando(true)}
          className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          title="Editar tercero"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        {tercero.activo ? (
          <button
            onClick={() => setConfirmando(true)}
            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
            title="Desactivar tercero"
          >
            <PowerOff className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            onClick={() => void cambiarEstado(true)}
            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-green-50 hover:text-green-600"
            title="Reactivar tercero"
          >
            <Power className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <EntityModal open={editando} onClose={() => setEditando(false)} title="Editar tercero">
        <TerceroForm tercero={tercero} onSuccess={() => setEditando(false)} />
      </EntityModal>

      <DeleteConfirmationDialog
        open={confirmando}
        onOpenChange={setConfirmando}
        onConfirm={() => void cambiarEstado(false)}
        title="¿Desactivar tercero?"
        description={`«${tercero.nombre}» dejará de aparecer en los selectores. Su historial se conserva y puedes reactivarlo cuando quieras.`}
        confirmLabel="Desactivar"
      />
    </>
  );
}

interface TercerosTableProps {
  terceros: Tercero[];
  puedeCrear: boolean;
  puedeEditar: boolean;
}

export function TercerosTable({ terceros, puedeCrear, puedeEditar }: TercerosTableProps) {
  const [creando, setCreando] = useState(false);
  const [rol, setRol] = useState<RolTercero | "">("");
  const [estado, setEstado] = useState<FiltroEstado>("activos");

  const filtrados = useMemo(
    () =>
      terceros.filter(
        (t) =>
          (rol === "" || t.roles.includes(rol)) &&
          (estado === "todos" || (estado === "activos" ? t.activo : !t.activo)),
      ),
    [terceros, rol, estado],
  );

  const columns: ColumnDef<Tercero>[] = useMemo(
    () => [
      {
        accessorKey: "nombre",
        header: "Nombre",
        cell: ({ row }) => (
          <div className="min-w-0">
            <span className="font-medium text-gray-800">{row.original.nombre}</span>
            {row.original.es_consumidor_final && (
              <Badge className="ml-2 bg-blue-100 text-blue-700 hover:bg-blue-100">Sistema</Badge>
            )}
          </div>
        ),
      },
      {
        id: "identificacion",
        header: "Identificación",
        // Texto plano para ordenar y para el buscador del DataTable (normalizado: encuentra «9001234567»).
        accessorFn: (t) => `${t.tipo_identificacion} ${normalizarIdentificacion(t.identificacion)}`,
        cell: ({ row }) => {
          const t = row.original;
          return (
            <span className="text-gray-600">
              {t.tipo_identificacion} {t.identificacion}
              {t.digito_verificacion !== null && `-${t.digito_verificacion}`}
            </span>
          );
        },
      },
      {
        id: "roles",
        header: "Roles",
        accessorFn: (t) => t.roles.join(" "),
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.roles.map((r) => (
              <Badge key={r} variant="secondary">
                {ETIQUETA_ROL_TERCERO_CORTA[r]}
              </Badge>
            ))}
          </div>
        ),
      },
      { accessorKey: "telefono", header: "Teléfono" },
      {
        accessorKey: "email",
        header: "Correo",
        cell: ({ row }) => <span className="text-gray-600">{row.original.email ?? "—"}</span>,
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
        cell: ({ row }) => <RowActions tercero={row.original} puedeEditar={puedeEditar} />,
      },
    ],
    [puedeEditar],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-gray-800 sm:text-2xl">Terceros</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Proveedores y clientes en un solo maestro · {filtrados.length} de {terceros.length}
          </p>
        </div>
        {puedeCrear && (
          <Button onClick={() => setCreando(true)} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Nuevo tercero
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Filtrar por rol"
          className={CLASE_SELECT}
          value={rol}
          onChange={(e) => setRol(e.target.value as RolTercero | "")}
        >
          <option value="">Todos los roles</option>
          {ROLES_TERCERO.map((r) => (
            <option key={r} value={r}>
              {ETIQUETA_ROL_TERCERO_CORTA[r]}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar por estado"
          className={CLASE_SELECT}
          value={estado}
          onChange={(e) => setEstado(e.target.value as FiltroEstado)}
        >
          <option value="activos">Activos</option>
          <option value="inactivos">Inactivos</option>
          <option value="todos">Activos e inactivos</option>
        </select>
      </div>

      <DataTable data={filtrados} columns={columns} filterPlaceholder="  Buscar por nombre, identificación, teléfono..." />

      {puedeCrear && (
        <EntityModal open={creando} onClose={() => setCreando(false)} title="Nuevo tercero">
          <TerceroForm key={String(creando)} onSuccess={() => setCreando(false)} />
        </EntityModal>
      )}
    </div>
  );
}
