import { cafeManifest } from "./cafe/manifest";
import { coreManifest } from "./core/manifest";
import { construirNav, type SesionNav } from "./core/registry/nav";
import type { ModuleManifest, NavItemDef } from "./core/registry/types";
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
