"use client";

import { useState } from "react";
import Link from "next/link";
import { Repeat2, ShoppingCart, SlidersHorizontal } from "lucide-react";
import { EntityModal } from "@/components/shared/entity-modal";
import { Button } from "@/components/ui/button";
import { AjustarInventarioForm } from "./ajustar-inventario-form";
import { ConvertirPresentacionForm, type SaldoConvertibleVista } from "../../empaque/components/convertir-presentacion-form";
import type { ProductoTerminado } from "../../empaque/lib/matriz";

type Dialogo = "ajustar" | "convertir" | null;

/**
 * Acciones de la cabecera del Inventario: «Ajustar inventario» (owner/admin, B-15), «Convertir presentación» (quien registra) y
 * «Comprar insumos» (lleva a la pestaña Insumos, donde se registra la compra). Es solo la UI: las acciones y el RLS lo repiten.
 */
export function AccionesInventario({
  productos,
  saldosConvertibles,
  puedeRegistrar,
  puedeAjustar,
  fechaHoy,
}: {
  productos: ProductoTerminado[];
  saldosConvertibles: SaldoConvertibleVista[];
  puedeRegistrar: boolean;
  puedeAjustar: boolean;
  fechaHoy: string;
}) {
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const activos = productos.filter((p) => p.activo);
  const cerrar = () => setDialogo(null);
  if (!puedeRegistrar) return null;

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row">
        {puedeAjustar && (
          <Button variant="outline" onClick={() => setDialogo("ajustar")} className="h-11 w-full sm:w-auto" disabled={activos.length === 0}>
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            Ajustar inventario
          </Button>
        )}
        <Button variant="outline" onClick={() => setDialogo("convertir")} className="h-11 w-full sm:w-auto" disabled={saldosConvertibles.length === 0}>
          <Repeat2 className="mr-2 h-4 w-4" />
          Convertir presentación
        </Button>
        <Button asChild className="h-11 w-full sm:w-auto">
          <Link href="/dashboard/cafe/inventario?tab=insumos">
            <ShoppingCart className="mr-2 h-4 w-4" />
            Comprar insumos
          </Link>
        </Button>
      </div>

      <EntityModal open={dialogo === "ajustar"} onClose={cerrar} title="Ajustar inventario">
        {dialogo === "ajustar" && <AjustarInventarioForm productos={activos.map((p) => ({ articuloId: p.articuloId, nombre: p.nombre, stock: p.stock }))} articuloInicial={null} onSuccess={cerrar} />}
      </EntityModal>
      <EntityModal open={dialogo === "convertir"} onClose={cerrar} title="Convertir presentación">
        {dialogo === "convertir" && <ConvertirPresentacionForm productos={activos} saldos={saldosConvertibles} fechaHoy={fechaHoy} onSuccess={cerrar} />}
      </EntityModal>
    </>
  );
}
