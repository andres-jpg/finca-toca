import { requireSesion } from "@/modules/core/auth/guards";
import { AlertaStockBajo } from "@/modules/core/inventario/components/alerta-stock-bajo";
import { requireModuloPagina } from "@/modules/core/tenants/tenant.guards";
import { getParametro } from "@/modules/core/parametros/queries/parametros.queries";
import { ProductoTerminadoPanel } from "@/modules/cafe/empaque/components/producto-terminado-panel";
import { getMatrizProductoTerminado } from "@/modules/cafe/empaque/queries/empaque.queries";
import { InsumosPanel } from "@/modules/cafe/insumos/components/insumos-panel";
import { fechaHoyEnZona } from "@/modules/cafe/insumos/lib/insumos";
import { getInsumosEmpaque } from "@/modules/cafe/insumos/queries/insumos.queries";
import { AccionesInventario } from "@/modules/cafe/inventario/components/acciones-inventario";
import { BloquesGranel } from "@/modules/cafe/inventario/components/bloques-granel";
import { InventarioPestanas } from "@/modules/cafe/inventario/components/inventario-pestanas";
import { ResumenProductoTerminado } from "@/modules/cafe/inventario/components/resumen-producto-terminado";
import { TercerosEnPlanta } from "@/modules/cafe/inventario/components/terceros-en-planta";
import { sumarCargaTostado, sumarCargaVerde } from "@/modules/cafe/inventario/lib/ajuste";
import { alcanceVerde, coberturaGlobal, filasProductoTerminado, librasPorTipo, librasPorTipoPresentacion, parsearPestana } from "@/modules/cafe/inventario/lib/inventario";
import { getSaldosCargaInicial } from "@/modules/cafe/inventario/queries/ajustes.queries";
import { getCafeVerde, getTostadoSinEmpacar, getLotesTercerosEnPlanta, getLibrasVendidas30d, getSaldosConvertibles, getValorACosto } from "@/modules/cafe/inventario/queries/inventario.queries";
import { PARAMETROS_CAFE } from "@/modules/cafe/parametros";

/**
 * Inventario en tres pestañas que nunca se suman entre sí (A-15, B-10): Marca propia (tres bloques: café verde por tostar,
 * tostado sin empacar y producto terminado listo para vender, con libras y cobertura en días), Servicios a terceros (café de
 * clientes en planta) e Insumos (bolsas y etiquetas). La pestaña activa va en `?tab=`. Lo ve todo miembro (Gerencia, solo
 * lectura); registra salidas y convierte owner/admin/operativo; ajusta owner/admin. Las acciones repiten módulo y rol y el RLS
 * es la frontera real.
 */
export const metadata = { title: "Inventario" };

export default async function InventarioPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireModuloPagina("cafe.inventario");
  const { rolTenant, tenant } = await requireSesion();
  const tab = parsearPestana((await searchParams).tab);
  const hoy = fechaHoyEnZona(tenant.zonaHoraria);
  const [lotesTerceros, insumos] = await Promise.all([getLotesTercerosEnPlanta(hoy), getInsumosEmpaque()]);
  const bajos = insumos.filter((i) => i.activo && i.bajo_minimo);

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-800">Inventario</h1>
          <p className="mt-0.5 text-sm text-gray-500">Cada pestaña es un inventario distinto: nunca se suman entre sí.</p>
        </div>
        <AccionesDeCabecera puedeRegistrar={rolTenant !== "viewer"} puedeAjustar={rolTenant === "owner" || rolTenant === "admin"} hoy={hoy} />
      </div>
      <InventarioPestanas activa={tab} enPlanta={lotesTerceros.length} bajos={bajos.length} />

      {tab === "marca-propia" && <PestanaMarcaPropia puedeRegistrar={rolTenant !== "viewer"} zonaHoraria={tenant.zonaHoraria} hoy={hoy} />}
      {tab === "servicios" && <PestanaServicios lotes={lotesTerceros} />}
      {tab === "insumos" && <PestanaInsumos insumos={insumos} bajoMinimo={bajos} rolTenant={rolTenant} zonaHoraria={tenant.zonaHoraria} hoy={hoy} />}
    </div>
  );
}

