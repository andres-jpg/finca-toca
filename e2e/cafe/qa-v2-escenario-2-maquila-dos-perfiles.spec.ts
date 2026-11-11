import { expect, test, usarRol } from "../fixtures/test";
import { abrirFichaDeLote, abrirPlanta, aviso, irA, NAVEGACION_LENTA, registrarPaso, textoDelAviso } from "../helpers/ui";

test.use(usarRol("cafeAdmin"));

// QA v2 (FIN-163) · escenario 2 «Maquila con dos perfiles». Recibir 50,0 kg de pergamino con trilla, tostión (27,0 kg Medio 222 °C
// 17 min + 13,5 kg Alto 228 °C 18 min) y molienda «Mitad» → trilla con humedad y densidad → tostión con baches por perfil →
// confirmar la molienda → empacar en grano y molido con bolsas del cliente → entregar sin paso de pago → remisión sin «merma total»
// → «Volver a Planta». Todo por la interfaz.

test("v2 · maquila con dos perfiles: de la recepción a la remisión @tablet", async ({ page, context }) => {
  // --- 1. Recepción: 50,0 kg, trilla + tostión + molienda, dos perfiles ------------------------------------------------------
  await irA(page, "/dashboard/cafe/recibir?tipo=servicios");
  await page.getByText("Selecciona o crea el cliente").click();
  await page.getByRole("option", { name: /Cliente E2E/ }).click();
  await page.getByLabel("Peso recibido (kg)").fill("50");
  for (const servicio of ["Trilla", "Tostión", "Molienda"]) await page.getByRole("button", { name: servicio, exact: true }).click();

  const panel = page.getByTestId("panel-perfil-tueste");
  await panel.getByRole("radio", { name: "Varios perfiles" }).click();
  await expect(panel.getByTestId("fila-perfil")).toHaveCount(2);
  await page.locator("#rec-p0-nivel").selectOption("medio");
  await page.locator("#rec-p0-temp").fill("222");
  await page.locator("#rec-p0-tiempo").fill("17");
  await page.locator("#rec-p0-kg").fill("27");
  await page.locator("#rec-p1-nivel").selectOption("alto");
  await page.locator("#rec-p1-temp").fill("228");
  await page.locator("#rec-p1-tiempo").fill("18");
  await page.locator("#rec-p1-kg").fill("13.5");
  await page.getByRole("button", { name: "Guardar y enviar a planta" }).click();
  const codigo = (await textoDelAviso(page, /Recepción registrada: MQ-/)).match(/MQ-\d{4}-\d+/)?.[0];
  expect(codigo, "el aviso trae el código del lote MQ").toBeTruthy();
  await expect(page).toHaveURL(/\/dashboard\/cafe\/lotes$/, { timeout: NAVEGACION_LENTA });

  // --- 2. Trilla: 50,0 → 40,5 kg, con humedad y densidad ---------------------------------------------------------------------
  await abrirPlanta(page, codigo!);
  await expect(page.getByLabel("Entrada: pergamino del lote (kg)")).toHaveValue("50");
  await page.getByLabel("Peso final (kg)").fill("40,5");
  await page.getByLabel("Humedad (%)").fill("11,0");
  await page.getByLabel("Densidad (g/L)").fill("720");
  await registrarPaso(page, "Registrar trilla");

  // --- 3. Tostión: baches por perfil (2 de Medio + 1 de Alto) y molienda «Mitad» ----------------------------------------------
  await abrirPlanta(page, codigo!);
  await expect(page.getByLabel("Kilos a tostar ahora")).toHaveValue("40,5");
  await expect(page.getByRole("heading", { name: "Baches (3)" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Perfil" })).toBeVisible();
  await expect(page.getByLabel("Bache 1, temperatura en grados (opcional)")).toHaveValue("222");
  await expect(page.getByLabel("Bache 2, temperatura en grados (opcional)")).toHaveValue("222");
  await expect(page.getByLabel("Bache 3, temperatura en grados (opcional)")).toHaveValue("228");
  await expect(page.getByLabel("Bache 3, tiempo en minutos (opcional)")).toHaveValue("18");
  await page.getByRole("radio", { name: "Mitad" }).click();
  await registrarPaso(page, /Registrar tostión → Por moler/);

  // --- 4. Molienda: se confirma, sin pesos ni merma -----------------------------------------------------------------------------
  await abrirPlanta(page, codigo!);
  await page.getByRole("radio", { name: /^Molienda/ }).click();
  await expect(page.getByText("La molienda no genera merma.")).toBeVisible();
  await registrarPaso(page, "Molienda realizada → Por empacar");

  // --- 5. Empaque con bolsas del cliente, en grano y molido -------------------------------------------------------------------
  await abrirPlanta(page, codigo!);
  await page.getByRole("radio", { name: /^Empaque/ }).click();
  await expect(page.getByText("Entró a tostión en esta tanda")).toBeVisible();
  await expect(page.getByText("16,6 kg").first()).toBeVisible(); // molienda solicitada: la mitad de los 33,2 kg estimados
  const bolsas = page.getByRole("region", { name: "Bolsas del cliente" });
  await bolsas.getByRole("radio", { name: "Otro (kg)" }).click();
  await bolsas.getByLabel("Peso por bolsa en kilos").fill("1");
  await bolsas.getByLabel("Número de bolsas").fill("16");
  await bolsas.getByRole("button", { name: "Agregar bolsas" }).click();
  await bolsas.getByRole("radiogroup", { name: "Peso por bolsa" }).nth(1).getByRole("radio", { name: "Otro (kg)" }).click();
  await bolsas.getByLabel("Peso por bolsa en kilos").nth(1).fill("1");
  await bolsas.getByRole("radiogroup", { name: "Forma" }).nth(1).getByRole("radio", { name: "Molido" }).click();
  await bolsas.getByLabel("Número de bolsas").nth(1).fill("16");
  await page.getByLabel("Peso total en báscula (kg)").fill("33,2");
  const cierre = page.getByRole("region", { name: "Cierre del empaque" });
  await expect(cierre).toContainText(/En bolsas \(kg\)\s*32,0/);
  await expect(cierre).toContainText(/Sobrante \(kg\)\s*1,2/);
  await expect(cierre).toContainText("18,0 %");
  await page.getByRole("button", { name: "Registrar empaque" }).click();
  // Era el último servicio: la planta ofrece «Lote listo · ¿Entregar ahora?».
  await expect(aviso(page, /Empaque registrado\. Lote listo para entrega/)).toBeVisible();

  // --- 6. Entrega: nombre y cédula de quien recibe; sin paso de pago ----------------------------------------------------------
  await irA(page, `/dashboard/cafe/lotes?q=${codigo}`);
  await expect(page.getByRole("row").filter({ hasText: codigo! })).toContainText("Listo");
  await abrirFichaDeLote(page, codigo!);
  await page.getByRole("link", { name: "Entregar" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Entregar" })).toBeVisible();
  await expect(page.getByText(/pago|pagado|por cobrar|cobro/i)).toHaveCount(0);
  await page.getByLabel("Nombre de quien recibe").fill("Juan Pérez");
  await page.getByLabel("Cédula").fill("1020304050");
  await page.getByRole("button", { name: "Entregar e imprimir remisión" }).click();
  const numero = (await textoDelAviso(page, /Remisión REM-.* generada/)).match(/REM-\d{4}-\d+/)?.[0];
  expect(numero, "el aviso trae el número de la remisión").toBeTruthy();

  // --- 7. Remisión: merma de tostión y sin «merma total»; «Volver a Planta» ----------------------------------------------------
  await expect(page).toHaveURL(/\/print\/remision\/[0-9a-f-]{36}\?copias=2$/, { timeout: NAVEGACION_LENTA });
  await expect(page.locator(".ticket")).toHaveCount(2);
  for (const ticket of await page.locator(".ticket").all()) {
    await expect(ticket).toContainText(numero!);
    await expect(ticket).toContainText(codigo!);
    await expect(ticket).toContainText("Merma de tostión");
    await expect(ticket).toContainText("18,0 %");
    await expect(ticket).toContainText("33,2 kg");
    await expect(ticket).not.toContainText(/merma total|merma de molienda|merma de empaque|bulto|perfil pedido/i);
  }
  const volver = page.getByRole("link", { name: "Volver a Planta" });
  await expect(volver).toBeVisible();
  await volver.click();
  await expect(page).toHaveURL(/\/dashboard\/cafe\/planta/, { timeout: NAVEGACION_LENTA });

  // --- 8. El lote queda «Entregado» ------------------------------------------------------------------------------------------
  await irA(page, `/dashboard/cafe/lotes?q=${codigo}`);
  await expect(page.getByRole("row").filter({ hasText: codigo! })).toContainText("Entregado");
  void context;
});
