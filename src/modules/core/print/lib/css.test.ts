import { describe, expect, it } from "vitest";
import { cssImpresionTermica } from "./css";

describe("cssImpresionTermica", () => {
  it("80 mm: página de 80, cuerpo de 72 y márgenes de 4 mm", () => {
    const css = cssImpresionTermica(80);
    expect(css).toContain("@page { size: 80mm 297mm; margin: 0; }");
    expect(css).toContain("body { width: 72mm; margin: 0 4mm; }");
  });

  it("58 mm: página de 58, cuerpo de 48 mm", () => {
    const css = cssImpresionTermica(58);
    expect(css).toContain("@page { size: 58mm 297mm; margin: 0; }");
    expect(css).toContain("body { width: 48mm; margin: 0 5mm; }");
    expect(css).not.toContain("80mm");
  });

  it("no usa `auto` como dimensión: Chrome descartaría el @page entero", () => {
    expect(cssImpresionTermica(80)).not.toMatch(/size:[^;]*auto/);
  });

  it("corta entre tiquetes sin dejar una página en blanco al final, y oculta .no-print", () => {
    const css = cssImpresionTermica(80);
    expect(css).toContain(".ticket { break-after: page; page-break-after: always; }");
    expect(css).toContain(".ticket:last-child { break-after: auto; page-break-after: auto; }");
    expect(css).toContain(".no-print { display: none !important; }");
  });
});
