import { expect, test, usarRol } from "../fixtures/test";
import {
  abrirFichaDeLote,
  abrirPlanta,
  aviso,
  elegirTueste,
  irA,
  registrarPaso,
  textoDelAviso,
  NAVEGACION_LENTA,
} from "../helpers/ui";

test.use(usarRol("cafeAdmin"));

// Escenario 2 (HU-F1-02, 03, 04, 13): el ejemplo del informe de Cofradía. Un cliente trae 500 kg de pergamino con la
// humedad alta (el sistema avisa y deja guardar) y contrata trilla + tostión + molienda. Trilla 500 → 405, tostión con
// los 30 baches sugeridos, molienda, empaque (incluido en la maquila), remisión de entrega impresa con copia y lote
// «Entregado». Todo por la interfaz.

test("servicio trilla + maquila: recepción con aviso de humedad, planta completa, remisión con copia @tablet", async ({
  page,
  context,
}) => {
  // --- 1. Recepción: 500 kg, humedad 13 % (rango 10–12 %) ---------------------------------------------------
  await irA(page, "/dashboard/cafe/recibir?tipo=servicios");
  await page.getByText("Selecciona o crea el cliente").click();
  await page.getByRole("option", { name: /Cliente E2E/ }).click();
  await page.getByLabel("Peso recibido (kg)").fill("500");
  await page.getByLabel("Humedad (%)").fill("13");
  await expect(page.getByRole("status").filter({ hasText: "Humedad 13 % fuera del rango 10–12 %" })).toContainText(
    "Puedes guardar igualmente",
  );
  await page.getByLabel("Densidad").fill("680");
  // Los servicios son botones de alternancia (A-08): tostión habilita la molienda y trae el empaque incluido.
  for (const servicio of ["Trilla", "Tostión", "Molienda"]) {
    await page.getByRole("button", { name: servicio, exact: true }).click();
    await expect(page.getByRole("button", { name: servicio, exact: true })).toHaveAttribute("aria-pressed", "true");
  }
  await elegirTueste(page, "Medio");
  await page.getByRole("button", { name: "Guardar y enviar a planta" }).click();

  const codigo = (await textoDelAviso(page, /Recepción registrada: MQ-/)).match(/MQ-\d{4}-\d+/)?.[0];
  expect(codigo, "el aviso trae el código del lote MQ").toBeTruthy();
  // La alerta de calidad avisa, pero el lote se guardó.
  await expect(aviso(page, /Alertas de calidad: Humedad alta/)).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\/cafe\/lotes$/, { timeout: NAVEGACION_LENTA });

  // --- 2. Trilla: 500 → 405 kg (merma 19 %, la de referencia) -------------------------------------------------------
  await abrirPlanta(page, codigo!);
  await expect(page.getByText("Calidad al recibir: Humedad alta")).toBeVisible();
  await expect(page.getByLabel("Entrada: pergamino del lote (kg)")).toHaveValue("500");
  await page.getByLabel("Peso final (kg)").fill("405");
  const merma = page.getByRole("region", { name: "Merma" });
  await expect(merma).toContainText(/19(,0)? %/);
  await expect(merma).toContainText("Referencia 19 % ± 2 puntos");
  await expect(merma).toContainText("Tarifa vigente"); // trilla: $1.400/kg, se cobra en servicios
  await expect(merma).not.toContainText("Revisa el pesaje"); // en la referencia: sin aviso de desvío
  await registrarPaso(page, "Registrar trilla");

  // --- 3. Tostión: entrada 405 kg → 30 baches sugeridos -----------------------------------------------------------------
  await abrirPlanta(page, codigo!);
  await expect(page.getByLabel("Kilos a tostar ahora")).toHaveValue("405");
  await expect(page.getByRole("heading", { name: "Baches (30)" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Cuadra con los kilos a tostar" })).toBeVisible();
  // B-06: la molienda llega precargada desde la recepción (Todo) y se puede cambiar al cerrar la tostión.
  await expect(page.getByRole("radio", { name: "Todo" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radio", { name: "Otra cantidad (kg)" }).click();
  await page.getByLabel("Kilos a moler (kg)").fill("330");
  await registrarPaso(page, "Registrar tostión → Por moler");

  // --- 4. Molienda (confirmación sin pesos) y empaque (incluido, sin coste) ---------------------------------------------
  await abrirPlanta(page, codigo!);
  await page.getByRole("radio", { name: /^Molienda/ }).click();
  await registrarPaso(page, "Molienda realizada → Por empacar");

  await abrirPlanta(page, codigo!);
  await page.getByRole("radio", { name: /^Empaque/ }).click();
  // Bolsas del cliente (peso libre): 132 × 2,5 kg = 330 kg; el peso total en báscula (332 kg) incluye el sobrante de 2 kg.
  await page.getByRole("radio", { name: "Otro (kg)" }).click();
  await page.getByLabel("Peso por bolsa en kilos").fill("2,5");
  await page.getByLabel("Número de bolsas").fill("132");
  await page.getByLabel("Peso total en báscula (kg)").fill("332");
  await page.getByRole("button", { name: "Registrar empaque" }).click();
  // Era el último servicio. (Aparece el diálogo «Lote listo · ¿Entregar ahora?»; se prueba en entrega.spec.ts, aquí se sigue por la ficha.)
  await expect(aviso(page, /Empaque registrado\. Lote listo para entrega/)).toBeVisible();

  // El lote queda listo para entregar.
  await irA(page, `/dashboard/cafe/lotes?q=${codigo}`);
  await expect(page.getByRole("row").filter({ hasText: codigo! })).toContainText("Listo");

  // --- 5. Remisión de entrega ---------------------------------------------------------------------------------------------
  await abrirFichaDeLote(page, codigo!);
  await page.getByRole("link", { name: "Entregar" }).click();
  await page.getByLabel("Nombre de quien recibe").fill("Juan Pérez");
  await page.getByLabel("Cédula").fill("1020304050");
  await page.getByRole("button", { name: "Entregar e imprimir remisión" }).click();
  const numeroRemision = (await textoDelAviso(page, /Remisión REM-.* generada/)).match(/REM-\d{4}-\d+/)?.[0];
  expect(numeroRemision, "el aviso trae el número de la remisión").toBeTruthy();
  await abrirFichaDeLote(page, codigo!);

  const seccion = page.getByRole("region", { name: "Remisión de entrega" });
  await expect(seccion).toContainText(numeroRemision!);
  await expect(seccion).toContainText("Entregada");

  // --- 6. Imprimir con copia: el tiquete trae dos hojas (original y COPIA CLIENTE) ----------------------------------------
  const [impresion] = await Promise.all([
    context.waitForEvent("page"),
    seccion.getByRole("link", { name: "Imprimir con copia" }).click(),
  ]);
  await impresion.waitForLoadState("domcontentloaded");
  await expect(impresion).toHaveURL(/\/print\/remision\/[0-9a-f-]{36}\?copias=2$/, { timeout: NAVEGACION_LENTA });
  await expect(impresion.locator(".ticket")).toHaveCount(2);
  await expect(impresion.getByText("COPIA CLIENTE")).toHaveCount(1);
  for (const ticket of await impresion.locator(".ticket").all()) {
    await expect(ticket).toContainText(numeroRemision!);
    await expect(ticket).toContainText(codigo!);
    await expect(ticket).toContainText("Cliente E2E");
    await expect(ticket).toContainText("Peso entregado");
    // B-17: sin merma total, sin merma de molienda/empaque, sin bultos ni «Perfil pedido».
    await expect(ticket).not.toContainText(/merma total|merma de molienda|merma de empaque|bulto|perfil pedido/i);
    await expect(ticket).toContainText("Merma de tostión");
  }
  // B-17: «Volver a Planta» se ve sin desplazarse, no sale en el papel y lleva a Planta.
  const volver = impresion.getByRole("link", { name: "Volver a Planta" });
  await expect(volver).toBeVisible();
  await expect(impresion.locator(".no-print").filter({ has: volver })).toHaveCount(1);
  await expect(impresion.getByRole("button", { name: "Imprimir con copia" })).toBeVisible();
  await impresion.close();

  // --- 7. El lote queda «Entregado» ---------------------------------------------------------------------------------------------
  await irA(page, `/dashboard/cafe/lotes?q=${codigo}`);
  await expect(page.getByRole("row").filter({ hasText: codigo! })).toContainText("Entregado");
});
