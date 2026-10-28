import { AlertTriangle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatearCOP } from "@/modules/cafe/compras/lib/compra";
import { filasEtapas, type EtapaLote } from "../lib/etapas";
import { formatearKg3, formatearPct } from "../lib/formato";
import { etiquetaServicio } from "../lib/servicios";
import type { TipoProceso } from "../types";

/**
 * Resumen por etapa (`v_lote_etapas`): bultos procesados, kilos que entraron y salieron, merma en kilos y %,
 * valor y desvío. Los pasos requeridos que aún no tienen ningún proceso salen como «Pendiente». Los kilos son
 * los de ESTE lote: la tabla no suma etapas entre sí (la salida de una es la entrada de la siguiente).
 */
export function EtapasTabla({ requeridos, etapas, esServicio }: { requeridos: readonly TipoProceso[]; etapas: EtapaLote[]; esServicio: boolean }) {
  const filas = filasEtapas(requeridos, etapas);
  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Etapa</TableHead>
            <TableHead className="text-right">Bultos</TableHead>
            <TableHead className="text-right">Kg entrada</TableHead>
            <TableHead className="text-right">Kg salida</TableHead>
            <TableHead className="text-right">Merma kg</TableHead>
            <TableHead className="text-right">Merma %</TableHead>
            {esServicio && <TableHead className="text-right">Valor</TableHead>}
            <TableHead>Desvío</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map((f) =>
            f.pendiente ? (
              <TableRow key={f.tipo} className="text-gray-400">
                <TableCell>{etiquetaServicio(f.tipo)}</TableCell>
                <TableCell colSpan={esServicio ? 7 : 6} className="italic">
                  Pendiente
                </TableCell>
              </TableRow>
            ) : (
              <TableRow key={f.etapa.tipo}>
                <TableCell className="font-medium">{etiquetaServicio(f.etapa.tipo)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {f.etapa.bultosProcesados}/{f.etapa.bultosTotal}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatearKg3(f.etapa.pesoEntradaKg)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatearKg3(f.etapa.pesoSalidaKg)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatearKg3(f.etapa.mermaKg)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatearPct(f.mermaPct)}</TableCell>
                {esServicio && <TableCell className="text-right tabular-nums">{formatearCOP(f.etapa.valor)}</TableCell>}
                <TableCell>
                  {f.etapa.desvios > 0 ? (
                    <span className="inline-flex items-center gap-1 text-amber-700">
                      <AlertTriangle className="h-4 w-4" aria-hidden />
                      {f.etapa.desvios === 1 ? "1 proceso" : `${f.etapa.desvios} procesos`}
                    </span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </TableCell>
              </TableRow>
            ),
          )}
        </TableBody>
      </Table>
    </div>
  );
}
