"use client";
import { COPY_TUESTE } from "@/modules/cafe/copy";

import { useState } from "react";
import { History, Pencil } from "lucide-react";
import { EntityModal } from "@/components/shared/entity-modal";
import { Button } from "@/components/ui/button";
import { textoPerfilTueste } from "../../lotes/lib/perfil-tueste";
import { NivelTuesteChip } from "../../procesos/components/nivel-tueste-chip";
import { historialPerfil, proximoPerfil, resolverPerfilVigente } from "../lib/perfil-vigente";
import type { PerfilTuesteTipo } from "../types";
import { PerfilTuesteForm } from "./perfil-tueste-form";

export interface FilaPerfilTipo {
  /** `null` = maquila. */
  tipoCafeId: string | null;
  nombre: string;
  /** Texto de apoyo bajo el nombre. */
  detalle?: string;
}

interface PerfilesTuestePanelProps {
  filas: FilaPerfilTipo[];
  perfiles: PerfilTuesteTipo[];
  /** Hoy en la zona del cliente (`YYYY-MM-DD`). */
  fechaHoy: string;
}

function formatoFecha(f: string): string {
  const [y, m, d] = f.split("-");
  return `${d}/${m}/${y}`;
}

function FilaPerfil({ fila, perfiles, fechaHoy }: { fila: FilaPerfilTipo; perfiles: PerfilTuesteTipo[]; fechaHoy: string }) {
  const [editando, setEditando] = useState(false);
  const [verHistorial, setVerHistorial] = useState(false);
  const vigente = resolverPerfilVigente(perfiles, fila.tipoCafeId, fechaHoy);
  const proximo = proximoPerfil(perfiles, fila.tipoCafeId, fechaHoy);
  const historial = historialPerfil(perfiles, fila.tipoCafeId);

  return (
    <li className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-semibold text-gray-800">{fila.nombre}</p>
          {fila.detalle && <p className="text-xs text-gray-500">{fila.detalle}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {vigente ? (
            <>
              <NivelTuesteChip nivel={vigente.nivel} />
              <span className="text-sm text-gray-700">
                {vigente.tempC.toLocaleString("es-CO")} °C · {vigente.tiempoMin.toLocaleString("es-CO")} min
              </span>
              <span className="text-xs text-gray-500">desde {formatoFecha(vigente.vigenteDesde)}</span>
            </>
          ) : (
            <span className="text-sm text-amber-700">Sin perfil definido</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="sm" onClick={() => setEditando(true)}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Cambiar perfil
          </Button>
          {historial.length > 1 && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setVerHistorial((v) => !v)} aria-expanded={verHistorial}>
              <History className="mr-1.5 h-3.5 w-3.5" />
              Historial
            </Button>
          )}
        </div>
      </div>

      {proximo && (
        <p className="mt-2 text-xs text-gray-600">
          Cambia el {formatoFecha(proximo.vigenteDesde)}: {textoPerfilTueste(proximo)}.
        </p>
      )}

      {verHistorial && (
        <ul className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-sm text-gray-700">
          {historial.map((p) => (
            <li key={p.id} className="flex justify-between gap-3">
              <span>{textoPerfilTueste(p)}</span>
              <span className="text-gray-500">desde {formatoFecha(p.vigenteDesde)}</span>
            </li>
          ))}
        </ul>
      )}

      <EntityModal open={editando} onClose={() => setEditando(false)} title={`${COPY_TUESTE.perfilDeTueste} · ${fila.nombre}`}>
        <PerfilTuesteForm
          tipoCafeId={fila.tipoCafeId}
          nombre={fila.nombre}
          actual={vigente}
          fechaHoy={fechaHoy}
          onSuccess={() => setEditando(false)}
        />
      </EntityModal>
    </li>
  );
}

export function PerfilesTuestePanel({ filas, perfiles, fechaHoy }: PerfilesTuestePanelProps) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-gray-800 sm:text-2xl">{COPY_TUESTE.perfilesPorTipoDeCafe}</h2>
        <p className="mt-0.5 text-sm text-gray-500">
          Un perfil de tueste es el nivel, la temperatura y el tiempo. Cada cambio rige desde una fecha y no altera los
          lotes ya recibidos.
        </p>
      </div>
      <ul className="space-y-3">
        {filas.map((f) => (
          <FilaPerfil key={f.tipoCafeId ?? "maquila"} fila={f} perfiles={perfiles} fechaHoy={fechaHoy} />
        ))}
      </ul>
    </div>
  );
}
