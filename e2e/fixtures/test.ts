import { test as base, expect, type Page } from "@playwright/test";
import { estadoAutenticacion, type RolE2E } from "./auth";

// `test` de los escenarios: el de Playwright más (a) `usarRol()` para arrancar con la sesión guardada de un rol y
// (b) `errores`, que recoge lo que la página escribe en la consola como error y las excepciones sin capturar
// (el criterio de los tests de humo de la regresión).

/** Ruido conocido que no es un fallo de la app. Cada entrada, con su motivo. */
const IGNORADOS: RegExp[] = [
  // Chromium pide /favicon.ico y /apple-touch-icon si la página no los declara; no es un error de la app.
  /favicon/i,
  // `next dev` + Fast Refresh avisan por consola del estado del compilador.
  /\[Fast Refresh\]/i,
  // `@vercel/analytics` pide /_vercel/insights/script.js, que solo existe en Vercel: fuera de ahí (`next start` local o en CI)
  // da 404. Es del entorno, no de la app.
  /_vercel\/insights/i,
  // Descargas de fuentes/recursos externos bloqueados en un entorno sin red (CI): no dependen de la app.
  /net::ERR_(INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|CONNECTION_REFUSED)/i,
];

export interface RecogidaDeErrores {
  /** Mensajes de consola de nivel `error` y excepciones de página, ya sin el ruido conocido. */
  lista: string[];
}

function recoger(page: Page): RecogidaDeErrores {
  const lista: string[] = [];
  const anotar = (texto: string) => {
    if (!IGNORADOS.some((p) => p.test(texto))) lista.push(texto);
  };
  page.on("console", (m) => {
    if (m.type() === "error") anotar(`console.error: ${m.text()} (${m.location().url})`);
  });
  page.on("pageerror", (e) => anotar(`pageerror: ${e.message}`));
  return { lista };
}

export const test = base.extend<{ errores: RecogidaDeErrores }>({
  // El segundo argumento se llama `entregar` y no `use`: así lo trata como función de Playwright y no como un hook de React.
  errores: async ({ page }, entregar) => {
    await entregar(recoger(page));
  },
});

export { expect };

/** Opciones de `test.use()` para ejecutar un archivo o bloque con la sesión de ese rol. */
export function usarRol(rol: RolE2E): { storageState: string } {
  return { storageState: estadoAutenticacion(rol) };
}
