import { redirect } from "next/navigation";
// El registro inyecta las definiciones de cada vertical al núcleo (ver `actions.ts`).
import "@/modules/registry";
import { requireSesion } from "@/modules/core/auth/guards";
import { requireModuloPagina } from "@/modules/core/tenants/tenant.guards";
import { definicionesParametrosDeModulos } from "@/modules/core/parametros/registry";
import { getParametrosConValor } from "@/modules/core/parametros/queries/parametros.queries";
import { ParametrosForm, type ParametroVista } from "@/modules/core/parametros/components/parametros-form";
import { conceptosTarifaDeModulos } from "@/modules/core/tarifas/registry";
import { getHistorialTarifas, getTarifasVigentes } from "@/modules/core/tarifas/queries/tarifas.queries";
import { formatearPesos, formatearVigencia } from "@/modules/core/tarifas/lib/formato";
import { TarifasPanel, type ConceptoTarifaVista } from "@/modules/core/tarifas/components/tarifas-panel";
import { crearTarifa, eliminarTarifa, guardarParametro } from "./actions";

export default async function TarifasYParametrosPage() {
  // Visible solo con el módulo activo (`core.terceros`: no hay un módulo propio en el catálogo) y para owner/admin.
  await requireModuloPagina("core.terceros");
  const { tenant, rolTenant } = await requireSesion();
  if (rolTenant !== "owner" && rolTenant !== "admin") redirect("/dashboard");

  const conceptos = conceptosTarifaDeModulos(tenant.modulos);
  const defs = definicionesParametrosDeModulos(tenant.modulos);

  const [vigentes, historial, valores] = await Promise.all([
    getTarifasVigentes(),
    getHistorialTarifas(),
    getParametrosConValor(defs),
  ]);

  const vistaConceptos: ConceptoTarifaVista[] = conceptos.map((c) => {
    const vigente = vigentes.find((v) => v.concepto === c.concepto);
    return {
      concepto: c.concepto,
      etiqueta: c.etiqueta,
      ayuda: c.ayuda,
      unidad: c.unidad,
      vigente: vigente
        ? {
            valorLabel: formatearPesos(vigente.valor),
            desdeLabel: formatearVigencia(vigente.vigenteDesde, tenant.zonaHoraria),
          }
        : null,
      historial: historial
        .filter((h) => h.concepto === c.concepto)
        .map((h) => ({
          id: h.id,
          valorLabel: formatearPesos(h.valor),
          desdeLabel: formatearVigencia(h.vigenteDesde, tenant.zonaHoraria),
          programada: h.programada,
          vigente: vigente !== undefined && vigente.vigenteDesde === h.vigenteDesde,
          email: h.email,
          observaciones: h.observaciones,
        })),
    };
  });

  const vistaParametros: ParametroVista[] = defs.map((d) => {
    const v = valores.find((x) => x.clave === d.clave);
    return {
      clave: d.clave,
      etiqueta: d.etiqueta,
      ayuda: d.ayuda,
      grupo: d.grupo,
      tipo: d.tipo,
      unidad: d.unidad,
      valor: v?.valor ?? d.defecto,
      origen: v?.origen ?? "defecto",
    };
  });

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 tracking-tight">Tarifas y parámetros</h1>
        <p className="text-sm text-gray-500 mt-0.5">Valores que cambian sin tocar código: tarifas por proceso y parámetros de operación.</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-800">Tarifas</h2>
        <TarifasPanel conceptos={vistaConceptos} crearTarifa={crearTarifa} eliminarTarifa={eliminarTarifa} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-800">Parámetros</h2>
        <ParametrosForm parametros={vistaParametros} guardarParametro={guardarParametro} />
      </section>
    </div>
  );
}
