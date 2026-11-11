import { expect, test, usarRol } from "../fixtures/test";
import { clienteComo, crearCompra, stockDe, sufijo } from "../helpers/api";
import {
  abrirFichaDeLote,
  abrirPlanta,
  aviso,
  elegirProductoDeVenta,
  elegirTueste,
  esperarHidratacion,
  irA,
  registrarPaso,
  NAVEGACION_LENTA,
} from "../helpers/ui";

test.use(usarRol("cafeAdmin"));

// QA FIN-140 · escenario 3 «Marca propia»: compra de 187,5 kg de Excelso a $30.000/kg → se tuestan 125 kg → empaque de 40 × 500 g
// en grano y 8 × 2.500 g molido con el sobrante a granel → el inventario por presentación y forma cuadra → la ficha muestra
// «Dónde está hoy este café» y el costo por libra → venta de 2 unidades con factura electrónica marcada.

/** El producto molido nace al empacar: antes de eso no existe y su stock es 0. */
async function stockODe0(nombre: string): Promise<number> {
  try {
    return await stockDe(nombre);
  } catch {
    return 0;
  }
}

test("marca propia: compra, tostión por tandas, empaque grano y molido, ficha y venta con factura @tablet", async ({ page }) => {
  // Punto de partida por la API: la compra (su pantalla ya la prueba marca-propia.spec).
  const lote = await crearCompra({ pesoKg: 187.5, precioKg: 30000 });

  const antes = {
    pt500: await stockDe("Excelso 500 g"),
    molido2500: await stockODe0("Excelso 2.500 g molido"),
    bolsa500: await stockDe("Bolsa 500 g"),
    bolsa2500: await stockDe("Bolsa 2.500 g"),
  };

  // --- 1. Tostar una tanda de 125 kg (B-05: sin peso de salida) ------------------------------------------------------------------
  await abrirPlanta(page, lote.codigo);
  await page.getByLabel("Kilos a tostar ahora").fill("125");
  await page.getByRole("button", { name: "Repartir baches" }).click();
  await elegirTueste(page, "Medio");
  // B-06: marca propia decide la molienda en la tostión (por defecto «Sin molienda»).
  await expect(page.getByRole("radio", { name: "Sin molienda" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radio", { name: "Otra cantidad (kg)" }).click();
  await page.getByLabel("Kilos a moler (kg)").fill("21");
  await expect(page.getByText("Estimado: 102,5 kg tostados · 21,0 kg a molienda · 81,5 kg en grano.")).toBeVisible();
  await registrarPaso(page, "Registrar tostión → Por moler");

  // --- 1b. Molienda de la tanda: confirmación sin pesos ni merma (B-07) ----------------------------------------------------------
  await abrirPlanta(page, lote.codigo);
  await page.getByRole("radio", { name: /^Molienda/ }).click();
  await expect(page.getByText("La molienda no genera merma.")).toBeVisible();
  await registrarPaso(page, "Molienda realizada → Por empacar");

  // --- 2. Empaque: 40 × 500 g grano + 8 × 2.500 g molido; báscula 102,5 kg; el sobrante queda tostado sin empacar ------------------
  await abrirPlanta(page, lote.codigo);
  await page.getByRole("radio", { name: /^Empaque/ }).click();
  await expect(page.getByText("Entró a tostión en esta tanda")).toBeVisible();
  await page.getByLabel("500 g grano, bolsas", { exact: true }).fill("40");
  await page.getByLabel("2.500 g molido, bolsas", { exact: true }).fill("8");
  await page.getByLabel("Peso total en báscula (kg)").fill("102,5");
  await expect(page.getByText("Molido empacado: 20,0 kg · solicitado 21,0 kg")).toBeVisible(); // aviso, no bloquea
  await registrarPaso(page, "Registrar empaque");

  // --- 3. El inventario cuadra por presentación y forma ---------------------------------------------------------------------------
  expect(await stockDe("Excelso 500 g")).toBe(antes.pt500 + 40);
  expect(await stockODe0("Excelso 2.500 g molido")).toBe(antes.molido2500 + 8);
  expect(await stockDe("Bolsa 500 g")).toBe(antes.bolsa500 - 40);
  expect(await stockDe("Bolsa 2.500 g")).toBe(antes.bolsa2500 - 8);

  // --- 4. La ficha: dónde está el café y cuánto cuesta producir una libra ---------------------------------------------------------
  await abrirFichaDeLote(page, lote.codigo);
  const donde = page.getByRole("region", { name: "Dónde está hoy este café" });
  await expect(donde).toContainText("Café sin procesar"); // 62,5 kg siguen sin tostar
  await expect(donde).toContainText("Tostado sin empacar");
  await expect(donde).toContainText("Empacado · Excelso 500 g");
  await expect(donde).toContainText("40 unidades");
  await expect(donde).toContainText(/Empacado · Excelso 2\.500 g/);
  await expect(donde).toContainText("8 unidades");

  // B-12: la tostión quedó a medias (62,5 kg sin tostar), así que su ficha del recorrido es un enlace a la planta en ese paso.
  const enlaceTostion = page.getByRole("region", { name: "Recorrido" }).getByRole("link", { name: /Tostión/ });
  await expect(enlaceTostion).toContainText("continuar");
  await expect(enlaceTostion).toHaveAttribute("href", new RegExp(`/dashboard/cafe/planta/${lote.id}\\?paso=tostion$`));

  // B-13: costo por libra por presentación (500 g y 2.500 g) con la merma de tostión acumulada del lote.
  const costo = page.getByRole("region", { name: "Costo de producir una libra" });
  await expect(costo).toBeVisible();
  // El café cuesta $30.000/kg: una libra con la merma acumulada (18 %) sale por encima de $18.000 solo en café.
  await expect(costo).toContainText("merma de tostión acumulada del lote: 18,0 %");
  await expect(costo).toContainText(/\$18\.\d{3}/);
  await expect(costo.getByRole("columnheader", { name: "500 g", exact: true })).toBeVisible();
  await expect(costo.getByRole("columnheader", { name: "2.500 g", exact: true })).toBeVisible();
  await expect(costo.getByRole("row", { name: /Costo por libra/ })).toBeVisible();
  await expect(costo).toContainText("Costo directo; los gastos de operación se incorporan con el módulo de gastos.");

  // --- 5. Venta de 2 unidades con factura electrónica marcada -------------------------------------------------------------------------
  await irA(page, "/dashboard/cafe/ventas/nueva");
  await elegirProductoDeVenta(page, "Excelso 500 g");
  await page.getByLabel("Cantidad", { exact: true }).fill("2");
  await page.getByLabel("Requiere factura electrónica").check();
  await page.getByRole("button", { name: "Guardar venta" }).click();
  await expect(page).toHaveURL(/\/dashboard\/cafe\/ventas\/[0-9a-f-]{36}$/, { timeout: NAVEGACION_LENTA });
  await esperarHidratacion(page);
  await expect(page.getByText("Pendiente", { exact: true })).toBeVisible(); // factura marcada, número de Aliados por completar
  expect(await stockDe("Excelso 500 g")).toBe(antes.pt500 + 40 - 2);

  const numero = `FE-${sufijo()}`;
  await page.getByLabel("Número de la factura emitida en Aliados").fill(numero);
  await page.getByRole("button", { name: "Guardar número" }).click();
  await expect(aviso(page, "Número de factura guardado")).toBeVisible();
  void clienteComo;
});
