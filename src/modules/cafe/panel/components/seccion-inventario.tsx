import { AlertaStockBajo } from "@/modules/core/inventario/components/alerta-stock-bajo";
import { getInsumosBajoMinimo, getMatrizProductoTerminado } from "../../empaque/queries/empaque.queries";
import { DEFINICIONES } from "../lib/kpis";
import { cuentaLotes, enteroTexto, kgTexto } from "../lib/formato";
import { getKpisPanel } from "../queries/panel.queries";
import type { LineaPanel } from "../types";
import { MatrizProductoCompacta } from "./matriz-producto-compacta";
import { Cifra, Detalle, TarjetaKpi } from "./tarjeta-kpi";

interface Props {
  desde: string;
  hasta: string;
  linea: LineaPanel | null;
}

/**
 * Fila 2: inventario propio (matriz tipo × presentación de CO-30 y café sin empacar), inventario de terceros (kg en planta por
 * cliente, los cinco con más) e insumos bajo mínimo. Es una FOTO de ahora: no depende del periodo. Con «Marca propia» no hay
 * inventario de terceros y con trilla o maquila no hay inventario propio.
 */
export async function SeccionInventario({ desde, hasta, linea }: Props) {
  const k = await getKpisPanel(desde, hasta, linea);
  const [pt, insumos] = await Promise.all([k.inventarioPropio ? getMatrizProductoTerminado() : null, getInsumosBajoMinimo()]);
  const terceros = k.inventarioTerceros;
  const maxKg = Math.max(1, ...(terceros?.porCliente.map((c) => c.kg) ?? [1]));

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(20rem,1fr))] gap-3">
      {k.inventarioPropio && pt && (
        <TarjetaKpi titulo={DEFINICIONES.inventarioPropio.titulo} definicion={DEFINICIONES.inventarioPropio.texto}>
          <div>
            <Cifra>{kgTexto(k.inventarioPropio.cafeEnPlantaKg)}</Cifra>
            <Detalle>
              café de marca propia en planta sin empacar · {cuentaLotes(k.inventarioPropio.lotesEnPlanta)}
            </Detalle>
          </div>
          <MatrizProductoCompacta matriz={pt.matriz} />
          <Detalle>Producto terminado en existencia ≈ {kgTexto(k.inventarioPropio.productoTerminadoKg)}</Detalle>
        </TarjetaKpi>
      )}

      {terceros && (
        <TarjetaKpi titulo={DEFINICIONES.inventarioTerceros.titulo} definicion={DEFINICIONES.inventarioTerceros.texto}>
          <div>
            <Cifra>{kgTexto(terceros.kgEnPlanta)}</Cifra>
            <Detalle>
              en planta · {terceros.clientes === 1 ? "1 cliente" : `${enteroTexto(terceros.clientes)} clientes`} · {cuentaLotes(terceros.lotes)}
            </Detalle>
          </div>
          {terceros.porCliente.length === 0 ? (
            <p className="rounded-md border border-dashed border-gray-300 px-3 py-6 text-center text-sm text-gray-500">No hay café de clientes en planta.</p>
          ) : (
            <ul className="space-y-2.5">
              {terceros.porCliente.map((c) => (
                <li key={c.terceroId ?? c.nombre}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium text-gray-800">{c.nombre}</span>
                    <span className="shrink-0 tabular-nums text-gray-700">{kgTexto(c.kg)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100" aria-hidden>
                    <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.max(2, Math.round((c.kg / maxKg) * 100))}%` }} />
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">{cuentaLotes(c.lotes)}</p>
                </li>
              ))}
              {terceros.clientes > terceros.porCliente.length && (
                <li className="text-xs text-gray-500">y {enteroTexto(terceros.clientes - terceros.porCliente.length)} clientes más</li>
              )}
            </ul>
          )}
        </TarjetaKpi>
      )}

      <div className="flex flex-col gap-2">
        <AlertaStockBajo articulos={insumos} className="h-full" />
        <p className="px-1 text-xs text-gray-500">{DEFINICIONES.insumos.texto}</p>
      </div>
    </div>
  );
}
