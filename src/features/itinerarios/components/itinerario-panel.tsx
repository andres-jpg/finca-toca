"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { addFincaToItinerario } from "@/features/itinerarios/actions/itinerarios.actions";
import { ItinerarioFincasEditor } from "./itinerario-fincas-editor";
import type { Itinerario, FincaCooperativa } from "@/types";

interface ItinerarioPanelProps {
  itinerario: Itinerario;
  fincasDisponibles: FincaCooperativa[];
  isAdmin: boolean;
}

export function ItinerarioPanel({ itinerario, fincasDisponibles, isAdmin }: ItinerarioPanelProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");

  const handleAdd = (fincaId: number) => {
    startTransition(async () => {
      try {
        await addFincaToItinerario(itinerario.id, fincaId);
        toast.success("Finca agregada al itinerario");
        setAddOpen(false);
        setSearch("");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Error al agregar la finca");
      }
    });
  };

  const filteredFincas = fincasDisponibles.filter((f) =>
    f.nombre.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div>
          <h3 className="font-semibold text-gray-900">{itinerario.nombre}</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {itinerario.fincas.length} finca{itinerario.fincas.length !== 1 ? "s" : ""}
          </p>
        </div>
        {isAdmin && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAddOpen(true)}
            disabled={fincasDisponibles.length === 0}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Agregar
          </Button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 p-3 overflow-y-auto max-h-[520px]">
        <ItinerarioFincasEditor
          itinerarioId={itinerario.id}
          initialFincas={itinerario.fincas}
          isAdmin={isAdmin}
        />
      </div>

      {/* Add finca dialog */}
      {isAdmin && (
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent className="max-w-sm">
            <DialogTitle>Agregar finca a {itinerario.nombre}</DialogTitle>
            <DialogDescription className="text-xs text-gray-400">
              Solo se muestran fincas sin itinerario asignado
            </DialogDescription>

            <div className="space-y-3">
              <input
                type="text"
                placeholder="Buscar finca..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />

              {filteredFincas.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">
                  {search ? "Sin resultados" : "No hay fincas disponibles"}
                </p>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {filteredFincas.map((finca) => (
                    <button
                      key={finca.id}
                      onClick={() => handleAdd(finca.id)}
                      disabled={isPending}
                      className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-teal-50 border border-transparent hover:border-teal-100 transition-colors"
                    >
                      <span className="text-sm font-medium flex-1 truncate">{finca.nombre}</span>
                      {finca.ruta_nombre && (
                        <span className="text-xs text-gray-400 shrink-0">{finca.ruta_nombre}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
