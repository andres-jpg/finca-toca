"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ActivarPagoPanel } from "@/features/pagos-cooperativa/components/activar-pago-panel";
import { HistorialPagosTable } from "@/features/pagos-cooperativa/components/historial-pagos-table";
import type { RutaCooperativa, PagoFinca, Itinerario } from "@/types";

type Tab = "activar" | "historial";

interface Props {
  rutas: RutaCooperativa[];
  itinerarios: Pick<Itinerario, "id" | "nombre">[];
  historial: PagoFinca[];
}

export function PagosCooperativaClient({ rutas, itinerarios, historial }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("activar");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Control de pagos</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Activa el pago de rutas y consulta el historial de cobros a fincas
        </p>
      </div>

      {/* Pestañas */}
      <div className="border-b border-border flex gap-1">
        {(["activar", "historial"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              activeTab === tab
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab === "activar" ? "Activar pago" : "Historial"}
          </button>
        ))}
      </div>

      {activeTab === "activar" && <ActivarPagoPanel rutas={rutas} />}
      {activeTab === "historial" && (
        <HistorialPagosTable initialData={historial} itinerarios={itinerarios} />
      )}
    </div>
  );
}
