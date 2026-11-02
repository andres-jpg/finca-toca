import { expect, test, usarRol } from "../fixtures/test";
import { crearCompra, sufijo, tostarYEmpacar } from "../helpers/api";
import { abrirFichaDeLote, aviso } from "../helpers/ui";

// QA FIN-140 · escenario 4 «Corrección»: el admin corrige el peso de entrada de una tostión con un motivo; se recalculan
// merma, valor y costo por libra y queda la traza. El operativo no ve «Editar».

// Se usa «Consumo»: un lote cuyos productos ya se vendieron NO es editable (`lote_con_ventas`) y los demás escenarios venden
// «Excelso 500 g», así que con Excelso este escenario dependería del orden de ejecución.
const LOTE_DE_PARTIDA = async () => {
  const lote = await crearCompra({ tipo: "Consumo", bultos: 2, pesoKg: 125 });
  await tostarYEmpacar(lote, 125, [{ presentacion_g: 500, unidades: 60 }]);
  return lote;
};

test.describe("admin", () => {
  test.use(usarRol("cafeAdmin"));

  test("corrige el peso de entrada de una tostión con motivo: recalcula y deja la traza @tablet", async ({ page }) => {
    const motivo = `Pesaje mal digitado ${sufijo()}`;
    const lote = await LOTE_DE_PARTIDA();
    await abrirFichaDeLote(page, lote.codigo);

    const costo = page.getByRole("region", { name: "Cuánto nos cuesta producir una libra (500 g)" });
    const costoAntes = await costo.getByText("Costo", { exact: true }).locator("xpath=following-sibling::dd").innerText();

    await page.getByRole("button", { name: "Editar" }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toContainText(`Editar el lote ${lote.codigo}`);
    // Sin motivo no se puede ver el impacto.
    await dialogo.getByLabel("Bache 1 · entrada (kg)").fill("13,25");
    await expect(dialogo.getByRole("button", { name: "Ver impacto" })).toBeDisabled();
    await dialogo.getByLabel("Motivo de la corrección (obligatorio)").fill(motivo);
    await dialogo.getByRole("button", { name: "Ver impacto" }).click();
    await expect(dialogo.getByText("Se recalcularán:")).toBeVisible();
    await dialogo.getByRole("button", { name: "Confirmar y guardar" }).click();
    await expect(aviso(page, `Lote ${lote.codigo} corregido`)).toBeVisible();

    // Recalculado: el costo por libra cambia (la merma de la tostión ya no es la misma).
    await expect(async () => {
      const despues = await costo.getByText("Costo", { exact: true }).locator("xpath=following-sibling::dd").innerText();
      expect(despues).not.toBe(costoAntes);
    }).toPass();

    // La traza: el historial de cambios del lote conserva la corrección.
    const historial = page.getByRole("region", { name: "Historial de cambios" });
    await expect(historial).toBeVisible();
    await expect(page.getByText(motivo).first()).toBeVisible();
  });
});

test.describe("operativo", () => {
  test.use(usarRol("cafeOperativo"));

  test("no ve «Editar» en la ficha del lote", async ({ page }) => {
    const lote = await LOTE_DE_PARTIDA();
    await abrirFichaDeLote(page, lote.codigo);
    await expect(page.getByRole("heading", { level: 1 }).first()).toContainText(lote.codigo);
    await expect(page.getByRole("button", { name: "Editar" })).toHaveCount(0);
  });
});
