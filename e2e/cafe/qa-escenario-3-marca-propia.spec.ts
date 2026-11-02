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
  llenarSalidaDeBaches,
  registrarPaso,
  seguirEnlace,
  NAVEGACION_LENTA,
} from "../helpers/ui";

test.use(usarRol("cafeAdmin"));

// QA FIN-140 · escenario 3 «Marca propia»: compra de 3 bultos de Excelso a $30.000/kg → se tuestan 2 → empaque de 40 × 500 g
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

test("marca propia: compra, tostión de 2 bultos, empaque grano y molido, ficha y venta con factura @tablet", async ({ page }) => {
  // Punto de partida por la API: la compra (su pantalla ya la prueba marca-propia.spec).
  const lote = await crearCompra({ bultos: 3, pesoKg: 187.5, precioKg: 30000 });

  const antes = {
    pt500: await stockDe("Excelso 500 g"),
    molido2500: await stockODe0("Excelso 2.500 g molido"),
    bolsa500: await stockDe("Bolsa 500 g"),
    bolsa2500: await stockDe("Bolsa 2.500 g"),
  };

  // --- 1. Tostar 2 de los 3 bultos (125 kg → 102,5 kg) ------------------------------------------------------------------------
  await abrirPlanta(page, lote.codigo);
  await page.getByRole("button", { name: "Quitar todos" }).click();
  await page.getByRole("checkbox", { name: /^Bulto 1 ·/ }).check();
  await page.getByRole("checkbox", { name: /^Bulto 2 ·/ }).check();
  await expect(page.getByLabel("Peso de entrada (kg)")).toHaveValue("125");
  await page.getByRole("button", { name: "Sugerir baches" }).click();
  await llenarSalidaDeBaches(page, 18);
  await elegirTueste(page, "Medio");
  await registrarPaso(page, "Registrar tostión");

  // --- 2. Empaque: 40 × 500 g grano + 8 × 2.500 g molido; el sobrante queda a granel -----------------------------------------------
  await page.getByRole("searchbox", { name: "Buscar por código" }).fill(lote.codigo);
  await seguirEnlace(page, page.getByRole("region", { name: "Por empacar" }).getByRole("link", { name: new RegExp(lote.codigo) }));
  // El 3.er bulto sigue sin tostar, así que el paso preseleccionado es la tostión: se elige el empaque.
  await page.getByRole("radiogroup", { name: "Paso a registrar" }).getByRole("radio", { name: /^Empaque/ }).click();
  await expect(page.getByText(/^102,5 kg$/).first()).toBeVisible();

  await page.getByLabel("Unidades de 500 g grano").fill("40");
  await page.getByRole("radio", { name: "Molido" }).nth(1).click(); // el 2.º tamaño: 2.500 g
  await page.getByLabel("Unidades de 2.500 g molido").fill("8");
  // El molido pasa por la molienda del propio empaque: entran 21 kg y salen 20,4 kg (de ahí salen los 20 kg de las 8 bolsas).
  await page.getByLabel("Entra a moler (kg)").fill("21");
  await page.getByLabel("Sale de la molienda (kg)").fill("20,4");
  await expect(page.getByRole("button", { name: "Registrar empaque" })).toBeDisabled(); // sobra café: falta su destino
  await page.getByRole("radio", { name: "Queda a granel" }).click();
  await registrarPaso(page, "Registrar empaque");

  // --- 3. El inventario cuadra por presentación y forma ---------------------------------------------------------------------------
  expect(await stockDe("Excelso 500 g")).toBe(antes.pt500 + 40);
  expect(await stockODe0("Excelso 2.500 g molido")).toBe(antes.molido2500 + 8);
  expect(await stockDe("Bolsa 500 g")).toBe(antes.bolsa500 - 40);
  expect(await stockDe("Bolsa 2.500 g")).toBe(antes.bolsa2500 - 8);

  // --- 4. La ficha: dónde está el café y cuánto cuesta producir una libra ---------------------------------------------------------
  await abrirFichaDeLote(page, lote.codigo);
  const donde = page.getByRole("region", { name: "Dónde está hoy este café" });
  await expect(donde).toContainText("1 bulto"); // el tercero sigue sin tostar
  await expect(donde).toContainText("Tostado a granel");
  await expect(donde).toContainText("Empacado · Excelso 500 g");
  await expect(donde).toContainText("40 unidades");
  await expect(donde).toContainText(/Empacado · Excelso 2\.500 g/);
  await expect(donde).toContainText("8 unidades");

  const costo = page.getByRole("region", { name: "Cuánto nos cuesta producir una libra (500 g)" });
  await expect(costo).toBeVisible();
  // El café cuesta $30.000/kg: una libra (500 g) con la merma de tostión del lote (18 %) sale por encima de $18.000 solo en café.
  await expect(costo).toContainText("merma de tostión 18,0 %");
  await expect(costo).toContainText(/\$18\.\d{3}/);
  await expect(costo.getByText("Costo", { exact: true })).toBeVisible();

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
