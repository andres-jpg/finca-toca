import type { Page } from "@playwright/test";
import { expect, test, usarRol, type RecogidaDeErrores } from "../fixtures/test";
import { irA, NAVEGACION_LENTA, seguirEnlace } from "../helpers/ui";

// Regresión de humo de los verticales que ya existían (ganadería y cooperativa): el vertical de café comparte núcleo,
// sesión, módulos y RLS con ellos, y un cambio ahí no debe romperlos sin que nadie se entere. Un test por rol que solo
// navega por sus pantallas y comprueba que cada una carga (título visible) sin errores de consola ni excepciones.
// Usan los usuarios de `supabase/seed.sql`; no crean datos.

/** Visita una pantalla, espera un texto propio de ella dentro de `main` y verifica que la consola sigue limpia. */
async function visitar(page: Page, errores: RecogidaDeErrores, ruta: string, texto: string | RegExp): Promise<void> {
  await irA(page, ruta);
  await expect(page, `${ruta} no redirige a otra parte`).toHaveURL(new RegExp(`${ruta.replace(/\//g, "\\/")}(\\?.*)?$`));
  await expect(page.getByRole("main").getByText(texto).first(), `${ruta} muestra «${texto}»`).toBeVisible();
  // Deja pasar las peticiones de después de hidratar (gráficos, datos de cliente) antes de mirar la consola.
  await page.waitForLoadState("networkidle").catch(() => undefined);
  expect(errores.lista, `errores de consola en ${ruta}`).toEqual([]);
}

test.describe("Villa Blanca (ganadería) · admin", () => {
  test.use(usarRol("villaBlancaAdmin"));

  test("dashboard, extracciones, animales y arriendos cargan sin errores de consola", async ({ page, errores }) => {
    // El dashboard principal, con sus tarjetas y gráficos; el menú trae Arriendos, módulo exclusivo de Villa Blanca.
    await visitar(page, errores, "/dashboard", "Dashboard");
    await expect(page.getByRole("navigation").getByRole("link", { name: "Arriendos" })).toBeVisible();
    await visitar(page, errores, "/dashboard/extracciones", "Extracciones de Leche");
    await visitar(page, errores, "/dashboard/animales", "Animales");
    await visitar(page, errores, "/dashboard/arriendos", "Arriendos");

    // La ficha de un animal (eventos, genealogía, alertas) desde el listado.
    await irA(page, "/dashboard/animales");
    await seguirEnlace(page, page.getByRole("link", { name: "Luna" }).first());
    await expect(page).toHaveURL(/\/dashboard\/animales\/[0-9a-f-]{36}$/, { timeout: NAVEGACION_LENTA });
    await expect(page.getByRole("heading", { level: 1, name: "Luna" })).toBeVisible();
    await page.waitForLoadState("networkidle").catch(() => undefined);
    expect(errores.lista, "errores de consola en la ficha del animal").toEqual([]);
  });
});

test.describe("Toca Lácteos (cooperativa) · admin", () => {
  test.use(usarRol("coopAdmin"));

  test("cooperativa, recolecciones e informe Excel cargan sin errores de consola", async ({ page, errores }) => {
    await visitar(page, errores, "/dashboard/cooperativa", "Litros recolectados");
    await visitar(page, errores, "/dashboard/recolecciones", "Recolecciones");
    await visitar(page, errores, "/dashboard/informes-cooperativa", "Informes");

    // El informe Excel se genera y baja (la quincena del mes en curso, finca por defecto).
    const [descarga] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Descargar informe Excel" }).click(),
    ]);
    expect(descarga.suggestedFilename()).toMatch(/^informe_Q1_.*\.xlsx$/);
    expect(errores.lista, "errores de consola al descargar el informe").toEqual([]);
  });
});

test.describe("Toca Lácteos (cooperativa) · conductor", () => {
  test.use(usarRol("coopConductor"));

  test("la vista del itinerario asignado carga sin errores de consola", async ({ page, errores }) => {
    await irA(page, "/dashboard/recolecciones");
    // Es la vista móvil offline-first (RutaConductorView): muestra el itinerario asignado, no el listado del admin.
    await expect(page.getByRole("main").getByText("Itinerario 1 (demo)")).toBeVisible();
    await expect(page.getByText("Sin itinerario asignado")).toHaveCount(0);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    expect(errores.lista, "errores de consola en la vista del conductor").toEqual([]);
  });
});
