"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Plus, Pencil, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AbonoForm } from "@/features/arriendos/components/abono-form";
import { deleteAbono } from "@/features/arriendos/actions/arriendos.actions";
import { formatMoneda } from "@/features/arriendos/lib/moneda";
import { toast } from "sonner";
import type { AbonoArriendo, Arriendo } from "@/types";

const fmtFecha = (fecha: string) =>
  format(new Date(fecha + "T00:00:00"), "dd/MM/yyyy", { locale: es });

function Resumen({ arriendo }: { arriendo: Arriendo }) {
  const pagado = arriendo.saldo <= 0;
  const progreso =
    arriendo.canon > 0
      ? Math.min(100, Math.round((arriendo.total_abonado / arriendo.canon) * 100))
      : 0;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-gray-800">{arriendo.finca_nombre}</p>
        <p className="text-xs text-gray-500">
          {arriendo.arrendatario} · {fmtFecha(arriendo.fecha_inicio)} —{" "}
          {fmtFecha(arriendo.fecha_fin)}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
            Canon
          </p>
          <p className="text-sm font-semibold text-gray-900">
            {formatMoneda(arriendo.canon)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
            Abonado
          </p>
          <p className="text-sm font-semibold text-green-600">
            {formatMoneda(arriendo.total_abonado)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
            Saldo
          </p>
          <p
            className={`text-sm font-semibold ${pagado ? "text-green-600" : "text-amber-600"}`}
          >
            {formatMoneda(arriendo.saldo)}
          </p>
        </div>
      </div>

      <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${pagado ? "bg-green-500" : "bg-amber-400"}`}
          style={{ width: `${progreso}%` }}
        />
      </div>
      {arriendo.saldo < 0 && (
        <p className="text-xs text-amber-600">
          Se ha abonado {formatMoneda(-arriendo.saldo)} por encima del canon.
        </p>
      )}
    </div>
  );
}

function AbonoRow({
  abono,
  saldoTras,
  canEdit,
  onEdit,
}: {
  abono: AbonoArriendo;
  /** Saldo del arriendo después de aplicar este abono. */
  saldoTras: number;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [borrando, setBorrando] = useState(false);

  const handleDelete = async () => {
    setBorrando(true);
    try {
      await deleteAbono(abono.id);
      toast.success("Abono eliminado (y su gasto)");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo eliminar el abono"
      );
      setBorrando(false);
      setConfirmando(false);
    }
  };

  return (
    <div className="py-3 space-y-1">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800">{formatMoneda(abono.valor)}</p>
          <p className="text-xs text-gray-500">{fmtFecha(abono.fecha)}</p>
          {abono.observaciones && (
            <p className="text-xs text-gray-400 mt-0.5 break-words">
              {abono.observaciones}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span
            className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200"
            title={
              abono.gasto_id
                ? "Contabilizado en gastos"
                : "Sin gasto asociado: se regenera al editar el abono"
            }
          >
            <Zap className="h-2.5 w-2.5" />
            {abono.gasto_id ? "En gastos" : "Sin gasto"}
          </span>
          {canEdit && !confirmando && (
            <>
              <button
                onClick={onEdit}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                title="Editar abono"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setConfirmando(true)}
                className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                title="Eliminar abono"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Saldo tras este abono:{" "}
        <span className={saldoTras <= 0 ? "text-green-600" : "text-amber-600"}>
          {formatMoneda(saldoTras)}
        </span>
      </p>

      {confirmando && (
        <div className="flex items-center justify-between gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2">
          <p className="text-xs text-red-700">
            ¿Eliminar este abono y su gasto asociado?
          </p>
          <div className="flex gap-1.5 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setConfirmando(false)}
              disabled={borrando}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs bg-red-600 hover:bg-red-700"
              onClick={handleDelete}
              disabled={borrando}
            >
              {borrando ? "Eliminando..." : "Eliminar"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

interface AbonosPanelProps {
  arriendo: Arriendo;
  canEdit: boolean;
}

export function AbonosPanel({ arriendo, canEdit }: AbonosPanelProps) {
  /** `null` = formulario cerrado, `"nuevo"` = alta, un abono = edición. */
  const [editando, setEditando] = useState<"nuevo" | AbonoArriendo | null>(null);

  // El saldo corre en orden cronológico (`created_at` desempata los abonos del mismo día),
  // aunque la lista se muestre del más reciente al más antiguo.
  const saldoTrasAbono = useMemo(() => {
    const cronologico = [...arriendo.abonos].sort(
      (a, b) => a.fecha.localeCompare(b.fecha) || a.created_at.localeCompare(b.created_at)
    );
    const mapa = new Map<string, number>();
    let acumulado = 0;
    for (const abono of cronologico) {
      acumulado += abono.valor;
      mapa.set(abono.id, arriendo.canon - acumulado);
    }
    return mapa;
  }, [arriendo.abonos, arriendo.canon]);

  return (
    <div className="space-y-5">
      <Resumen arriendo={arriendo} />

      {canEdit && editando === null && (
        <Button size="sm" className="w-full" onClick={() => setEditando("nuevo")}>
          <Plus className="h-4 w-4 mr-2" />
          Registrar abono
        </Button>
      )}

      {canEdit && editando !== null && (
        <AbonoForm
          arriendoId={arriendo.id}
          abono={editando === "nuevo" ? undefined : editando}
          saldoPendiente={arriendo.saldo}
          onSuccess={() => setEditando(null)}
          onCancel={() => setEditando(null)}
        />
      )}

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Abonos ({arriendo.abonos.length})
        </p>
        {arriendo.abonos.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">
            Todavía no hay abonos registrados.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {arriendo.abonos.map((abono) => (
              <AbonoRow
                key={abono.id}
                abono={abono}
                saldoTras={saldoTrasAbono.get(abono.id) ?? arriendo.saldo}
                canEdit={canEdit}
                onEdit={() => setEditando(abono)}
              />
            ))}
          </div>
        )}
      </div>

      {arriendo.observaciones && (
        <div className="space-y-1 pt-2 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Observaciones del contrato
          </p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {arriendo.observaciones}
          </p>
        </div>
      )}
    </div>
  );
}
