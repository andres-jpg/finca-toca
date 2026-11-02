import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { requireSesion } from "@/modules/core/auth/guards";
import { requireModuloPagina } from "@/modules/core/tenants/tenant.guards";
import { fechaHoyEnZona } from "@/modules/cafe/insumos/lib/insumos";
import { EntregarForm } from "@/modules/cafe/remisiones/components/entregar-form";
import { agruparPorCliente } from "@/modules/cafe/remisiones/lib/entregar";
import { getLotesEntregables } from "@/modules/cafe/remisiones/queries/entregar.queries";

/**
 * «Entregar» (A-14): una remisión con uno o varios lotes listos de un mismo cliente. Se abre desde la columna «Por
 * entregar» de Planta (`?lote=<id>`) y desde el aviso «Lote listo» del empaque. Owner/admin/operativo; Gerencia
 * (`viewer`) no entrega y vuelve a la lista de lotes. La action y la RPC repiten módulo y rol.
 */
export const metadata = { title: "Entregar" };

interface Props {
  searchParams: Promise<{ lote?: string | string[]; cliente?: string | string[] }>;
}

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function EntregarPage({ searchParams }: Props) {
  await requireModuloPagina("cafe.remisiones");
  const { rolTenant, tenant } = await requireSesion();
  if (rolTenant === "viewer") redirect("/dashboard/cafe/lotes");

  const params = await searchParams;
  const lote = z.uuid().safeParse(uno(params.lote));
  const clienteParam = z.uuid().safeParse(uno(params.cliente));

  const clientes = agruparPorCliente(await getLotesEntregables());
  const loteInicial = lote.success ? lote.data : null;
  const clienteDelLote = loteInicial ? (clientes.find((c) => c.lotes.some((l) => l.id === loteInicial))?.terceroId ?? null) : null;
  const clienteInicial = clienteDelLote ?? (clienteParam.success && clientes.some((c) => c.terceroId === clienteParam.data) ? clienteParam.data : null);

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <Link href="/dashboard/cafe/planta" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Planta
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-gray-800">Entregar</h1>
        <p className="text-sm text-gray-500">Entrega uno o varios lotes listos de un cliente en una sola remisión.</p>
      </div>
      <EntregarForm
        clientes={clientes}
        clienteInicial={clienteInicial}
        loteInicial={clienteDelLote ? loteInicial : null}
        fechaHoy={fechaHoyEnZona(tenant.zonaHoraria)}
      />
    </div>
  );
}
