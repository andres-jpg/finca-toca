"use client";

import { useState } from "react";
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
import { GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateFincasOrden } from "@/features/rutas-cooperativa/actions/rutas.actions";
import { toast } from "sonner";
import type { FincaCooperativa } from "@/types";

function SortableFinca({ finca }: { finca: FincaCooperativa }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: finca.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2"
    >
      <button
        type="button"
        className="cursor-grab touch-none text-gray-400 hover:text-gray-600"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="text-sm font-medium flex-1">{finca.nombre}</span>
      <span className="text-xs text-teal-700">
        ${finca.precio_litro.toLocaleString("es-CO", { minimumFractionDigits: 2 })}/L
      </span>
    </div>
  );
}

interface FincasOrderEditorProps {
  fincas: FincaCooperativa[];
  rutaId: number;
  onDone: () => void;
}

export function FincasOrderEditor({ fincas, rutaId, onDone }: FincasOrderEditorProps) {
  const [items, setItems] = useState<FincaCooperativa[]>(fincas);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setItems((prev) => {
        const oldIndex = prev.findIndex((f) => f.id === active.id);
        const newIndex = prev.findIndex((f) => f.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateFincasOrden(rutaId, items.map((f) => f.id));
      toast.success("Orden guardado");
      onDone();
    } catch {
      toast.error("No se pudo guardar el orden");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {items.map((finca) => (
              <SortableFinca key={finca.id} finca={finca} />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Guardando..." : "Guardar orden"}
        </Button>
        <Button size="sm" variant="outline" onClick={onDone} disabled={saving}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
