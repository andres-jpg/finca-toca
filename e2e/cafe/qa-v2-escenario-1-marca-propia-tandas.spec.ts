import { expect, test, usarRol } from "../fixtures/test";
import { stockDe } from "../helpers/api";
import {
  abrirFichaDeLote,
  abrirPlanta,
  elegirTueste,
  irA,
  NAVEGACION_LENTA,
  registrarPaso,
  textoDelAviso,
} from "../helpers/ui";

test.use(usarRol("cafeAdmin"));

// QA v2 (FIN-163) · escenario 1 «Marca propia por tandas». Todo por la interfaz; el stock se lee por la API solo para medir
// diferencias exactas (la base es compartida).
//   Compra 320,0 kg de Excelso a $28.500/kg → tostar 64,0 kg → empacar 104 bolsas de 500 g en grano, báscula 52,4 (merma 18,1 %,
//   sobrante 0,4) → tostar 54,0 kg con los baches 3 y 4 en Alto 220 °C y 10,0 kg a molienda → moler → empacar 500 g: 48 grano + 20
//   molido; 2.500 g: 4 grano; báscula 44,3 (sobrante 0,3) → ficha: 202,0 kg por tostar · 0,7 kg sin empacar · merma 18,1 % ·
//   costo de 500 g $18.969 en el ticket ($18.959 con la merma exacta; ver el final).

async function stockODe0(nombre: string): Promise<number> {
  try {
    return await stockDe(nombre);
  } catch {
    return 0; // el producto molido nace al empacar
  }
}

