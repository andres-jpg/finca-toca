import { expect, test, usarRol } from "../fixtures/test";
import { crearCompra, crearRecepcion, registrarTrilla } from "../helpers/api";
import { irA } from "../helpers/ui";

test.use(usarRol("cafeAdmin"));

// QA v2 (FIN-163) · criterio «barrido de textos»: las pantallas de Cofradía no muestran «bulto», «receta», «merma total», signos de
// exclamación ni emoji. (El mismo barrido sobre el código fuente: grep del ticket; aquí, sobre lo que se pinta de verdad.)

const PROHIBIDO = [
  { nombre: "bulto", re: /bulto/i },
  { nombre: "receta", re: /receta/i },
  { nombre: "merma total", re: /merma total/i },
  { nombre: "exclamación", re: /[¡!]/ },
  { nombre: "emoji", re: /\p{Extended_Pictographic}/u },
];

test("v2 · barrido de textos: sin «bulto», «receta», «merma total», exclamaciones ni emoji @tablet", async ({ page }) => {
  // Quince pantallas en un solo test: con `next dev` cada una compila en frío, y el límite por defecto (2 min) se agota.
  test.setTimeout(400_000);
  const compra = await crearCompra({ tipo: "Consumo", pesoKg: 125 });
  const servicio = await crearRecepcion({ servicios: ["trilla"], pesoKg: 125 });
  await registrarTrilla(servicio, 125, 101.25);

  const rutas = [
    "/dashboard/cafe",
    "/dashboard/cafe/recibir?tipo=marca-propia",
    "/dashboard/cafe/recibir?tipo=servicios",
    "/dashboard/cafe/planta",
    `/dashboard/cafe/planta/${compra.id}`,
    `/dashboard/cafe/planta/${servicio.id}`,
    "/dashboard/cafe/planta/entregar",
    "/dashboard/cafe/lotes",
    `/dashboard/cafe/lotes/${compra.id}`,
    `/dashboard/cafe/lotes/${servicio.id}`,
    "/dashboard/cafe/inventario",
    "/dashboard/cafe/inventario?tab=insumos",
    "/dashboard/cafe/ventas/nueva",
    "/dashboard/cafe/remisiones",
    "/dashboard/cafe/configuracion",
  ];

  const hallazgos: string[] = [];
  for (const ruta of rutas) {
    await irA(page, ruta);
    // Las pantallas pintan por secciones (Suspense): se espera a que no quede ningún marcador de carga.
    await expect(page.locator("main [aria-busy='true']")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    const texto = await page.locator("main").innerText();
    expect(texto.length, `${ruta} pintó contenido`).toBeGreaterThan(80);
    for (const p of PROHIBIDO) {
      const m = texto.match(p.re);
      if (m) {
        const i = texto.indexOf(m[0]);
        hallazgos.push(`${ruta} · ${p.nombre}: «…${texto.slice(Math.max(0, i - 30), i + 30).replace(/\s+/g, " ")}…»`);
      }
    }
  }
  expect(hallazgos, hallazgos.join("\n")).toEqual([]);
});
