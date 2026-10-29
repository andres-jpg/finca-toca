import { expect, type Locator, type Page } from "@playwright/test";

/** Margen para una navegación que puede obligar a `next dev` a compilar una ruta (en producción sobra). */
export const NAVEGACION_LENTA = 60_000;

// Piezas de interfaz que repiten varios escenarios. Todo por rol ARIA, etiqueta o texto visible: nada de clases CSS.

/**
 * Espera a que React haya hidratado la página. En `next dev` la hidratación llega después del HTML, y un formulario
 * al que se le escribe antes puede perder lo escrito o enviarse como un GET normal. React marca con `__reactFiber$`
 * los nodos que ya controla.
 */
export async function esperarHidratacion(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const el = document.querySelector("main button, main input, main a[href], main select, main form");
      return el !== null && Object.keys(el).some((k) => k.startsWith("__reactFiber$"));
    },
    null,
    { timeout: 60_000 },
  );
}

/** Navega y espera a que la página responda hidratada (las rutas se compilan al primer uso en `next dev`). */
export async function irA(page: Page, ruta: string): Promise<void> {
  await page.goto(ruta);
  await esperarHidratacion(page);
}

/** Un aviso (toast de Sonner) que contenga el texto o patrón. */
export function aviso(page: Page, texto: string | RegExp): Locator {
  return page.locator("[data-sonner-toast]").filter({ hasText: texto }).first();
}

/** Espera un aviso y devuelve su texto (p. ej. para leer el código del lote recién creado). */
export async function textoDelAviso(page: Page, texto: string | RegExp): Promise<string> {
  const toast = aviso(page, texto);
  await expect(toast).toBeVisible();
  return (await toast.innerText()).trim();
}

/** Lee un número de un campo de texto con coma decimal (`13,5` → 13.5). */
export async function numeroDelCampo(campo: Locator): Promise<number> {
  return Number((await campo.inputValue()).replace(/\./g, "").replace(",", "."));
}

/** Escribe un número con coma decimal, como lo teclea el operario en la tablet. */
export function conComa(n: number, decimales = 3): string {
  return n.toFixed(decimales).replace(/0+$/, "").replace(/[.,]$/, "").replace(".", ",");
}

/**
 * Rellena la salida de cada bache de la tostión con `entrada × (1 − merma%)`. Los baches deben estar ya sugeridos
 * (botón «Sugerir baches»). Devuelve cuántos había.
 */
export async function llenarSalidaDeBaches(page: Page, mermaPct = 18): Promise<number> {
  const entradas = page.getByLabel(/^Bache \d+, kg de entrada$/);
  const n = await entradas.count();
  expect(n, "debe haber baches sugeridos").toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const entrada = await numeroDelCampo(entradas.nth(i));
    const salida = Math.round(entrada * (100 - mermaPct) * 10) / 1000; // gramos enteros
    await page.getByLabel(`Bache ${i + 1}, kg de salida`, { exact: true }).fill(conComa(salida));
  }
  return n;
}

/**
 * Sigue un enlace cargando su destino (carga completa) en vez de pulsarlo. Un clic sobre un `<Link>` de Next justo después de
 * hidratar a veces se pierde (la navegación del cliente se interrumpe) y el test se queda esperando una página que no llega;
 * navegar al `href` es determinista y prueba lo mismo: que el enlace existe y apunta a donde debe.
 */
export async function seguirEnlace(page: Page, enlace: Locator): Promise<void> {
  const href = await enlace.getAttribute("href");
  expect(href, "el enlace tiene destino").toBeTruthy();
  await irA(page, href!);
}

/** Abre la ficha de un lote por su código (el listado admite `?q=`). */
export async function abrirFichaDeLote(page: Page, codigo: string): Promise<void> {
  await irA(page, `/dashboard/cafe/lotes?q=${encodeURIComponent(codigo)}`);
  await seguirEnlace(page, page.getByRole("link", { name: codigo, exact: true }));
  await expect(page.getByRole("heading", { level: 1 }).first()).toContainText(codigo);
  await esperarHidratacion(page);
}

/** Desde la ficha de un lote, entra al formulario de la planta. */
export async function irAPlantaDesdeFicha(page: Page): Promise<void> {
  await seguirEnlace(page, page.getByRole("link", { name: "Ir a planta" }));
  await expect(page).toHaveURL(/\/dashboard\/cafe\/planta\/[0-9a-f-]{36}$/);
}

/** Abre el formulario de planta de un lote (ficha → «Ir a planta»). */
export async function abrirPlanta(page: Page, codigo: string): Promise<void> {
  await abrirFichaDeLote(page, codigo);
  await irAPlantaDesdeFicha(page);
}

/** Elige el nivel de tueste (radio «Bajo» / «Medio» / «Alto»). */
export async function elegirTueste(page: Page, nivel: "Bajo" | "Medio" | "Alto" = "Medio"): Promise<void> {
  await page.getByRole("radio", { name: nivel, exact: true }).click();
}

/** Pulsa el botón de guardar del paso y espera a volver a la cola de la planta. */
export async function registrarPaso(page: Page, boton: string | RegExp): Promise<void> {
  await page.getByRole("button", { name: boton }).click();
  // Tras guardar, la app navega a la cola de la planta; con `next dev` esa ruta puede tener que recompilarse.
  await expect(page).toHaveURL(/\/dashboard\/cafe\/planta$/, { timeout: NAVEGACION_LENTA });
}

/** En el formulario de venta, elige el producto de la primera fila por su nombre («Excelso 500 g»). */
export async function elegirProductoDeVenta(page: Page, nombre: string): Promise<void> {
  const select = page.getByLabel("Producto", { exact: true }).first();
  const valor = await select.locator("option").filter({ hasText: new RegExp(`^${nombre}`) }).first().getAttribute("value");
  expect(valor, `el producto «${nombre}» está en la lista`).toBeTruthy();
  await select.selectOption(valor!);
}
