import type { Page } from "@playwright/test";
import { expect, test, usarRol } from "../fixtures/test";
import { crearCompra, stockDe, sufijo, tostarYEmpacar } from "../helpers/api";
import { elegirProductoDeVenta, esperarHidratacion, irA } from "../helpers/ui";

test.use(usarRol("cafeAdmin"));

// Escenario 6 (HU-F1-07): una cortesía descuenta café del inventario pero NO suma al ingreso del día. Se mide en el panel
// de gerencia (tarjeta «Ingreso marca propia»): la cifra en pesos no cambia y el contador de unidades de cortesía sube.

/** Lo que dice la tarjeta «Ingreso marca propia» del panel de hoy: la cifra en pesos y las unidades de cortesía. */
async function leerIngresoMarcaPropia(page: Page): Promise<{ total: string; cortesias: number }> {
  await irA(page, "/dashboard/cafe");
  const tarjeta = page.locator("section").filter({ has: page.getByRole("heading", { name: "Ingreso marca propia" }) });
  await expect(tarjeta).toContainText("Cortesías:");
  const total = (await tarjeta.locator("p").first().innerText()).trim();
  const unidades = (await tarjeta.innerText()).match(/Cortesías:\s*([\d.]+)\s*unidad/);
  expect(unidades, "la tarjeta cuenta las unidades de cortesía").toBeTruthy();
  return { total, cortesias: Number(unidades![1].replace(/\./g, "")) };
}

test("cortesía: no cambia el ingreso del panel y sí baja el stock", async ({ page }) => {
  const nota = `Cortesía de feria ${sufijo()}`;
  // Hay café empacado de sobra: 30 × 500 g.
  const lote = await crearCompra({ bultos: 2, pesoKg: 125 });
  await tostarYEmpacar(lote, 125, [{ presentacion_g: 500, unidades: 30 }]);
  const stockAntes = await stockDe("Excelso 500 g");
  const panelAntes = await leerIngresoMarcaPropia(page);

  // --- Cortesía de 5 bolsas a un cliente ------------------------------------------------------------------------------------------
  await irA(page, "/dashboard/cafe/ventas/nueva");
  await page.getByRole("radio", { name: "Cortesía" }).click();
  await expect(page.getByText("no suma al ingreso del día")).toBeVisible();
  await elegirProductoDeVenta(page, "Excelso 500 g");
  await page.getByLabel("Cantidad", { exact: true }).fill("5");
  await page.getByLabel("Observaciones (opcional)").fill(nota);
  // Una cortesía no tiene precio ni pide factura.
  await expect(page.getByLabel("Precio unitario ($)")).toBeDisabled();
  await expect(page.getByLabel("¿Requiere factura electrónica?")).toHaveCount(0);
  await page.getByRole("button", { name: "Registrar cortesía" }).click();
  await expect(page).toHaveURL(/\/dashboard\/cafe\/ventas\/[0-9a-f-]{36}$/);
  await esperarHidratacion(page);

  const detalle = page.getByRole("heading", { level: 1 });
  await expect(detalle).toContainText("Cortesía");
  await expect(page.getByText("Sin valor").first()).toBeVisible();
  await expect(page.getByText(nota)).toBeVisible();

  // El stock baja 5 y el panel no suma ni un peso.
  expect(await stockDe("Excelso 500 g")).toBe(stockAntes - 5);
  const panelDespues = await leerIngresoMarcaPropia(page);
  expect(panelDespues.total).toBe(panelAntes.total);
  expect(panelDespues.cortesias).toBe(panelAntes.cortesias + 5);
});
