"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { EmpaqueForm } from "../../empaque/components/empaque-form";
import type { ConfigEmpaque } from "../../empaque/types";
import { textoReapertura } from "../lib/reapertura";
import type { ReaperturaVista } from "../types";
import { MoliendaReaperturaForm } from "./molienda-reapertura-form";

type Paso = "molienda" | "empaque";

const BOTON = "min-h-12 rounded-md border px-4 text-base font-medium transition-colors";

interface Props {
  reapertura: ReaperturaVista;
  /** Presentaciones de las bolsas activas, con su stock y el producto del tipo de café del lote. */
  config: ConfigEmpaque;
  fechaHoy: string;
  /** Fecha de la molienda, para «Viene de la molienda del 15/11». */
  fechaMolienda: string | null;
}

/**
 * Los dos pasos posibles sobre un café reabierto: moler y/o empacar. Sin trilla ni tostión. Se puede empacar directo
 * (reempacar sin moler) o moler primero y empacar la molienda; cada paso se hace una sola vez. El paso ya hecho sale
 * deshabilitado con el motivo a la vista.
 */
export function ReaperturaPlanta({ reapertura: r, config, fechaHoy, fechaMolienda }: Props) {
  const molida = r.moliendaId !== null;
  const empacada = r.empaqueId !== null;
  const [paso, setPaso] = useState<Paso>(molida ? "empaque" : "molienda");

  const origenEmpaque = molida
    ? `Viene de la molienda${fechaMolienda ? ` del ${fechaMolienda}` : ""}`
    : `Viene de la reapertura de ${textoReapertura(r.unidades, r.producto, r.pesoKg)}`;

  const opciones: { id: Paso; etiqueta: string; deshabilitado: boolean; motivo: string | null }[] = [
    { id: "molienda", etiqueta: "Moler", deshabilitado: molida || empacada, motivo: empacada ? "Ya se empacó" : molida ? "Ya se molió" : null },
    { id: "empaque", etiqueta: "Empacar", deshabilitado: empacada, motivo: empacada ? "Ya se empacó" : null },
  ];

  if (empacada) {
    return (
      <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
        Esta reapertura ya se empacó: no tiene pasos pendientes.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Paso" className="grid grid-cols-2 gap-2 sm:max-w-md">
        {opciones.map((o) => (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={paso === o.id}
            disabled={o.deshabilitado}
            onClick={() => setPaso(o.id)}
            className={cn(
              BOTON,
              paso === o.id ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
              o.deshabilitado && "cursor-not-allowed opacity-50",
            )}
          >
            {o.etiqueta}
            {o.motivo && <span className="block text-xs font-normal opacity-80">{o.motivo}</span>}
          </button>
        ))}
      </div>
      {!molida && <p className="text-xs text-gray-500">La molienda es opcional: puedes empacar directamente lo reabierto en otra presentación.</p>}

      {paso === "molienda" ? (
        <MoliendaReaperturaForm
          key={`mol-${r.id}`}
          loteId={r.loteId}
          reaperturaId={r.id}
          pesoEntradaKg={r.pesoKg}
          fechaHoy={fechaHoy}
          fechaReapertura={r.fecha}
        />
      ) : (
        <EmpaqueForm
          key={`emp-${r.id}-${molida ? "m" : "d"}`}
          lote={{ id: r.loteId, linea: "marca_propia", servicios: [], tipoCafe: r.tipoCafe }}
          bultos={[]}
          config={config}
          fechaHoy={fechaHoy}
          bultoIdsIniciales={[]}
          pesoDisponibleInicial={r.pesoDisponibleKg}
          reapertura={{ id: r.id, origen: origenEmpaque }}
        />
      )}
    </div>
  );
}
