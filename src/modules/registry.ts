import { cafeManifest } from "./cafe/manifest";
import { CONCEPTOS_TARIFA_CAFE, DEFINICIONES_PARAMETROS_CAFE } from "./cafe/parametros";
import { defineExportadores } from "./core/export/registry";
import { coreManifest } from "./core/manifest";
import { construirNav, type SesionNav } from "./core/registry/nav";
import { defineParametros } from "./core/parametros/registry";
import { PARAMETRO_IMPRESORA_ANCHO } from "./core/print/parametros";
import type { ModuleManifest, NavItemDef } from "./core/registry/types";
import { defineConceptosTarifa } from "./core/tarifas/registry";
import { exportadorTerceros } from "./core/terceros/exportador";
import { cooperativaManifest } from "./cooperativa/manifest";
import { ganaderiaManifest } from "./ganaderia/manifest";

/**
 * Registro de módulos: el **único** fichero que conoce todos los manifiestos a la vez (ESLint lo permite
 * con un elemento propio, `registry`, en `eslint.config.mjs`; ningún vertical ni `core` puede importarlo).
 * Una pantalla nueva se registra en el manifiesto de su módulo, no aquí; aquí solo se añade el manifiesto
 * de un vertical nuevo.
 */
export const MANIFIESTOS: readonly ModuleManifest[] = [coreManifest, ganaderiaManifest, cooperativaManifest, cafeManifest];

/**
 * Entradas del menú para la sesión (función pura): las de su vertical y del núcleo cuyo módulo esté
 * activo y cuyo rol cumpla, ordenadas por grupo y `orden`. `pwa` solo lo conoce el navegador, así que el
 * servidor no lo pasa y la barra lateral aplica `ocultoEnPWA()` sobre estas mismas entradas.
 */
export function getNavParaSesion(sesion: SesionNav, opciones: { pwa?: boolean } = {}): NavItemDef[] {
  return construirNav(MANIFIESTOS, sesion, opciones);
}

/**
 * Definiciones de parámetros y conceptos de tarifa de cada módulo, inyectadas al núcleo (que no puede
 * importar los verticales). Se registran al cargar este fichero, así que quien las necesite —la pantalla
 * de configuración y sus Server Actions— debe `import "@/modules/registry"` (o algo de él) en su propio
 * módulo: el registro es estado de módulo y cada bundle del servidor tiene el suyo. Los verticales leen sus
 * propios parámetros pasando la definición a `getParametro(def)`, sin depender de este registro.
 */
defineParametros([PARAMETRO_IMPRESORA_ANCHO, ...DEFINICIONES_PARAMETROS_CAFE]);
defineConceptosTarifa(CONCEPTOS_TARIFA_CAFE);

/**
 * Recursos exportables a Excel (`GET /api/export/<recurso>`): los del núcleo y, cuando existan, los de cada
 * vertical (café añadirá `lotes` en la Fase 1). Mismo contrato que arriba: la ruta hace `import "@/modules/registry"`.
 */
defineExportadores([exportadorTerceros]);
