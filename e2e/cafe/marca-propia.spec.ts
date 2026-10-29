import { expect, test, usarRol } from "../fixtures/test";
import { stockDe, sufijo } from "../helpers/api";
import {
  abrirPlanta,
  aviso,
  elegirProductoDeVenta,
  elegirTueste,
  esperarHidratacion,
  irA,
  llenarSalidaDeBaches,
  NAVEGACION_LENTA,
  numeroDelCampo,
  registrarPaso,
  seguirEnlace,
  textoDelAviso,
} from "../helpers/ui";

test.use(usarRol("cafeAdmin"));

// Escenario 1 (HU-F1-01, 04, 05, 06 y 07): el ciclo completo de marca propia. Compra de 6 bultos de Excelso (375 kg),
// tostión en dos tandas (2 bultos y luego los 4 restantes), empaque en 500 g y 2.500 g, venta al consumidor final con
// la factura pendiente y, al final, el número de Aliados. Todo por la interfaz; solo se lee el stock por la API para
// medir las diferencias con exactitud (la base de los tests es compartida, así que nunca se comparan valores absolutos).

test("marca propia completa: compra, tostión parcial, empaque, venta y factura @tablet", async ({ page }) => {
  const factura = `FE-${sufijo()}`;

  // --- 1. Compra: 6 bultos × 62,5 kg = 375 kg a $18.500/kg ----------------------------------------------------------
  await irA(page, "/dashboard/cafe/lotes/nueva-compra");
  await page.getByRole("combobox", { name: "Tipo de café" }).click();
  await page.getByRole("option", { name: "Excelso" }).click();
  // El selector de terceros no expone nombre accesible: se abre por su texto.
  await page.getByText("Selecciona un proveedor").click();
  await page.getByRole("option", { name: /Proveedor E2E SAS/ }).click();
  await page.getByLabel("Número de bultos").fill("6");
  await page.getByLabel("Precio por kilo ($)").fill("18500");
  await expect(page.getByText("Total: 375 kg (6 × 62,5 kg)")).toBeVisible();
  // El valor total se calcula en vivo: 375 × 18.500.
  await expect(page.getByText("$6.937.500")).toBeVisible();
  await page.getByRole("button", { name: "Registrar compra" }).click();

  const textoCompra = await textoDelAviso(page, /Compra registrada: MP-/);
  const codigo = textoCompra.match(/MP-\d{4}-\d+/)?.[0];
  expect(codigo, "el aviso trae el código del lote MP").toBeTruthy();
  await expect(page).toHaveURL(/\/dashboard\/cafe\/lotes$/);

  // --- 2. Primera tostión: 2 de los 6 bultos ------------------------------------------------------------------------
  await abrirPlanta(page, codigo!);
  const entrada = page.getByLabel("Peso de entrada (kg)");
  await expect(entrada).toHaveValue("375");
  await page.getByRole("button", { name: "Quitar todos" }).click();
  await page.getByRole("checkbox", { name: /^Bulto 1 ·/ }).check();
  await page.getByRole("checkbox", { name: /^Bulto 2 ·/ }).check();
  await expect(entrada).toHaveValue("125");
  await page.getByRole("button", { name: "Sugerir baches" }).click();
  await expect(page.getByRole("heading", { name: "Baches (10)" })).toBeVisible();
  await llenarSalidaDeBaches(page, 18);
  await elegirTueste(page, "Medio");
  await expect(page.getByRole("status").filter({ hasText: "Cuadra con la entrada" })).toBeVisible();
  await page.getByRole("button", { name: "Registrar tostión" }).click();
  await expect(aviso(page, /Lote parcial: 2 de 6 bultos/)).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\/cafe\/planta$/, { timeout: NAVEGACION_LENTA });

  // El lote queda «parcial» con 2/6 y con 4 bultos pendientes en la cola de marca propia.
  await page.getByRole("tab", { name: /Marca propia/ }).click();
  await page.getByRole("searchbox", { name: "Buscar por código" }).fill(codigo!);
  const tarjeta = page.getByRole("link", { name: new RegExp(codigo!) });
  await expect(tarjeta).toContainText("Parcial");
  await expect(tarjeta).toContainText("4 de 6 bultos pendientes");
  // ...y el listado de lotes lo cuenta como «Tostado 2/6 bultos».
  await irA(page, `/dashboard/cafe/lotes?q=${codigo}`);
  const fila = page.getByRole("row").filter({ hasText: codigo! });
  await expect(fila).toContainText("Parcial");
  await expect(fila).toContainText("Tostado 2/6 bultos");
  await irA(page, "/dashboard/cafe/planta");
  await page.getByRole("tab", { name: /Marca propia/ }).click();
  await page.getByRole("searchbox", { name: "Buscar por código" }).fill(codigo!);

  // --- 3. Segunda tostión: los 4 bultos restantes --------------------------------------------------------------------
  await seguirEnlace(page, page.getByRole("link", { name: new RegExp(codigo!) }));
  await expect(page.getByLabel("Peso de entrada (kg)")).toHaveValue("250");
  await page.getByRole("button", { name: "Sugerir baches" }).click();
  await expect(page.getByRole("heading", { name: "Baches (19)" })).toBeVisible();
  await llenarSalidaDeBaches(page, 18);
  await elegirTueste(page, "Medio");
  await registrarPaso(page, "Registrar tostión");

  // --- 4. Empaque: 200 × 500 g y 80 × 2.500 g ------------------------------------------------------------------------
  const antes = {
    pt500: await stockDe("Excelso 500 g"),
    pt2500: await stockDe("Excelso 2.500 g"),
    bolsa500: await stockDe("Bolsa 500 g"),
    etiqueta500: await stockDe("Etiqueta 500 g"),
    bolsa2500: await stockDe("Bolsa 2.500 g"),
    etiqueta2500: await stockDe("Etiqueta 2.500 g"),
  };

  await page.getByRole("tab", { name: /Marca propia/ }).click();
  await page.getByRole("searchbox", { name: "Buscar por código" }).fill(codigo!);
  await seguirEnlace(page, page.getByRole("link", { name: new RegExp(codigo!) }));
  // Entra todo lo tostado (6 bultos, ~307,5 kg): 200 × 0,5 + 80 × 2,5 = 300 kg.
  await expect.poll(async () => numeroDelCampo(page.getByLabel("Peso de entrada (kg)"))).toBeGreaterThan(300);
  await page.getByLabel("Unidades de 500 g").fill("200");
  await page.getByLabel("Unidades de 2.500 g").fill("80");
  await expect(page.getByText("300,000 kg").first()).toBeVisible();
  await registrarPaso(page, "Registrar empaque");

  // El producto terminado sube y las bolsas y etiquetas bajan, tamaño por tamaño.
  expect(await stockDe("Excelso 500 g")).toBe(antes.pt500 + 200);
  expect(await stockDe("Excelso 2.500 g")).toBe(antes.pt2500 + 80);
  expect(await stockDe("Bolsa 500 g")).toBe(antes.bolsa500 - 200);
  expect(await stockDe("Etiqueta 500 g")).toBe(antes.etiqueta500 - 200);
  expect(await stockDe("Bolsa 2.500 g")).toBe(antes.bolsa2500 - 80);
  expect(await stockDe("Etiqueta 2.500 g")).toBe(antes.etiqueta2500 - 80);

  // La matriz de producto terminado lo muestra.
  await irA(page, "/dashboard/cafe/inventario");
  const filaExcelso = page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Excelso" }) });
  await expect(filaExcelso).toContainText(`${(antes.pt500 + 200).toLocaleString("es-CO")} u`);

  // --- 5. Venta al consumidor final con la factura pendiente ---------------------------------------------------------
  await irA(page, "/dashboard/cafe/ventas/nueva");
  await expect(page.getByRole("combobox").filter({ hasText: "Consumidor final" })).toBeVisible();
  await elegirProductoDeVenta(page, "Excelso 500 g");
  await page.getByLabel("Cantidad", { exact: true }).fill("3");
  await expect(page.getByLabel("Precio unitario ($)")).toHaveValue("29000");
  await page.getByLabel("¿Requiere factura electrónica?").check();
  await page.getByRole("button", { name: "Guardar venta" }).click();
  await expect(page).toHaveURL(/\/dashboard\/cafe\/ventas\/[0-9a-f-]{36}$/);
  await esperarHidratacion(page);

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Venta");
  await expect(page.getByText("Consumidor final").first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "$87.000" }).first()).toBeVisible(); // 3 × $29.000
  await expect(page.getByText("Pendiente", { exact: true })).toBeVisible();
  expect(await stockDe("Excelso 500 g")).toBe(antes.pt500 + 200 - 3);

  // --- 6. Completar el número de la factura de Aliados -----------------------------------------------------------------
  await page.getByLabel("Número de la factura emitida en Aliados").fill(factura);
  await page.getByRole("button", { name: "Guardar número" }).click();
  await expect(aviso(page, "Número de factura guardado")).toBeVisible();
  await expect(page.getByText(factura)).toBeVisible();
  await expect(page.getByText("Pendiente", { exact: true })).toHaveCount(0);
});
