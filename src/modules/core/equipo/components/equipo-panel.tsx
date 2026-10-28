"use client";

import { useMemo, useState } from "react";
import { Plus, Power, PowerOff } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { DataTable } from "@/components/shared/data-table";
import { DeleteConfirmationDialog } from "@/components/shared/delete-confirmation-dialog";
import { EntityModal } from "@/components/shared/entity-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HistorialCambios } from "../../auditoria/components/historial-cambios";
import type { CambioAuditado } from "../../auditoria/actions/historial.actions";
import type { RolTenant } from "../../auth/sesion";
import { cambiarEstadoMiembro, cambiarRolMiembro, invitarMiembro } from "../actions/equipo.actions";
import { resumirCambioMiembro } from "../lib/historial";
import { AYUDA_ROL_EQUIPO, etiquetaRolEquipo, puedeModificarMiembro, rolesAsignables } from "../lib/roles";
import type { MiembroEquipo } from "../types";

const CLASE_SELECT =
  "border-input h-9 rounded-md border bg-white px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

/** Un miembro con lo que depende de la zona horaria ya formateado en el servidor. */
export interface MiembroVista extends MiembroEquipo {
  ultimoAccesoLabel: string | null;
}

interface EquipoPanelProps {
  miembros: MiembroVista[];
  historial: CambioAuditado[];
  /** Quien mira la pantalla: nadie se modifica a sí mismo. */
  yoId: string;
  rolLlamante: RolTenant;
}

