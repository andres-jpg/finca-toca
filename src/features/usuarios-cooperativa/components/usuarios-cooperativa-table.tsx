"use client";

import { useState, useMemo } from "react";
import { Pencil } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { EntityModal } from "@/components/shared/entity-modal";
import { UsuarioRutaForm } from "@/features/usuarios-cooperativa/components/usuario-ruta-form";
import type { UserCooperativa, Itinerario } from "@/types";

const ITINERARIO_COLORS = [
  "bg-teal-100 text-teal-800",
  "bg-blue-100 text-blue-800",
  "bg-violet-100 text-violet-800",
];

function RowActions({
  user,
  itinerarios,
}: {
  user: UserCooperativa;
  itinerarios: Itinerario[];
}) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setEditOpen(true)}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
          title="Asignar / cambiar itinerario"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>

      <EntityModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Asignar itinerario a usuario"
      >
        <UsuarioRutaForm
          user={user}
          itinerarios={itinerarios}
          onSuccess={() => setEditOpen(false)}
        />
      </EntityModal>
    </>
  );
}

interface UsuariosCooperativaTableProps {
  users: UserCooperativa[];
  itinerarios: Itinerario[];
}

export function UsuariosCooperativaTable({ users, itinerarios }: UsuariosCooperativaTableProps) {
  const totalAdmins = users.filter((u) => u.rol === "cooperativa_admin").length;
  const totalRecolectores = users.length - totalAdmins;

  const itinerarioColorMap = useMemo(() => {
    const map = new Map<string, string>();
    itinerarios.forEach((it, i) => map.set(it.nombre, ITINERARIO_COLORS[i % ITINERARIO_COLORS.length]));
    return map;
  }, [itinerarios]);

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
        accessorKey: "rol",
        header: "Rol",
        cell: ({ getValue }) => {
          const rol = getValue<string>();
          const isAdmin = rol === "cooperativa_admin";
          return (
            <span
              className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${
                isAdmin ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-700"
              }`}
            >
              {isAdmin ? "Administrador" : "Recolector"}
            </span>
          );
        },
      },
      {
        accessorKey: "itinerario_nombre",
        header: "Itinerario asignado",
        cell: ({ getValue }) => {
          const nombre = getValue<string | null>();
          if (!nombre) {
            return <span className="text-xs text-gray-400 italic">Sin asignar</span>;
          }
          const colorClass = itinerarioColorMap.get(nombre) ?? ITINERARIO_COLORS[0];
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
          <RowActions user={row.original} itinerarios={itinerarios} />
        ),
      },
    ],
    [itinerarios, itinerarioColorMap]
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 tracking-tight">
          Usuarios
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          {users.length} usuario(s) — {totalAdmins} administrador(es), {totalRecolectores} recolector(es)
        </p>
      </div>

      <DataTable
        data={users}
        columns={columns}
        filterPlaceholder="Buscar por email o itinerario..."
      />
    </div>
  );
}
