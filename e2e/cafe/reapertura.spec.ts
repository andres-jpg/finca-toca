import { expect, test, usarRol } from "../fixtures/test";
import { crearCompra, stockDe, sufijo, tostarYEmpacar } from "../helpers/api";
import { abrirFichaDeLote, aviso, irA, registrarPaso, seguirEnlace } from "../helpers/ui";

test.use(usarRol("cafeAdmin"));

// Escenario 5 (HU-F1-16): reabrir producto ya empacado de marca propia para moler y reempacar sin perder de qué lote
// viene. Punto de partida por la API (un lote MP tostado y empacado en 500 g y 2.500 g); lo que se prueba, por la interfaz:
// reabrir 40 × 500 g (20 kg) → moler → empacar en 2.500 g → la reapertura queda completada y el inventario cuadra.

test("reapertura: 40 × 500 g, molienda y empaque en 2.500 g @tablet", async ({ page }) => {
  const motivo = `Pedido molido ${sufijo()}`;
  const lote = await crearCompra({ bultos: 2, pesoKg: 125 });
  await tostarYEmpacar(lote, 125, [
    { presentacion_g: 500, unidades: 60 }, // 30 kg
    { presentacion_g: 2500, unidades: 20 }, // 50 kg (≤ 102,5 kg tostados)
  ]);
  const antes = {
    pt500: await stockDe("Excelso 500 g"),
    pt2500: await stockDe("Excelso 2.500 g"),
    bolsa2500: await stockDe("Bolsa 2.500 g"),
  };

  // --- 1. Reabrir desde la ficha del lote ---------------------------------------------------------------------------------------
  await abrirFichaDeLote(page, lote.codigo);
  const empacado = page.getByRole("region", { name: "Empacado" });
  await expect(empacado).toContainText("Excelso 500 g");
  await empacado.getByRole("button", { name: "Reabrir" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByRole("button", { name: /^Excelso 500 g/ }).click();
  await dialogo.getByLabel("Unidades a reabrir").fill("40");
  await expect(dialogo).toContainText("Equivale a 20,000 kg");
  await dialogo.getByLabel("Motivo (opcional)").fill(motivo);
  await dialogo.getByRole("button", { name: "Reabrir", exact: true }).click();
  await expect(aviso(page, /Reabiertas 40 × Excelso 500 g \(20 kg\)/)).toBeVisible();

  // El inventario baja y la reapertura queda pendiente en la ficha.
  expect(await stockDe("Excelso 500 g")).toBe(antes.pt500 - 40);
  await expect(empacado.getByRole("list", { name: "Reaperturas del lote" })).toContainText("40 × Excelso 500 g (20 kg)");
  await expect(empacado.getByRole("list", { name: "Reaperturas del lote" })).toContainText("Pendiente");
  await expect(empacado).toContainText(motivo);

  // --- 2. Planta: la reapertura espera en la pestaña de marca propia ---------------------------------------------------------
  await irA(page, "/dashboard/cafe/planta");
  await page.getByRole("tab", { name: /Marca propia/ }).click();
  await page.getByRole("searchbox", { name: "Buscar por código" }).fill(lote.codigo);
  const tarjeta = page.getByRole("link", { name: new RegExp(`Reapertura de ${lote.codigo}`) });
  await expect(tarjeta).toContainText("20 kg");
  await expect(tarjeta).toContainText("Excelso");
  await seguirEnlace(page, tarjeta);

  // --- 3. Moler lo reabierto: 20 kg → 19,8 kg --------------------------------------------------------------------------------------
  await expect(page.getByRole("heading", { name: "Moler lo reabierto" })).toBeVisible();
  await page.getByLabel("Peso de salida (kg)").fill("19,8");
  await expect(page.getByText("Merma 0,200 kg")).toBeVisible();
  await page.getByRole("button", { name: "Registrar molienda" }).click();
  await expect(aviso(page, "Molienda registrada")).toBeVisible();

  // --- 4. Empacar la molienda en 2.500 g: 7 × 2,5 kg = 17,5 kg ---------------------------------------------------------------
  await page.getByRole("tab", { name: /^Empacar/ }).click();
  await expect(page.getByLabel("Peso de entrada (kg)")).toHaveValue("19,8");
  await page.getByLabel("Unidades de 2.500 g").fill("7");
  await registrarPaso(page, "Registrar empaque");

  expect(await stockDe("Excelso 2.500 g")).toBe(antes.pt2500 + 7);
  expect(await stockDe("Bolsa 2.500 g")).toBe(antes.bolsa2500 - 7);
  expect(await stockDe("Excelso 500 g")).toBe(antes.pt500 - 40);

  // --- 5. La ficha conserva el origen: reapertura completada con su molienda y su empaque ---------------------------------------
  await abrirFichaDeLote(page, lote.codigo);
  const reaperturas = page.getByRole("region", { name: "Empacado" }).getByRole("list", { name: "Reaperturas del lote" });
  await expect(reaperturas).toContainText("Completada");
  await expect(reaperturas).toContainText("Molienda");
  await expect(reaperturas).toContainText("7 × Excelso 2.500 g");
});