/** «Ajustar inventario», «Convertir presentación» y «Comprar insumos» en la cabecera (los dos primeros necesitan los productos y saldos). */
async function AccionesDeCabecera({ puedeRegistrar, puedeAjustar, hoy }: { puedeRegistrar: boolean; puedeAjustar: boolean; hoy: string }) {
  if (!puedeRegistrar) return null;
  const { productos } = await getMatrizProductoTerminado();
  const saldos = await getSaldosConvertibles(productos.filter((p) => p.activo && p.stock > 0).map((p) => p.articuloId));
  return <AccionesInventario productos={productos} saldosConvertibles={saldos} puedeRegistrar={puedeRegistrar} puedeAjustar={puedeAjustar} fechaHoy={hoy} />;
}

async function PestanaMarcaPropia({ puedeRegistrar, zonaHoraria, hoy }: { puedeRegistrar: boolean; zonaHoraria: string; hoy: string }) {
  const [{ matriz, productos }, verde, tostado, cargaInicial, vendidas, umbralDias, mermaRefPct] = await Promise.all([
    getMatrizProductoTerminado(),
    getCafeVerde(),
    getTostadoSinEmpacar(),
    getSaldosCargaInicial(),
    getLibrasVendidas30d(hoy),
    getParametro(PARAMETROS_CAFE.coberturaMinimaDias),
    getParametro(PARAMETROS_CAFE.mermaReferenciaTostionMedioPct),
  ]);
  // La carga inicial (B-15) de café verde y tostado no tiene lote: se suma aparte a lo que dan los lotes.
  const verdeTotal = sumarCargaVerde(verde, cargaInicial.verde);
  const nombreDeTipo = new Map(matriz.filas.map((f) => [f.tipoCafeId, f.tipoCafe]));
  const lbPorNombre = new Map<string, number>();
  for (const [tipoId, lb] of librasPorTipo(vendidas)) lbPorNombre.set(nombreDeTipo.get(tipoId) ?? tipoId, lb);
  // «Alcanza para» del verde: kg × (1 − merma de referencia, tueste medio) × 2 / libras diarias de ese tipo de café.
  const alcance = Object.fromEntries(verdeTotal.map((v) => [v.tipoCafe, alcanceVerde(v.kg, mermaRefPct, lbPorNombre.get(v.tipoCafe) ?? 0)]));

  const filas = filasProductoTerminado(matriz, librasPorTipoPresentacion(vendidas));
  const global = coberturaGlobal(filas, vendidas.reduce((a, v) => a + v.libras, 0));
  const valor = await getValorACosto(productos, hoy);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-3">
        <BloquesGranel verde={verdeTotal} tostado={sumarCargaTostado(tostado, cargaInicial.tostado)} alcance={alcance} />
        <ResumenProductoTerminado libras={global.libras} cobertura={global.cobertura} umbralDias={umbralDias} valor={valor} />
      </div>
      <ProductoTerminadoPanel filas={filas} productos={productos} puedeRegistrarSalida={puedeRegistrar} zonaHoraria={zonaHoraria} umbralDias={umbralDias} />
    </div>
  );
}

async function PestanaServicios({ lotes }: { lotes: Awaited<ReturnType<typeof getLotesTercerosEnPlanta>> }) {
  const diasSinRecoger = await getParametro(PARAMETROS_CAFE.diasSinRecoger);
  return <TercerosEnPlanta lotes={lotes} diasSinRecoger={diasSinRecoger} />;
}

function PestanaInsumos({ insumos, bajoMinimo, rolTenant, zonaHoraria, hoy }: { insumos: Awaited<ReturnType<typeof getInsumosEmpaque>>; bajoMinimo: Awaited<ReturnType<typeof getInsumosEmpaque>>; rolTenant: string; zonaHoraria: string; hoy: string }) {
  // La alerta cuenta solo lo activo: un insumo desactivado ya no se usa y no debe pedir compra.
  return (
    <div className="space-y-5">
      <AlertaStockBajo articulos={bajoMinimo} />
      <InsumosPanel insumos={insumos} puedeComprar={rolTenant !== "viewer"} puedeAdministrar={rolTenant === "owner" || rolTenant === "admin"} fechaHoy={hoy} zonaHoraria={zonaHoraria} />
    </div>
  );
}
