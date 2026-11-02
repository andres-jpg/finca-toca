import { expect, test, usarRol } from "../fixtures/test";
import { irA } from "../helpers/ui";

// Escenario 9 (A-15): el Inventario tiene tres pestañas que nunca se suman entre sí (`?tab=`): marca propia (para vender),
// servicios a terceros (café de clientes en planta) e insumos. Gerencia lo consulta entero, sin acciones de registro.

test.describe("administrador", () => {
  test.use(usarRol("cafeAdmin"));

  test("tres pestañas: marca propia, servicios a terceros e insumos", async ({ page }) => {
    await irA(page, "/dashboard/cafe/inventario");
    const pestanas = page.getByRole("navigation", { name: "Inventario" });
    await expect(pestanas.getByRole("link", { name: "Marca propia · para vender" })).toHaveAttribute("aria-current", "page");
    // Marca propia: la matriz de producto terminado por tipo de café × presentación.
    await expect(page.getByRole("rowheader", { name: "Excelso" })).toBeVisible();

    // Servicios a terceros: aclara que ese café no es de Cofradía.
    await pestanas.getByRole("link", { name: "Servicios a terceros" }).click();
    await expect(page).toHaveURL(/\/dashboard\/cafe\/inventario\?tab=servicios$/);
    await expect(pestanas.getByRole("link", { name: "Servicios a terceros" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText("Café de clientes · no es inventario de Cofradía")).toBeVisible();
    await expect(page.getByRole("rowheader", { name: "Excelso" })).toHaveCount(0);

    // Insumos: bolsas y etiquetas con su stock.
    await pestanas.getByRole("link", { name: "Insumos" }).click();
    await expect(page).toHaveURL(/\/dashboard\/cafe\/inventario\?tab=insumos$/);
    await expect(page.getByText("Bolsa 500 g", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Etiqueta 2.500 g", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Registrar compra de Bolsa 500 g" })).toBeVisible();

    // La ruta antigua de Insumos redirige a la pestaña.
    await page.goto("/dashboard/cafe/insumos");
    await expect(page).toHaveURL(/\/dashboard\/cafe\/inventario\?tab=insumos$/);
  });
});

test.describe("gerencia", () => {
  test.use(usarRol("cafeGerencia"));

  test("consulta las tres pestañas sin botones de registro ni ajuste", async ({ page }) => {
    await irA(page, "/dashboard/cafe/inventario?tab=insumos");
    await expect(page.getByText("Bolsa 500 g", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Registrar compra de Bolsa 500 g" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Ajustar el stock de Bolsa 500 g" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Editar Bolsa 500 g" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Ver kardex de Bolsa 500 g" })).toBeVisible();

    await irA(page, "/dashboard/cafe/inventario?tab=servicios");
    await expect(page.getByText("Café de clientes · no es inventario de Cofradía")).toBeVisible();
    await irA(page, "/dashboard/cafe/inventario");
    await expect(page.getByRole("rowheader", { name: "Excelso" })).toBeVisible();
  });
});
