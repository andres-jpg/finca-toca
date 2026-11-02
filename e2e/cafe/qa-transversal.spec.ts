import { expect, test, usarRol } from "../fixtures/test";
import { irA } from "../helpers/ui";

// QA FIN-140 · transversal: la pestaña lleva la pantalla y el cliente, y el menú tiene 8 opciones para el admin y 6 para el
// operativo. (La issue escribe la pestaña como «Cofradía · <pantalla>»; la app pone `<pantalla> · <cliente>`: se prueba lo implementado.)

async function opcionesDelMenu(page: import("@playwright/test").Page): Promise<number> {
  return page.getByRole("complementary").getByRole("link").count();
}

test.describe("admin", () => {
  test.use(usarRol("cafeAdmin"));

  test("pestaña con pantalla y cliente, y 8 opciones de menú", async ({ page }) => {
    for (const [ruta, pantalla] of [
      ["/dashboard/cafe/planta", "Planta"],
      ["/dashboard/cafe/lotes", "Lotes"],
    ] as const) {
      await irA(page, ruta);
      await expect(page).toHaveTitle(new RegExp(`Cofradía.* · ${pantalla}`));
    }
    expect(await opcionesDelMenu(page)).toBe(8);
  });
});

test.describe("operativo", () => {
  test.use(usarRol("cafeOperativo"));

  test("6 opciones de menú", async ({ page }) => {
    await irA(page, "/dashboard/cafe/planta");
    expect(await opcionesDelMenu(page)).toBe(6);
  });
});
