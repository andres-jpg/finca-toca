"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KardexTable } from "@/modules/core/inventario/components/kardex-table";
import { obtenerKardexProducto } from "../actions/empaque.actions";
import type { KardexProducto } from "../types";

interface KardexProductoDialogProps {
  /** El producto cuyo kardex se muestra; `null` = cerrado. */
  producto: { articuloId: string; nombre: string } | null;
  zonaHoraria: string;
  onClose: () => void;
}

type Carga = { articuloId: string; error: string | null; kardex: KardexProducto | null };

/**
 * Kardex de un producto terminado en un modal: fecha, motivo, entradas/salidas, saldo, usuario y ORIGEN de cada
 * movimiento (el lote que se empacó, con enlace a su ficha; la venta…).
 */
export function KardexProductoDialog({ producto, zonaHoraria, onClose }: KardexProductoDialogProps) {
  // Lo último cargado y de qué producto era: mientras no coincida con el abierto, «cargando».
  const [carga, setCarga] = useState<Carga | null>(null);
  const articuloId = producto?.articuloId ?? null;

  useEffect(() => {
    if (!articuloId) return;
    let vigente = true;
    obtenerKardexProducto(articuloId).then((r) => {
      if (vigente) setCarga({ articuloId, error: r.ok ? null : r.message, kardex: r.ok ? r.data : null });
    });
    return () => {
      vigente = false;
    };
  }, [articuloId]);

  const actual = carga?.articuloId === articuloId ? carga : null;

  return (
    <Dialog open={producto !== null} onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Kardex · {producto?.nombre}</DialogTitle>
          <DialogDescription>
            Cada entrada y salida de este producto. Las entradas son solo por empaque; el stock es la suma de sus movimientos y nunca se edita.
          </DialogDescription>
        </DialogHeader>
        {!actual ? (
          <p className="py-8 text-center text-sm text-gray-500">Cargando…</p>
        ) : actual.error || !actual.kardex ? (
          <p className="py-8 text-center text-sm text-red-600">{actual.error ?? "No se pudo cargar el kardex."}</p>
        ) : actual.kardex.movimientos.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">Este producto aún no tiene movimientos.</p>
        ) : (
          <KardexTable
            movimientos={actual.kardex.movimientos}
            unidad="unidad"
            zonaHoraria={zonaHoraria}
            usuarios={actual.kardex.usuarios}
            referencias={actual.kardex.referencias}
            enlaces={actual.kardex.enlaces}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
