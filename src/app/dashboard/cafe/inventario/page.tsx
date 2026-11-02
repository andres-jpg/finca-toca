import { requireSesion } from "@/modules/core/auth/guards";
import { AlertaStockBajo } from "@/modules/core/inventario/components/alerta-stock-bajo";
import { requireModuloPagina } from "@/modules/core/tenants/tenant.guards";
import { getParametro } from "@/modules/core/parametros/queries/parametros.queries";
import { ProductoTerminadoPanel } from "@/modules/cafe/empaque/components/producto-terminado-panel";
import { getMatrizProductoTerminado } from "@/modules/cafe/empaque/queries/empaque.queries";
import { InsumosPanel } from "@/modules/cafe/insumos/components/insumos-panel";
import { fechaHoyEnZona } from "@/modules/cafe/insumos/lib/insumos";
import { getInsumosEmpaque } from "@/modules/cafe/insumos/queries/insumos.queries";
import { BloquesGranel } from "@/modules/cafe/inventario/components/bloques-granel";
import { InventarioPestanas } from "@/modules/cafe/inventario/components/inventario-pestanas";
import { TercerosEnPlanta } from "@/modules/cafe/inventario/components/terceros-en-planta";
import { parsearPestana } from "@/modules/cafe/inventario/lib/inventario";
import { getCafeVerde, getGranelPorLote, getLotesTercerosEnPlanta, getSaldosConvertibles } from "@/modules/cafe/inventario/queries/inventario.queries";
import { PARAMETROS_CAFE } from "@/modules/cafe/parametros";

/**
 * Inventario en tres pestañas que nunca se suman entre sí (A-15): Marca propia · para vender (café verde, tostado a
 * granel y empacado por calidad × presentación × forma, con salidas y «Convertir presentación»), Servicios a
 * terceros (café de clientes en planta) e Insumos (bolsas y etiquetas). La pestaña activa va en `?tab=`. Lo ve todo
 * miembro (Gerencia, solo lectura); registra salidas y convierte owner/admin/operativo; ajusta owner/admin.
 * Las acciones repiten módulo y rol y el RLS es la frontera real.
 */
export const metadata = { title: "Inventario" };

export default async function InventarioPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireModuloPagina("cafe.inventario");
  const { rolTenant, tenant } = await requireSesion();
  const tab = parsearPestana((await searchParams).tab);
  const hoy = fechaHoyEnZona(tenant.zonaHoraria);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-800">Inventario</h1>
        <p className="mt-0.5 text-sm text-gray-500">Cada pestaña es un inventario distinto: nunca se suman entre sí.</p>
      </div>
      <InventarioPestanas activa={tab} />

      {tab === "marca-propia" && <PestanaMarcaPropia puedeRegistrar={rolTenant !== "viewer"} puedeAjustar={rolTenant === "owner" || rolTenant === "admin"} zonaHoraria={tenant.zonaHoraria} hoy={hoy} />}
      {tab === "servicios" && <PestanaServicios hoy={hoy} />}
      {tab === "insumos" && <PestanaInsumos rolTenant={rolTenant} zonaHoraria={tenant.zonaHoraria} hoy={hoy} />}
    </div>
  );
}

async function PestanaMarcaPropia({ puedeRegistrar, puedeAjustar, zonaHoraria, hoy }: { puedeRegistrar: boolean; puedeAjustar: boolean; zonaHoraria: string; hoy: string }) {
  const [{ matriz, productos }, verde, granel] = await Promise.all([getMatrizProductoTerminado(), getCafeVerde(), getGranelPorLote()]);
  const saldos = puedeRegistrar ? await getSaldosConvertibles(productos.filter((p) => p.activo && p.stock > 0).map((p) => p.articuloId)) : [];
  return (
    <div className="space-y-5">
      <BloquesGranel verde={verde} granel={granel} />
      <ProductoTerminadoPanel
        matriz={matriz}
        productos={productos}
        puedeRegistrarSalida={puedeRegistrar}
        puedeAjustar={puedeAjustar}
        zonaHoraria={zonaHoraria}
        saldosConvertibles={saldos}
        fechaHoy={hoy}
      />
    </div>
  );
}

async function PestanaServicios({ hoy }: { hoy: string }) {
  const [lotes, diasSinRecoger] = await Promise.all([getLotesTercerosEnPlanta(hoy), getParametro(PARAMETROS_CAFE.diasSinRecoger)]);
  return <TercerosEnPlanta lotes={lotes} diasSinRecoger={diasSinRecoger} />;
}

async function PestanaInsumos({ rolTenant, zonaHoraria, hoy }: { rolTenant: string; zonaHoraria: string; hoy: string }) {
  const insumos = await getInsumosEmpaque();
  // La alerta cuenta solo lo activo: un insumo desactivado ya no se usa y no debe pedir compra.
  const bajoMinimo = insumos.filter((i) => i.activo && i.bajo_minimo);
  return (
    <div className="space-y-5">
      <AlertaStockBajo articulos={bajoMinimo} />
      <InsumosPanel insumos={insumos} puedeComprar={rolTenant !== "viewer"} puedeAdministrar={rolTenant === "owner" || rolTenant === "admin"} fechaHoy={hoy} zonaHoraria={zonaHoraria} />
    </div>
  );
}
