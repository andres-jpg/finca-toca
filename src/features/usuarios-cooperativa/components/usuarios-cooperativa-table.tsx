"use client";

import { useState, useMemo } from "react";
import { Pencil } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { EntityModal } from "@/components/shared/entity-modal";
import { UsuarioRutaForm } from "@/features/usuarios-cooperativa/components/usuario-ruta-form";
import { Badge } from "@/components/ui/badge";
import type { UserCooperativa, RutaCooperativa } from "@/types";

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

function RowActions({
  user,
  rutas,
  rutaColorMap,
}: {
  user: UserCooperativa;
  rutas: RutaCooperativa[];
  rutaColorMap: Map<string, string>;
}) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setEditOpen(true)}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
          title="Asignar / cambiar ruta"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>

      <EntityModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Asignar ruta a usuario"
      >
        <UsuarioRutaForm
          user={user}
          rutas={rutas}
          onSuccess={() => setEditOpen(false)}
        />
      </EntityModal>
    </>
  );
}

interface UsuariosCooperativaTableProps {
  users: UserCooperativa[];
  rutas: RutaCooperativa[];
}

export function UsuariosCooperativaTable({ users, rutas }: UsuariosCooperativaTableProps) {
  const rutaColorMap = useMemo(() => {
    const map = new Map<string, string>();
    rutas.forEach((r, i) => map.set(r.nombre, RUTA_COLORS[i % RUTA_COLORS.length]));
    return map;
  }, [rutas]);

  const columns: ColumnDef<UserCooperativa>[] = useMemo(
    () => [
      {
        accessorKey: "email",
        header: "Usuario",
        cell: ({ getValue }) => (
          <span className="font-medium text-gray-800">{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: "ruta_nombre",
        header: "Ruta asignada",
        cell: ({ getValue }) => {
          const nombre = getValue<string | null>();
          if (!nombre) {
            return <span className="text-xs text-gray-400 italic">Sin asignar</span>;
          }
          const colorClass = rutaColorMap.get(nombre) ?? RUTA_COLORS[0];
          return (
            <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${colorClass}`}>
              {nombre}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: "Acciones",
        cell: ({ row }) => (
          <RowActions user={row.original} rutas={rutas} rutaColorMap={rutaColorMap} />
        ),
      },
    ],
    [rutas, rutaColorMap]
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 tracking-tight">
          Usuarios
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          {users.length} usuario(s) con rol recolector
        </p>
      </div>

      <DataTable
        data={users}
        columns={columns}
        filterPlaceholder="Buscar por email o ruta..."
      />
    </div>
  );
}
