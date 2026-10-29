import { request as playwrightRequest } from "@playwright/test";
import { expect, test, usarRol } from "../fixtures/test";

// Escenario 7 (HU-F1-11): un cliente de otro vertical no puede entrar al café, ni por pantalla ni por la API de
// exportación. La barrera de página (CafeLayout) y la de la ruta (módulo activo → 403) tienen que sostenerse aunque se
// teclee la URL a mano; sin sesión, 401.

test.describe("Villa Blanca (ganadería)", () => {
  test.use(usarRol("villaBlancaAdmin"));

  test("no abre los lotes de café ni exporta su Excel", async ({ page }) => {
    for (const ruta of ["/dashboard/cafe/lotes", "/dashboard/cafe", "/dashboard/cafe/planta"]) {
      await page.goto(ruta);
      await page.waitForURL((url) => !url.pathname.startsWith("/dashboard/cafe"));
      await expect(page.getByRole("heading", { name: "Lotes" })).toHaveCount(0);
    }
    // El menú de ganadería no trae nada de café.
    await expect(page.getByRole("navigation").getByRole("link", { name: /Planta|Producto terminado|Remisiones/ })).toHaveCount(0);

    const respuesta = await page.request.get("/api/export/cafe-lotes");
    expect(respuesta.status()).toBe(403);
    expect(respuesta.headers()["content-type"] ?? "").not.toContain("spreadsheet");
  });
});

test.describe("Toca Lácteos (cooperativa)", () => {
  test.use(usarRol("coopAdmin"));

  test("tampoco entra al café", async ({ page }) => {
    await page.goto("/dashboard/cafe/lotes");
    await page.waitForURL((url) => !url.pathname.startsWith("/dashboard/cafe"));
    expect((await page.request.get("/api/export/cafe-lotes")).status()).toBe(403);
  });
});

test("sin sesión: la exportación responde 401 y las pantallas piden iniciar sesión", async ({ baseURL }) => {
  const anonimo = await playwrightRequest.newContext({ baseURL });
  expect((await anonimo.get("/api/export/cafe-lotes")).status()).toBe(401);
  const pantalla = await anonimo.get("/dashboard/cafe/lotes", { maxRedirects: 0 });
  expect([307, 308]).toContain(pantalla.status());
  expect(pantalla.headers()["location"]).toContain("/login");
  await anonimo.dispose();
});
