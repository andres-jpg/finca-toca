import { expect, test, usarRol } from "../fixtures/test";
import { crearCompra, crearProveedor, registrarTostion, sufijo, tostarYEmpacar, venderUnidades } from "../helpers/api";
import { irA } from "../helpers/ui";

test.use(usarRol("cafeAdmin"));

// Panel de gerencia «Cómo va el negocio» (B-14): tres KPIs, ingresos de 14 días con el total sobre cada barra, «Para decidir hoy»
// sin cartera, libras por presentación, costo de producir una libra, producción sin empaque y proveedores con semáforo. Punto de
// partida por la API (una compra tostada); lo que se prueba, por la interfaz. La base se comparte entre tests: se buscan los datos
// propios por su nombre (proveedor incluido) y se evita comparar totales.

test("panel: tres KPIs, gráfico de 14 días, para decidir hoy, producción sin empaque y proveedores", async ({ page }) => {
  // Marca propia: compra de 62,5 kg a $18.500 y tostión (la tanda queda sin cerrar: cuenta como kg que entran). El proveedor es
  // propio del test: el precio medio por kilo se pondera sobre todas las compras del mes de ese proveedor, así que con el
  // proveedor compartido del seed dependía de lo que hubieran comprado los demás tests (y del orden en que corrieran).
  const nombreProveedor = `Proveedor panel ${sufijo()}`;
  const terceroId = await crearProveedor(nombreProveedor);
  const compra = await crearCompra({ pesoKg: 62.5, precioKg: 18500, terceroId });
  await registrarTostion(compra, 62.5);

  // Con al menos una venta empacada del mes, el panel calcula el margen y el costo por libra de lo vendido (`costo_libra_panel` sobre
  // el histórico). Un rango histórico fuera del máximo de la base (dos años) lo hacía fallar con «Error al cargar los datos».
  const otra = await crearCompra({ pesoKg: 125, precioKg: 18500, terceroId });
  await tostarYEmpacar(otra, 125, [{ presentacion_g: 500, unidades: 4 }]);
  await venderUnidades("Excelso 500 g", 1, 29000);

  await irA(page, "/dashboard/cafe?periodo=mes");
  await expect(page.getByRole("heading", { level: 1, name: "Cómo va el negocio" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Mes", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "Hoy", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Semana", exact: true })).toBeVisible();

  // Solo tres KPIs; ninguno de inventario ni por cobrar.
  const kpis = page.getByTestId("panel-kpis");
  await expect(kpis.getByRole("heading", { level: 3 })).toHaveCount(3);
  await expect(kpis.getByRole("heading", { name: "Ingresos del mes" })).toBeVisible();
  await expect(kpis.getByRole("heading", { name: "Libras vendidas" })).toBeVisible();
  await expect(kpis.getByRole("heading", { name: "Margen bruto marca propia" })).toBeVisible();
  await expect(kpis.getByText(/del promedio mensual \(2\.850 lb\)/)).toBeVisible();
  await expect(page.getByText(/por cobrar|cartera/i)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Inventario de marca propia" })).toHaveCount(0);

  // Ingresos de 14 días (un solo eje, leyenda) y «Para decidir hoy».
  await expect(page.getByText("Ingresos diarios · últimos 14 días")).toBeVisible();
  await expect(page.getByText(/Acumulado del mes: \$/)).toBeVisible();
  await expect(page.getByText(/cifras en millones de pesos/)).toBeVisible();
  await expect(page.getByTestId("panel-decidir").getByRole("heading", { name: "Para decidir hoy" })).toBeVisible();

  // Libras por presentación y costo de producir una libra.
  await expect(page.getByRole("heading", { name: "Libras vendidas por presentación" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Costo de producir una libra" })).toBeVisible();

  // Producción: kg que entran, sin fila de empaque, con la merma de tostión de marca propia.
  const produccion = page.getByRole("region", { name: /Producción del mes/ });
  await expect(produccion.getByRole("rowheader", { name: "Tostión" })).toBeVisible();
  await expect(produccion.getByRole("rowheader", { name: "Empaque" })).toHaveCount(0);
  await expect(page.getByTestId("merma-tostion")).toBeVisible();

  // Proveedores de marca propia: comprado y precio por kg.
  const proveedores = page.getByRole("region", { name: "Proveedores de marca propia" });
  const fila = proveedores.getByRole("row").filter({ hasText: nombreProveedor });
  await expect(fila).toContainText("$18.500");

  // Se retiran los gráficos de merma y el filtro de línea.
  await expect(page.getByText("Merma de tostión por día")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Maquila", exact: true })).toHaveCount(0);

  // El periodo vive en la URL.
  await irA(page, "/dashboard/cafe?periodo=semana");
  await expect(page.getByRole("link", { name: "Semana", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Ingresos de la semana" })).toBeVisible();
});