test("v2 · marca propia por tandas: cifras exactas de la ficha @tablet", async ({ page }) => {
  const antes = {
    grano500: await stockDe("Excelso 500 g"),
    molido500: await stockODe0("Excelso 500 g molido"),
    grano2500: await stockDe("Excelso 2.500 g"),
    bolsa500: await stockDe("Bolsa 500 g"),
    bolsa2500: await stockDe("Bolsa 2.500 g"),
  };

  // --- 1. Compra: 320,0 kg a $28.500/kg --------------------------------------------------------------------------------
  await irA(page, "/dashboard/cafe/recibir?tipo=marca-propia");
  await page.getByRole("combobox", { name: "Tipo de café" }).click();
  await page.getByRole("option", { name: "Excelso" }).click();
  await page.getByText("Selecciona un proveedor").click();
  await page.getByRole("option", { name: /Proveedor E2E SAS/ }).click();
  await page.getByLabel("Peso recibido (kg)").fill("320");
  await page.getByLabel("Precio por kilo ($)").fill("28500");
  await expect(page.getByText("$9.120.000")).toBeVisible();
  await page.getByRole("button", { name: "Guardar y enviar a planta" }).click();
  const codigo = (await textoDelAviso(page, /Compra registrada: MP-/)).match(/MP-\d{4}-\d+/)?.[0];
  expect(codigo, "el aviso trae el código del lote").toBeTruthy();
  await expect(page).toHaveURL(/\/dashboard\/cafe\/lotes$/, { timeout: NAVEGACION_LENTA });

  // --- 2. Primera tostión: 64,0 kg, Medio ------------------------------------------------------------------------------
  await abrirPlanta(page, codigo!);
  await page.getByLabel("Kilos a tostar ahora").fill("64");
  await page.getByRole("button", { name: "Repartir baches" }).click();
  await expect(page.getByRole("heading", { name: "Baches (5)" })).toBeVisible();
  await elegirTueste(page, "Medio");
  await expect(page.getByRole("status").filter({ hasText: "Cuadra con los kilos a tostar" })).toBeVisible();
  await registrarPaso(page, /Registrar tostión → Por empacar/);

  // --- 3. Empaque de la tanda 1: 104 bolsas de 500 g en grano, báscula 52,4 (merma 18,1 %, sobrante 0,4) ---------------------------
  await abrirPlanta(page, codigo!);
  await page.getByRole("radio", { name: /^Empaque/ }).click();
  await page.getByLabel("500 g grano, bolsas", { exact: true }).fill("104");
  await page.getByLabel("Peso total en báscula (kg)").fill("52,4");
  await expect(page.getByText("18,1 %").first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Cierre del empaque" })).toContainText(/Sobrante \(kg\)\s*0,4/);
  await registrarPaso(page, "Registrar empaque");

  // --- 4. Segunda tostión: 54,0 kg, baches 3 y 4 en Alto 220 °C, 10,0 kg a molienda ---------------------------------------------
  await abrirPlanta(page, codigo!);
  await page.getByRole("radio", { name: /^Tostión/ }).click();
  const aTostar = page.getByLabel("Kilos a tostar ahora");
  await expect(aTostar).toHaveValue("256");
  await aTostar.fill("54");
  await page.getByRole("button", { name: "Repartir baches" }).click();
  await expect(page.getByRole("heading", { name: "Baches (4)" })).toBeVisible();
  await elegirTueste(page, "Medio");
  await page.getByRole("checkbox", { name: "Seleccionar el bache 3" }).check();
  await page.getByRole("checkbox", { name: "Seleccionar el bache 4" }).check();
  await page.getByLabel("Nivel de tueste (ajuste)").selectOption("alto");
  await page.getByLabel("Temperatura °C").fill("220");
  await page.getByRole("button", { name: "Aplicar a los seleccionados" }).click();
  await expect(page.getByLabel("Bache 3, temperatura en grados (opcional)")).toHaveValue("220");
  await expect(page.getByLabel("Bache 4, temperatura en grados (opcional)")).toHaveValue("220");
  await page.getByRole("radio", { name: "Otra cantidad (kg)" }).click();
  await page.getByLabel("Kilos a moler (kg)").fill("10");
  await registrarPaso(page, /Registrar tostión → Por moler/);

  // --- 5. Molienda: confirmación sin pesos ---------------------------------------------------------------------------------
  await abrirPlanta(page, codigo!);
  await page.getByRole("radio", { name: /^Molienda/ }).click();
  await expect(page.getByText("La molienda no genera merma.")).toBeVisible();
  await registrarPaso(page, "Molienda realizada → Por empacar");

  // --- 6. Empaque de la tanda 2: 500 g 48 grano + 20 molido; 2.500 g 4 grano; báscula 44,3 (sobrante 0,3) -----------------------
  await abrirPlanta(page, codigo!);
  await page.getByRole("radio", { name: /^Empaque/ }).click();
  await page.getByLabel("500 g grano, bolsas", { exact: true }).fill("48");
  await page.getByLabel("500 g molido, bolsas", { exact: true }).fill("20");
  await page.getByLabel("2.500 g grano, bolsas", { exact: true }).fill("4");
  await page.getByLabel("Peso total en báscula (kg)").fill("44,3");
  await expect(page.getByRole("region", { name: "Cierre del empaque" })).toContainText(/Sobrante \(kg\)\s*0,3/);
  await registrarPaso(page, "Registrar empaque");

  // --- 7. Inventario: unidades por presentación y forma, insumos descontados ---------------------------------------------------
  expect(await stockDe("Excelso 500 g")).toBe(antes.grano500 + 104 + 48);
  expect(await stockODe0("Excelso 500 g molido")).toBe(antes.molido500 + 20);
  expect(await stockDe("Excelso 2.500 g")).toBe(antes.grano2500 + 4);
  expect(await stockDe("Bolsa 500 g")).toBe(antes.bolsa500 - 172);
  expect(await stockDe("Bolsa 2.500 g")).toBe(antes.bolsa2500 - 4);

  // --- 8. La ficha ---------------------------------------------------------------------------------------------------------------
  await abrirFichaDeLote(page, codigo!);
  const cifras = page.getByRole("region", { name: "Cifras clave" });
  const cifra = (etiqueta: string) => cifras.locator("div").filter({ has: page.getByText(etiqueta, { exact: true }) }).first();
  await expect(cifra("Por tostar")).toContainText("202,0 kg");
  await expect(cifra("Tostado sin empacar")).toContainText("0,7 kg");
  await expect(cifra("Merma de tostión")).toContainText("18,1 %");
  const costo = page.getByRole("region", { name: "Costo de producir una libra" });
  // El ticket dice $18.969: sale de usar la merma ya redondeada a 18,1 % (la fórmula pura, con 0,181, la cubre costo-libra.test.ts).
  // Con las pesadas reales (118,0 → 96,7 kg) la merma exacta es 18,05 % y el café por libra $17.389: costo $18.959. Así lo calcula
  // la base y es lo correcto (no se redondea antes de multiplicar): la diferencia de $10 es del redondeo del ejemplo del documento.
  const filaCosto = costo.getByRole("row", { name: /^Costo por libra/ });
  await expect(filaCosto).toContainText("$18.959");
  await expect(costo.getByRole("row", { name: /^Café por libra/ })).toContainText("$17.389");
  await expect(costo.getByRole("row", { name: /^Empaque por libra/ })).toContainText("$1.570");
});