function InvitarForm({ rolLlamante, onSuccess }: { rolLlamante: RolTenant; onSuccess: () => void }) {
  const roles = rolesAsignables(rolLlamante);
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState<RolTenant>("operativo");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    const r = await invitarMiembro({ email, rol });
    setEnviando(false);
    if (!r.ok) {
      setError(r.message);
      toast.error(r.message);
      return;
    }
    toast.success(r.data.reactivado ? "Miembro reactivado" : "Invitación enviada");
    onSuccess();
  }

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="equipo-email">Correo electrónico</Label>
        <Input
          id="equipo-email"
          type="email"
          inputMode="email"
          autoComplete="off"
          placeholder="persona@empresa.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="equipo-rol">Rol</Label>
        <select
          id="equipo-rol"
          className={`${CLASE_SELECT} w-full`}
          value={rol}
          onChange={(e) => setRol(e.target.value as RolTenant)}
        >
          {roles.map((r) => (
            <option key={r} value={r}>
              {etiquetaRolEquipo(r)}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-500">{AYUDA_ROL_EQUIPO[rol]}</p>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <p className="text-xs text-gray-500">
        Si la persona aún no tiene cuenta, recibirá un correo de invitación. Entrará solo a los datos de tu cliente.
      </p>
      <Button type="submit" className="w-full" disabled={enviando}>
        {enviando ? "Enviando…" : "Invitar"}
      </Button>
    </form>
  );
}

export function EquipoPanel({ miembros, historial, yoId, rolLlamante }: EquipoPanelProps) {
  const [vista, setVista] = useState<"equipo" | "historial">("equipo");
  const [invitando, setInvitando] = useState(false);
  const [cambioRol, setCambioRol] = useState<{ miembro: MiembroVista; nuevo: RolTenant } | null>(null);
  const [aDesactivar, setADesactivar] = useState<MiembroVista | null>(null);

  const rolesOferta = useMemo(() => rolesAsignables(rolLlamante), [rolLlamante]);
  const emailPorRegistro = useMemo(() => new Map(miembros.map((m) => [m.id, m.email])), [miembros]);

  async function confirmarRol() {
    if (!cambioRol) return;
    const { miembro, nuevo } = cambioRol;
    setCambioRol(null);
    const r = await cambiarRolMiembro(miembro.userId, nuevo);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    toast.success(`${miembro.email} ahora es ${etiquetaRolEquipo(nuevo)}`);
  }

  async function cambiarEstado(miembro: MiembroVista, activo: boolean) {
    setADesactivar(null);
    const r = await cambiarEstadoMiembro(miembro.userId, activo);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    toast.success(activo ? "Miembro reactivado" : "Miembro desactivado");
  }

  const columns: ColumnDef<MiembroVista>[] = useMemo(
    () => [
      {
        accessorKey: "email",
        header: "Correo",
        cell: ({ row }) => (
          <span className="font-medium text-gray-800">
            {row.original.email}
            {row.original.userId === yoId && <span className="ml-2 text-xs font-normal text-gray-500">(tú)</span>}
          </span>
        ),
      },
      {
        id: "rol",
        header: "Rol",
        accessorFn: (m) => etiquetaRolEquipo(m.rol),
        cell: ({ row }) => {
          const m = row.original;
          if (!puedeModificarMiembro(rolLlamante, m, yoId)) {
            return <Badge variant="secondary">{etiquetaRolEquipo(m.rol)}</Badge>;
          }
          return (
            <select
              aria-label={`Rol de ${m.email}`}
              className={CLASE_SELECT}
              value={m.rol}
              onChange={(e) => setCambioRol({ miembro: m, nuevo: e.target.value as RolTenant })}
            >
              {rolesOferta.map((r) => (
                <option key={r} value={r}>
                  {etiquetaRolEquipo(r)}
                </option>
              ))}
            </select>
          );
        },
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
        id: "ultimoAcceso",
        header: "Último acceso",
        accessorFn: (m) => m.ultimoAcceso ?? "",
        cell: ({ row }) => (
          <span className="text-gray-600">{row.original.ultimoAccesoLabel ?? "Aún no ha entrado"}</span>
        ),
      },
      {
        id: "actions",
        header: "Acciones",
        cell: ({ row }) => {
          const m = row.original;
          if (!puedeModificarMiembro(rolLlamante, m, yoId)) return null;
          return m.activo ? (
            <button
              onClick={() => setADesactivar(m)}
              className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
              title="Desactivar miembro"
            >
              <PowerOff className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              onClick={() => void cambiarEstado(m, true)}
              className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-green-50 hover:text-green-600"
              title="Reactivar miembro"
            >
              <Power className="h-3.5 w-3.5" />
            </button>
          );
        },
      },
    ],
    [rolLlamante, yoId, rolesOferta],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-gray-800 sm:text-2xl">Equipo</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Quién entra a tu cliente y con qué rol · {miembros.filter((m) => m.activo).length} activos de {miembros.length}
          </p>
        </div>
        <Button onClick={() => setInvitando(true)} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Invitar
        </Button>
      </div>

      <div className="flex gap-2" role="tablist" aria-label="Vista del equipo">
        {(["equipo", "historial"] as const).map((v) => (
          <Button
            key={v}
            role="tab"
            aria-selected={vista === v}
            variant={vista === v ? "default" : "outline"}
            size="sm"
            onClick={() => setVista(v)}
          >
            {v === "equipo" ? "Miembros" : "Historial"}
          </Button>
        ))}
      </div>

      {vista === "equipo" ? (
        <DataTable data={miembros} columns={columns} filterPlaceholder="  Buscar por correo..." />
      ) : (
        <HistorialCambios
          cambios={historial}
          resumir={(c) => resumirCambioMiembro(c.accion, c.cambios)}
          etiquetaRegistro={(c) => {
            const email = emailPorRegistro.get(c.registroId);
            return email ? `Miembro: ${email}` : undefined;
          }}
        />
      )}

      <EntityModal open={invitando} onClose={() => setInvitando(false)} title="Invitar al equipo">
        <InvitarForm key={String(invitando)} rolLlamante={rolLlamante} onSuccess={() => setInvitando(false)} />
      </EntityModal>

      <DeleteConfirmationDialog
        open={cambioRol !== null}
        onOpenChange={(abierto) => !abierto && setCambioRol(null)}
        onConfirm={() => void confirmarRol()}
        title="¿Cambiar el rol?"
        description={
          cambioRol
            ? `${cambioRol.miembro.email} pasará de ${etiquetaRolEquipo(cambioRol.miembro.rol)} a ${etiquetaRolEquipo(cambioRol.nuevo)}. ${AYUDA_ROL_EQUIPO[cambioRol.nuevo]}`
            : undefined
        }
        confirmLabel="Cambiar rol"
      />

      <DeleteConfirmationDialog
        open={aDesactivar !== null}
        onOpenChange={(abierto) => !abierto && setADesactivar(null)}
        onConfirm={() => aDesactivar && void cambiarEstado(aDesactivar, false)}
        title="¿Desactivar miembro?"
        description={
          aDesactivar
            ? `${aDesactivar.email} dejará de poder entrar a tu cliente. Su historial se conserva y puedes reactivarlo cuando quieras.`
            : undefined
        }
        confirmLabel="Desactivar"
      />
    </div>
  );
}
