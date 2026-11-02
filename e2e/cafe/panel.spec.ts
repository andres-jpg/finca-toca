import { expect, test, usarRol } from "../fixtures/test";
import { crearCompra, registrarTostion } from "../helpers/api";
import { irA } from "../helpers/ui";

test.use(usarRol("cafeAdmin"));

// Panel de gerencia (A-19): costo por libra, «Para decidir hoy», proveedores de marca propia y merma de tostión por
// día con su banda. Punto de partida por la API (una compra tostada); lo que se prueba,
// por la interfaz. La base se comparte entre tests: se buscan los datos propios por su nombre/código y se evita comparar totales.

test("panel: para decidir hoy, proveedores, merma de tostión con banda y los nombres nuevos", async ({ page }) => {
  // Marca propia: compra de 62,5 kg a $18.500 y tostión (merma 18 %: en la banda de 18 ± 2).
  const compra = await crearCompra({ bultos: 1, pesoKg: 62.5, precioKg: 18500 });
  await registrarTostion(compra, 62.5);

  await irA(page, "/dashboard/cafe?periodo=semana");
  await expect(page.getByRole("heading", { level: 1, name: "Panel de gerencia" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Esta semana" })).toHaveAttribute("aria-current", "page");

  // Para decidir hoy: la lista accionable está presente (cada aviso, si lo hay, lleva su enlace).
  const cartera = page.getByTestId("panel-cartera");
  await expect(cartera.getByRole("heading", { name: "Para decidir hoy" })).toBeVisible();

  // Costo por libra por calidad (A-05) se conserva.
  await expect(page.getByRole("heading", { name: "Costo por libra (500 g)" })).toBeVisible();

  // Proveedores de marca propia: precio por kg y merma de tostión de lo comprado.
  const proveedores = page.getByRole("region", { name: "Proveedores de marca propia" });
  const fila = proveedores.getByRole("row").filter({ hasText: "Proveedor E2E SAS" });
  await expect(fila).toContainText("$18.500");
  await expect(fila).toContainText(/\d+,\d %/);

  // Merma de tostión por día con la banda de referencia.
  await expect(page.getByText("Merma de tostión por día")).toBeVisible();
  await expect(page.getByTestId("grafico-merma-tostion")).toBeVisible();
  await expect(page.getByText(/banda: referencia 18,0 % ± 2 pts/)).toBeVisible();

  // El empaque no entra en la merma por proceso (A-01), y los nombres nuevos.
  const merma = page.locator("section").filter({ has: page.getByRole("heading", { name: "Merma promedio" }) });
  await expect(merma.getByRole("rowheader", { name: "Tostión" })).toBeVisible();
  await expect(merma.getByRole("rowheader", { name: "Empaque" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Ingreso servicios a terceros" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Inventario de marca propia" })).toBeVisible();

  // La línea se respeta: marca propia tiene proveedores; servicios, no.
  await irA(page, "/dashboard/cafe?periodo=semana&linea=marca_propia");
  await expect(page.getByRole("region", { name: "Proveedores de marca propia" })).toBeVisible();
  await irA(page, "/dashboard/cafe?periodo=semana&linea=maquila");
  await expect(page.getByRole("region", { name: "Proveedores de marca propia" })).toHaveCount(0);

});
