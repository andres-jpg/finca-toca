"use client";

import { useState } from "react";
import { asignarRuta, desasignarRuta } from "@/features/usuarios-cooperativa/actions/usuarios.actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { UserCooperativa, RutaCooperativa } from "@/types";

interface UsuarioRutaFormProps {
  user: UserCooperativa;
  rutas: RutaCooperativa[];
  onSuccess: () => void;
}

export function UsuarioRutaForm({ user, rutas, onSuccess }: UsuarioRutaFormProps) {
  const [selectedRutaId, setSelectedRutaId] = useState<string>(
    user.ruta_id ? String(user.ruta_id) : ""
  );
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const handleAsignar = async () => {
    if (!selectedRutaId) return;
    setSaving(true);
    try {
      await asignarRuta(user.id, parseInt(selectedRutaId, 10));
      toast.success("Ruta asignada correctamente");
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  };

  const handleDesasignar = async () => {
    setRemoving(true);
    try {
      await desasignarRuta(user.id);
      toast.success("Ruta desasignada");
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wide">Usuario</p>
        <p className="font-medium">{user.email}</p>
      </div>

      <div className="space-y-2">
        <Label>Ruta asignada</Label>
        <Select value={selectedRutaId} onValueChange={setSelectedRutaId}>
          <SelectTrigger>
            <SelectValue placeholder="Selecciona una ruta" />
          </SelectTrigger>
          <SelectContent>
            {rutas.map((r) => (
              <SelectItem key={r.id} value={String(r.id)}>
                {r.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        onClick={handleAsignar}
        disabled={!selectedRutaId || saving}
        className="w-full"
      >
        {saving ? "Guardando..." : user.ruta_id ? "Cambiar ruta" : "Asignar ruta"}
      </Button>

      {user.ruta_id && (
        <Button
          variant="outline"
          onClick={handleDesasignar}
          disabled={removing}
          className="w-full text-red-600 border-red-200 hover:bg-red-50"
        >
          {removing ? "Quitando..." : "Quitar asignación"}
        </Button>
      )}
    </div>
  );
}
