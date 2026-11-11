import { expect, test, usarRol } from "../fixtures/test";
import { crearCompra, tostarYEmpacar } from "../helpers/api";
import { abrirFichaDeLote, aviso, irA } from "../helpers/ui";

// B-13 (FIN-160): precio real de los insumos y costo por libra por presentación (500 g y 2.500 g); B-10 (FIN-156): los tres bloques
// del inventario de marca propia. Los precios vigentes (bolsa 500 g $1.200, etiqueta 500 g $370, bolsa 2.500 g $3.700, etiqueta
// 2.500 g $370) los carga `supabase/dev/e2e-seed.sql`: aquí solo se comprueba que el admin los ve y puede fijarlos, y que el costo
// de la ficha sale de ellos. Los fija sin cambiarlos (la base es compartida entre tests).

test.describe("administrador", () => {
  test.use(usarRol("cafeAdmin"));

  test("fija el precio de un insumo y la ficha del lote da el costo por libra de 500 g y 2.500 g", async ({ page }) => {
    await irA(page, "/dashboard/cafe/inventario?tab=insumos");
    await expect(page.getByRole("columnheader", { name: "Precio" }).first()).toBeVisible();
    await expect(page.getByText("$1.200").first()).toBeVisible();
    await page.getByRole("button", { name: "Fijar el precio de Bolsa 500 g" }).click();
    await page.getByLabel("Precio por unidad (COP)").fill("1200");
    await page.getByRole("button", { name: "Guardar precio" }).click();
    await expect(aviso(page, /Precio de Bolsa 500 g: \$1\.200/)).toBeVisible();

    // Excelso a $18.500/kg (el precio de los demás tests: no mueve sus promedios), 125 kg → báscula 102,5 kg (merma 18 %):
    // café por libra = 18.500 / 0,82 × 0,5 = $11.280.
    const lote = await crearCompra({ tipo: "Excelso", pesoKg: 125, precioKg: 18500 });
    await tostarYEmpacar(lote, 125, [
      { presentacion_g: 500, unidades: 100 },
      { presentacion_g: 2500, unidades: 10 },
    ]);
    await abrirFichaDeLote(page, lote.codigo);
    const costo = page.getByRole("region", { name: "Costo de producir una libra" });
    await expect(costo).toBeVisible();
    await expect(costo.getByRole("row", { name: /Café por libra/ })).toContainText("$11.280");
    // Empaque por libra: 500 g → 1.200 + 370 = $1.570; 2.500 g → (3.700 + 370) ÷ 5 = $814.
    const empaque = costo.getByRole("row", { name: /Empaque por libra/ });
    await expect(empaque).toContainText("$1.570");
    await expect(empaque).toContainText("$814");
    // Costo por libra = café + empaque.
    const total = costo.getByRole("row", { name: /^Costo por libra/ });
    await expect(total).toContainText("$12.850");
    await expect(total).toContainText("$12.094");
  });

  test("Inventario › Marca propia muestra los tres bloques y las acciones de la cabecera", async ({ page }) => {
    await irA(page, "/dashboard/cafe/inventario");
    await expect(page.getByRole("button", { name: "Ajustar inventario" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Convertir presentación" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Comprar insumos" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "1 · Café verde por tostar" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "2 · Tostado sin empacar" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "3 · Producto terminado · listo para vender" })).toBeVisible();
    await expect(page.getByText("Sobrantes de empaque. Se ofrecen en el próximo empaque de la misma calidad y forma.")).toBeVisible();
    await expect(page.getByText("1 lb = 500 g")).toBeVisible();
    for (const columna of ["Producto terminado", "Grano · und", "Molido · und", "Libras", "Alcanza para"]) {
      await expect(page.getByRole("columnheader", { name: columna })).toBeVisible();
    }
    await expect(page.getByText(/La venta descuenta de esta tabla\./)).toBeVisible();
  });
});
