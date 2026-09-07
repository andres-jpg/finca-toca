"use client";

import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeleteConfirmationDialog } from "@/components/shared/delete-confirmation-dialog";
import { MedicionLecheForm } from "@/features/mediciones-leche/components/medicion-leche-form";
import { deleteMedicionLeche } from "@/features/mediciones-leche/actions/mediciones-leche.actions";
import type { EventoParaDiasEnLeche } from "@/lib/animales/estados";
import { toast } from "sonner";
import type { MedicionLecheAnimal } from "@/types";

const fmtFecha = (fecha: string) =>
  format(new Date(fecha + "T00:00:00"), "dd/MM/yyyy", { locale: es });

const fmtLitros = (litros: number) =>
  `${litros.toLocaleString("es-CO", { maximumFractionDigits: 2 })} L`;

interface MedicionRowProps {
  medicion: MedicionLecheAnimal;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
}

function MedicionRow({ medicion, canEdit, canDelete, onEdit }: MedicionRowProps) {
  const [confirmando, setConfirmando] = useState(false);

  const handleDelete = async () => {
    try {
      await deleteMedicionLeche(medicion.id, medicion.animal_id);
      toast.success("Medición eliminada");
      setConfirmando(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar la medición");
    }
  };

  return (
    <div className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800">{fmtLitros(medicion.litros)}</p>
          <p className="text-xs text-gray-500">{fmtFecha(medicion.fecha)}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {medicion.dias_en_leche === null
              ? "Sin parto/aborto registrado antes de esa fecha"
              : `${medicion.dias_en_leche} ${medicion.dias_en_leche === 1 ? "día" : "días"} en leche`}
          </p>
        </div>
        {(canEdit || canDelete) && (
          <div className="flex items-center gap-1 shrink-0">
            {canEdit && (
              <button
                onClick={onEdit}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                title="Editar medición"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => setConfirmando(true)}
                className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                title="Eliminar medición"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      <DeleteConfirmationDialog
        open={confirmando}
        onOpenChange={setConfirmando}
        onConfirm={handleDelete}
        title="¿Eliminar esta medición?"
        description={`Se eliminará la medición del ${fmtFecha(medicion.fecha)} (${fmtLitros(medicion.litros)}). Esta acción no se puede deshacer.`}
      />
    </div>
  );
}

interface MedicionesLechePanelProps {
  animalId: string;
  mediciones: MedicionLecheAnimal[];
  eventosPrevios: EventoParaDiasEnLeche[];
  canEdit: boolean;
  canDelete: boolean;
}

export function MedicionesLechePanel({
  animalId,
  mediciones,
  eventosPrevios,
  canEdit,
  canDelete,
}: MedicionesLechePanelProps) {
  /** `null` = formulario cerrado, `"nuevo"` = alta, una medición = edición. */
  const [editando, setEditando] = useState<"nuevo" | MedicionLecheAnimal | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Mediciones ({mediciones.length})
        </p>
        {canEdit && editando === null && (
          <Button size="sm" variant="outline" onClick={() => setEditando("nuevo")}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Registrar medición
          </Button>
        )}
      </div>

      {canEdit && editando !== null && (
        <MedicionLecheForm
          animalId={animalId}
          medicion={editando === "nuevo" ? undefined : editando}
          eventosPrevios={eventosPrevios}
          onSuccess={() => setEditando(null)}
          onCancel={() => setEditando(null)}
        />
      )}

      {mediciones.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">
          Todavía no hay mediciones registradas.
        </p>
      ) : (
        <div className="divide-y divide-gray-100">
          {mediciones.map((medicion) => (
            <MedicionRow
              key={medicion.id}
              medicion={medicion}
              canEdit={canEdit}
              canDelete={canDelete}
              onEdit={() => setEditando(medicion)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
