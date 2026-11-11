import { expect, test, usarRol } from "../fixtures/test";
import { stockDe, sufijo } from "../helpers/api";
import {
  abrirPlanta,
  aviso,
  elegirProductoDeVenta,
  elegirTueste,
  esperarHidratacion,
  irA,
  NAVEGACION_LENTA,
  registrarPaso,
  seguirEnlace,
  textoDelAviso,
} from "../helpers/ui";

test.use(usarRol("cafeAdmin"));

// Escenario 1 (HU-F1-01, 04, 05, 06 y 07): el ciclo completo de marca propia. Compra de Excelso (320 kg, un solo
// «Peso recibido»), tostión en dos tandas (64,0 y 54,0 kg, sin peso de salida), empaque con báscula en 500 g y 2.500 g, venta al consumidor final con
// la factura pendiente y, al final, el número de Aliados. Todo por la interfaz; solo se lee el stock por la API para
// medir las diferencias con exactitud (la base de los tests es compartida, así que nunca se comparan valores absolutos).

test("marca propia completa: compra, tostión parcial, empaque, venta y factura @tablet", async ({ page }) => {
  const factura = `FE-${sufijo()}`;

  // --- 1. Compra: «Peso recibido (kg)» único, 320 kg a $18.500/kg (B-01: sin bultos) --------------------------------------------
  await irA(page, "/dashboard/cafe/recibir?tipo=marca-propia");
  await page.getByRole("combobox", { name: "Tipo de café" }).click();
  await page.getByRole("option", { name: "Excelso" }).click();
  // El selector de terceros no expone nombre accesible: se abre por su texto.
  await page.getByText("Selecciona un proveedor").click();
  await page.getByRole("option", { name: /Proveedor E2E SAS/ }).click();
  await expect(page.getByLabel(/bulto/i)).toHaveCount(0);
  await page.getByLabel("Peso recibido (kg)").fill("320");
  await page.getByLabel("Precio por kilo ($)").fill("18500");
  // El valor total se calcula en vivo: 320 × 18.500.
  await expect(page.getByText("$5.920.000")).toBeVisible();
  await page.getByRole("button", { name: "Guardar y enviar a planta" }).click();

  const textoCompra = await textoDelAviso(page, /Compra registrada: MP-/);
  const codigo = textoCompra.match(/MP-\d{4}-\d+/)?.[0];
  expect(codigo, "el aviso trae el código del lote MP").toBeTruthy();
  await expect(page).toHaveURL(/\/dashboard\/cafe\/lotes$/, { timeout: NAVEGACION_LENTA });

  // --- 2. Primera tostión: tanda de 64,0 kg (B-05: sin peso de salida; selección múltiple de baches) ---------------------------
  await abrirPlanta(page, codigo!);
  const aTostar = page.getByLabel("Kilos a tostar ahora");
  await expect(aTostar).toHaveValue("320");
  await aTostar.fill("64");
  await page.getByRole("button", { name: "Repartir baches" }).click();
  await expect(page.getByRole("heading", { name: "Baches (5)" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: /Sale|Salida/ })).toHaveCount(0);
  await elegirTueste(page, "Medio");
  // Seleccionar los baches 3 y 4 y aplicar «Alto · 220 °C»: solo cambia esos dos.
  await page.getByRole("checkbox", { name: "Seleccionar el bache 3" }).check();
  await page.getByRole("checkbox", { name: "Seleccionar el bache 4" }).check();
  await expect(page.getByText("2 baches seleccionados")).toBeVisible();
  await page.getByLabel("Nivel de tueste (ajuste)").selectOption("alto");
  await page.getByLabel("Temperatura °C").fill("220");
  await page.getByRole("button", { name: "Aplicar a los seleccionados" }).click();
  await expect(page.getByLabel("Bache 3, temperatura en grados (opcional)")).toHaveValue("220");
  await expect(page.getByLabel("Bache 4, temperatura en grados (opcional)")).toHaveValue("220");
  await expect(page.getByLabel("Bache 1, temperatura en grados (opcional)")).not.toHaveValue("220");
  await expect(page.getByRole("status").filter({ hasText: "Cuadra con los kilos a tostar" })).toBeVisible();
  await page.getByRole("button", { name: /Registrar tostión → Por empacar/ }).first().click();
  await expect(aviso(page, /Tostión registrada/)).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\/cafe\/planta$/, { timeout: NAVEGACION_LENTA });

  // El lote queda «parcial»: 256,0 kg por tostar (de 320,0) y la tanda de 64,0 kg por empacar.
  await page.getByRole("searchbox", { name: "Buscar por código" }).fill(codigo!);
  const tarjeta = page.getByRole("region", { name: "Por tostar" }).getByRole("link", { name: new RegExp(codigo!) });
  await expect(tarjeta).toContainText("Parcial");
  await expect(tarjeta).toContainText("256,0 kg");
  await irA(page, `/dashboard/cafe/lotes?q=${codigo}`);
  const fila = page.getByRole("row").filter({ hasText: codigo! });
  await expect(fila).toContainText("Parcial");
  await expect(fila).toContainText("256,0 kg por tostar · de 320,0 kg");
  await irA(page, "/dashboard/cafe/planta");
  await page.getByRole("searchbox", { name: "Buscar por código" }).fill(codigo!);

  // --- 3. Segunda tostión: tanda de 54,0 kg --------------------------------------------------------------------------------
  await seguirEnlace(page, page.getByRole("region", { name: "Por tostar" }).getByRole("link", { name: new RegExp(codigo!) }));
  await page.getByLabel("Kilos a tostar ahora").fill("54");
  await page.getByRole("button", { name: "Repartir baches" }).click();
  await expect(page.getByRole("heading", { name: "Baches (4)" })).toBeVisible();
  await elegirTueste(page, "Medio");
  await registrarPaso(page, /Registrar tostión → Por empacar/);

  // --- 4. Empaque de la tanda 2: tabla fija, peso total en báscula y merma de tostión de la tanda ----------------------------
  const antes = {
    pt500: await stockDe("Excelso 500 g"),
    pt2500: await stockDe("Excelso 2.500 g"),
    bolsa500: await stockDe("Bolsa 500 g"),
    etiqueta500: await stockDe("Etiqueta 500 g"),
    bolsa2500: await stockDe("Bolsa 2.500 g"),
    etiqueta2500: await stockDe("Etiqueta 2.500 g"),
  };

  await page.getByRole("searchbox", { name: "Buscar por código" }).fill(codigo!);
  await seguirEnlace(page, page.getByRole("region", { name: "Por empacar" }).getByRole("link", { name: new RegExp(codigo!) }));
  // La planta abre el siguiente paso (tostión: aún quedan kilos); se elige el empaque.
  await page.getByRole("radio", { name: /^Empaque/ }).click();
  await expect(page.getByText("Entró a tostión en esta tanda")).toBeVisible();
  // Las cuatro casillas (500 g y 2.500 g × grano y molido) se ven desde el inicio, en cero.
  for (const g of ["500 g", "2.500 g"]) {
    for (const forma of ["grano", "molido"]) await expect(page.getByLabel(`${g} ${forma}, bolsas`, { exact: true })).toBeVisible();
  }
  await page.getByRole("radio", { name: /Tostión del .* 54,0 kg/ }).click();
  await page.getByLabel("500 g grano, bolsas", { exact: true }).fill("60");
  await page.getByLabel("2.500 g grano, bolsas", { exact: true }).fill("4");
  await page.getByLabel("Peso total en báscula (kg)").fill("44,3");
  // 54,0 kg → 44,3 kg: merma de la tanda 18,0 % «En rango»; sobrante 4,3 kg (queda tostado sin empacar).
  await expect(page.getByText("18,0 %").first()).toBeVisible();
  await registrarPaso(page, "Registrar empaque");

  // Inventario › Tostado sin empacar: el sobrante de la tanda (B-09).
  await irA(page, "/dashboard/cafe/inventario");
  const tostado = page.getByRole("region", { name: /Tostado sin empacar/ });
  await expect(tostado).toContainText(codigo!);
  await expect(tostado).toContainText("4,3 kg");

  // El producto terminado sube y las bolsas y etiquetas bajan, tamaño por tamaño.
  expect(await stockDe("Excelso 500 g")).toBe(antes.pt500 + 60);
  expect(await stockDe("Excelso 2.500 g")).toBe(antes.pt2500 + 4);
  expect(await stockDe("Bolsa 500 g")).toBe(antes.bolsa500 - 60);
  expect(await stockDe("Etiqueta 500 g")).toBe(antes.etiqueta500 - 60);
  expect(await stockDe("Bolsa 2.500 g")).toBe(antes.bolsa2500 - 4);
  expect(await stockDe("Etiqueta 2.500 g")).toBe(antes.etiqueta2500 - 4);

  // La matriz de producto terminado lo muestra.
  await irA(page, "/dashboard/cafe/inventario");
  // B-10: una fila por tipo de café y presentación, con las unidades en grano (y molido), las libras y la cobertura.
  const filaExcelso = page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Excelso 500 g", exact: true }) });
  await expect(filaExcelso).toContainText((antes.pt500 + 60).toLocaleString("es-CO"));

  // --- 5. Venta al consumidor final con la factura pendiente ---------------------------------------------------------
  await irA(page, "/dashboard/cafe/ventas/nueva");
  await expect(page.getByRole("combobox").filter({ hasText: "Consumidor final" })).toBeVisible();
  await elegirProductoDeVenta(page, "Excelso 500 g");
  await page.getByLabel("Cantidad", { exact: true }).fill("3");
  await expect(page.getByLabel("Precio unitario ($)")).toHaveValue("29000");
  await page.getByLabel("Requiere factura electrónica").check();
  await page.getByRole("button", { name: "Guardar venta" }).click();
  await expect(page).toHaveURL(/\/dashboard\/cafe\/ventas\/[0-9a-f-]{36}$/, { timeout: NAVEGACION_LENTA });
  await esperarHidratacion(page);

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Venta");
  await expect(page.getByText("Consumidor final").first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "$87.000" }).first()).toBeVisible(); // 3 × $29.000
  await expect(page.getByText("Pendiente", { exact: true })).toBeVisible();
  expect(await stockDe("Excelso 500 g")).toBe(antes.pt500 + 60 - 3);

  // --- 6. Completar el número de la factura de Aliados -----------------------------------------------------------------
  await page.getByLabel("Número de la factura emitida en Aliados").fill(factura);
  await page.getByRole("button", { name: "Guardar número" }).click();
  await expect(aviso(page, "Número de factura guardado")).toBeVisible();
  await expect(page.getByText(factura)).toBeVisible();
  await expect(page.getByText("Pendiente", { exact: true })).toHaveCount(0);
});
