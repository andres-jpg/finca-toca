"use client";

import { useState, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { updateItinerarioFincasOrden, removeFincaFromItinerario } from "@/features/itinerarios/actions/itinerarios.actions";
import type { ItinerarioFinca } from "@/types";

const RUTA_COLORS: string[] = [
  "bg-teal-100 text-teal-800",
  "bg-blue-100 text-blue-800",
  "bg-violet-100 text-violet-800",
  "bg-orange-100 text-orange-800",
  "bg-pink-100 text-pink-800",
  "bg-yellow-100 text-yellow-800",
  "bg-green-100 text-green-800",
  "bg-red-100 text-red-800",
  "bg-indigo-100 text-indigo-800",
  "bg-cyan-100 text-cyan-800",
];

function getRutaColor(rutaColorMap: Map<string, string>, rutaNombre: string): string {
  if (!rutaColorMap.has(rutaNombre)) {
    const color = RUTA_COLORS[rutaColorMap.size % RUTA_COLORS.length];
    rutaColorMap.set(rutaNombre, color);
  }
  return rutaColorMap.get(rutaNombre)!;
}

function SortableFincaRow({
  finca,
  isAdmin,
  itinerarioId,
  onRemove,
  rutaColorMap,
}: {
  finca: ItinerarioFinca;
  isAdmin: boolean;
  itinerarioId: number;
  onRemove: (id: number) => void;
  rutaColorMap: Map<string, string>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: finca.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 shadow-sm"
    >
      <button
        type="button"
        className="cursor-grab touch-none text-gray-300 hover:text-gray-500"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="text-sm font-medium flex-1 truncate">{finca.nombre}</span>
      {finca.ruta_nombre && (
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${getRutaColor(rutaColorMap, finca.ruta_nombre)}`}>
          {finca.ruta_nombre}
        </span>
      )}
      {isAdmin && (
        <span className="text-xs text-teal-700 font-medium shrink-0">
          ${finca.precio_litro.toLocaleString("es-CO", { minimumFractionDigits: 2 })}/L
        </span>
      )}
      {isAdmin && (
        <button
          type="button"
          onClick={() => onRemove(finca.id)}
          className="text-gray-300 hover:text-red-500 transition-colors shrink-0"
          title="Quitar finca"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

interface ItinerarioFincasEditorProps {
  itinerarioId: number;
  initialFincas: ItinerarioFinca[];
  isAdmin: boolean;
}

export function ItinerarioFincasEditor({
  itinerarioId,
  initialFincas,
  isAdmin,
}: ItinerarioFincasEditorProps) {
  const [fincas, setFincas] = useState<ItinerarioFinca[]>(initialFincas);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const rutaColorMap = useMemo(() => {
    const map = new Map<string, string>();
    initialFincas.forEach((f) => {
      if (f.ruta_nombre) getRutaColor(map, f.ruta_nombre);
    });
    return map;
  }, [initialFincas]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setFincas((prev) => {
        const oldIndex = prev.findIndex((f) => f.id === active.id);
        const newIndex = prev.findIndex((f) => f.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
      setDirty(true);
    }
  };

  const handleRemove = async (fincaId: number) => {
    try {
      await removeFincaFromItinerario(itinerarioId, fincaId);
      setFincas((prev) => prev.filter((f) => f.id !== fincaId));
      toast.success("Finca quitada del itinerario");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al quitar la finca");
    }
  };

  const handleSaveOrder = async () => {
    setSaving(true);
    try {
      await updateItinerarioFincasOrden(itinerarioId, fincas.map((f) => f.id));
      setDirty(false);
      toast.success("Orden guardado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al guardar el orden");
    } finally {
      setSaving(false);
    }
  };

  if (fincas.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-6">
        Sin fincas asignadas
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={fincas.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {fincas.map((finca) => (
              <SortableFincaRow
                key={finca.id}
                finca={finca}
                isAdmin={isAdmin}
                itinerarioId={itinerarioId}
                onRemove={handleRemove}
                rutaColorMap={rutaColorMap}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {dirty && (
        <Button size="sm" onClick={handleSaveOrder} disabled={saving} className="w-full">
          {saving ? "Guardando..." : "Guardar orden"}
        </Button>
      )}
    </div>
  );
}
