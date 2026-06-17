"use client";

import { useState } from "react";
import { asignarItinerario, desasignarItinerario } from "@/features/usuarios-cooperativa/actions/usuarios.actions";
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
import type { UserCooperativa, Itinerario } from "@/types";

interface UsuarioItinerarioFormProps {
  user: UserCooperativa;
  itinerarios: Itinerario[];
  onSuccess: () => void;
}

export function UsuarioRutaForm({ user, itinerarios, onSuccess }: UsuarioItinerarioFormProps) {
  const [selectedId, setSelectedId] = useState<string>(
    user.itinerario_id ? String(user.itinerario_id) : ""
  );
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const handleAsignar = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await asignarItinerario(user.id, parseInt(selectedId, 10));
      toast.success("Itinerario asignado correctamente");
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
      await desasignarItinerario(user.id);
      toast.success("Itinerario desasignado");
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
        <Label>Itinerario asignado</Label>
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger>
            <SelectValue placeholder="Selecciona un itinerario" />
          </SelectTrigger>
          <SelectContent>
            {itinerarios.map((it) => (
              <SelectItem key={it.id} value={String(it.id)}>
                {it.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        onClick={handleAsignar}
        disabled={!selectedId || saving}
        className="w-full"
      >
        {saving ? "Guardando..." : user.itinerario_id ? "Cambiar itinerario" : "Asignar itinerario"}
      </Button>

      {user.itinerario_id && (
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
