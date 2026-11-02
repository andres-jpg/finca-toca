import { expect, test, usarRol } from "../fixtures/test";
import { crearCompra, stockDe, tostarYEmpacar } from "../helpers/api";
import { aviso, elegirProductoDeVenta, esperarHidratacion, irA, NAVEGACION_LENTA } from "../helpers/ui";

test.use(usarRol("cafeAdmin"));

// Escenario 10 (HU-F1-07, A-16): la venta nueva se arma tocando tarjetas de producto (un toque agrega, otro suma una
// unidad), con el total en vivo y el aviso de stock. Punto de partida por la API (30 × 500 g empacados).

test("venta nueva por tarjetas de producto: toques, total en vivo y descuento de inventario @tablet", async ({ page }) => {
  const lote = await crearCompra({ bultos: 2, pesoKg: 125 });
  await tostarYEmpacar(lote, 125, [{ presentacion_g: 500, unidades: 30 }]);
  const antes = await stockDe("Excelso 500 g");

  await irA(page, "/dashboard/cafe/ventas/nueva");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Ventas marca propia");
  // Por defecto el cliente es el Consumidor final y todavía no hay líneas.
  await expect(page.getByRole("combobox").filter({ hasText: "Consumidor final" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar venta" })).toBeDisabled();

  // Un toque agrega la línea con el precio vigente; dos toques más suman unidades.
  await elegirProductoDeVenta(page, "Excelso 500 g");
  const tarjeta = page.getByRole("button", { name: "Agregar Excelso 500 g", exact: true });
  await tarjeta.click();
  await tarjeta.click();
  await expect(page.getByLabel("Cantidad", { exact: true })).toHaveValue("3");
  await expect(page.getByLabel("Precio unitario ($)")).toHaveValue("29000");
  await expect(page.getByText(/Total\s*\$87\.000\s*·\s*3 unidades/)).toBeVisible();

  // El paso «−» y «+» de la línea.
  await page.getByRole("button", { name: "Una unidad menos" }).click();
  await expect(page.getByLabel("Cantidad", { exact: true })).toHaveValue("2");
  await page.getByRole("button", { name: "Una unidad más" }).click();
  await page.getByRole("button", { name: "Una unidad más" }).click();
  await expect(page.getByLabel("Cantidad", { exact: true })).toHaveValue("4");
  await expect(page.getByText(/Total\s*\$116\.000\s*·\s*4 unidades/)).toBeVisible();

  // Quitar la línea deja el formulario sin productos; se vuelve a agregar y se guarda.
  await page.getByRole("button", { name: "Quitar Excelso 500 g" }).click();
  await expect(page.getByRole("button", { name: "Guardar venta" })).toBeDisabled();
  await elegirProductoDeVenta(page, "Excelso 500 g");
  await page.getByLabel("Cantidad", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Guardar venta" }).click();

  await expect(aviso(page, /Venta VT-/)).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\/cafe\/ventas\/[0-9a-f-]{36}$/, { timeout: NAVEGACION_LENTA });
  await esperarHidratacion(page);
  await expect(page.getByRole("cell", { name: "$87.000" }).first()).toBeVisible();
  expect(await stockDe("Excelso 500 g")).toBe(antes - 3);
});
