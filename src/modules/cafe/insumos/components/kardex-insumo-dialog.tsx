"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KardexTable } from "@/modules/core/inventario/components/kardex-table";
import { obtenerKardexInsumo } from "../actions/insumos.actions";
import type { InsumoEmpaque, KardexInsumo } from "../types";

interface KardexInsumoDialogProps {
  /** El insumo cuyo kardex se muestra; `null` = cerrado. */
  insumo: InsumoEmpaque | null;
  zonaHoraria: string;
  onClose: () => void;
}

type Carga = { articuloId: string; error: string | null; kardex: KardexInsumo | null };

/** Kardex de un insumo en un modal: fecha, motivo, entradas/salidas, saldo, proveedor y usuario de cada movimiento. */
export function KardexInsumoDialog({ insumo, zonaHoraria, onClose }: KardexInsumoDialogProps) {
  // Lo último cargado y de qué insumo era: mientras no coincida con el abierto, «cargando».
  const [carga, setCarga] = useState<Carga | null>(null);
  const articuloId = insumo?.articulo_id ?? null;

  useEffect(() => {
    if (!articuloId) return;
    let vigente = true;
    obtenerKardexInsumo(articuloId).then((r) => {
      if (vigente) setCarga({ articuloId, error: r.ok ? null : r.message, kardex: r.ok ? r.data : null });
    });
    return () => {
      vigente = false;
    };
  }, [articuloId]);

  const actual = carga?.articuloId === articuloId ? carga : null;

  return (
    <Dialog open={insumo !== null} onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Kardex · {insumo?.nombre}</DialogTitle>
          <DialogDescription>
            Cada entrada y salida de este insumo. El stock es la suma de sus movimientos: nunca se edita.
          </DialogDescription>
        </DialogHeader>
        {!actual ? (
          <p className="py-8 text-center text-sm text-gray-500">Cargando…</p>
        ) : actual.error || !actual.kardex ? (
          <p className="py-8 text-center text-sm text-red-600">{actual.error ?? "No se pudo cargar el kardex."}</p>
        ) : actual.kardex.movimientos.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">Este insumo aún no tiene movimientos.</p>
        ) : (
          <KardexTable
            movimientos={actual.kardex.movimientos}
            unidad="unidad"
            zonaHoraria={zonaHoraria}
            usuarios={actual.kardex.usuarios}
            referencias={actual.kardex.proveedores}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
