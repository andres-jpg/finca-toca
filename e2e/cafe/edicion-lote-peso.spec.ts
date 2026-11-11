import { expect, test, usarRol } from "../fixtures/test";
import { crearCompra, crearRecepcion, registrarTrilla, sufijo } from "../helpers/api";
import { abrirFichaDeLote, aviso } from "../helpers/ui";

// B-16 (FIN-161) · El administrador corrige el PESO RECIBIDO con motivo y el valor queda guardado tras recargar.
// Antes «Editar» solo tocaba el peso de los procesos: «Recibido», el valor de la compra y los saldos no cambiaban.

test.use(usarRol("cafeAdmin"));

test("corrige el peso recibido de un lote sin procesos: persiste tras recargar y deja la traza", async ({ page }) => {
  const motivo = `Báscula mal calibrada ${sufijo()}`;
  const lote = await crearCompra({ tipo: "Consumo", pesoKg: 125, precioKg: 18500 });
  await abrirFichaDeLote(page, lote.codigo);
  await expect(page.getByText("125,0 kg").first()).toBeVisible();

  await page.getByRole("button", { name: "Editar" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Peso recibido (kg)", { exact: true }).fill("122,5");
  await dialogo.getByLabel("Motivo de la corrección (obligatorio)").fill(motivo);
  await dialogo.getByRole("button", { name: "Ver impacto" }).click();
  await expect(dialogo).toContainText("peso recibido (125,0 kg → 122,5 kg)");
  await expect(dialogo).toContainText("valor de la compra");
  await dialogo.getByRole("button", { name: "Confirmar y guardar" }).click();
  await expect(aviso(page, `Lote ${lote.codigo} corregido`)).toBeVisible();

  // Persistido: se recarga la página entera y el valor sigue ahí (y el valor de la compra se recalculó: 122,5 × $18.500).
  await page.reload();
  await expect(page.getByText("122,5 kg").first()).toBeVisible();
  await expect(page.getByText("$2.266.250", { exact: true })).toBeVisible();
  const historial = page.getByRole("region", { name: "Correcciones al lote" });
  await expect(historial).toContainText("Peso recibido");
  await expect(historial).toContainText(motivo);
});

test("con procesos: un peso que no cuadra se explica en pantalla y, corregido el proceso también, guarda", async ({ page }) => {
  const motivo = `Se pesó de nuevo ${sufijo()}`;
  const lote = await crearRecepcion({ servicios: ["trilla"], pesoKg: 125 });
  await registrarTrilla(lote, 125, 100);
  await abrirFichaDeLote(page, lote.codigo);

  await page.getByRole("button", { name: "Editar" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Motivo de la corrección (obligatorio)").fill(motivo);

  // Solo el peso: la trilla seguiría entrando 125 kg de un lote que ahora pesa menos → la base lo rechaza y se ve el porqué.
  await dialogo.getByLabel("Peso recibido (kg)", { exact: true }).fill("122,5");
  await dialogo.getByRole("button", { name: "Ver impacto" }).click();
  await expect(dialogo.getByRole("alert")).toContainText("Corrige también ese proceso");

  // Con la entrada de la trilla corregida también, se guarda.
  await dialogo.getByLabel("Peso de entrada (kg)").fill("122,5");
  await dialogo.getByRole("button", { name: "Ver impacto" }).click();
  await expect(dialogo).toContainText("peso recibido (125,0 kg → 122,5 kg)");
  await dialogo.getByRole("button", { name: "Confirmar y guardar" }).click();
  await expect(aviso(page, `Lote ${lote.codigo} corregido`)).toBeVisible();

  await page.reload();
  await expect(page.getByText("122,5 kg").first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Correcciones al lote" })).toContainText(motivo);
});
