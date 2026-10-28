import { describe, expect, it } from "vitest";
import { CONTENT_TYPE_XLSX, contentDisposition, respuestaExcel } from "./respuesta";

describe("contentDisposition", () => {
  it("lleva el nombre ASCII y el real codificado", () => {
    expect(contentDisposition("cofradia_lotes.xlsx")).toBe(
      `attachment; filename="cofradia_lotes.xlsx"; filename*=UTF-8''cofradia_lotes.xlsx`,
    );
    const h = contentDisposition('año "x".xlsx');
    expect(h).toContain('filename="a_o _x_.xlsx"');
    expect(h).toContain("filename*=UTF-8''a%C3%B1o%20%22x%22.xlsx");
  });
});

describe("respuestaExcel", () => {
  it("devuelve el archivo como descarga y sin caché", async () => {
    const buffer = Buffer.from("contenido");
    const r = respuestaExcel(buffer, "x.xlsx");
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe(CONTENT_TYPE_XLSX);
    expect(r.headers.get("Content-Disposition")).toContain('attachment; filename="x.xlsx"');
    expect(r.headers.get("Content-Length")).toBe(String(buffer.byteLength));
    expect(r.headers.get("Cache-Control")).toBe("private, no-store");
    expect(Buffer.from(await r.arrayBuffer()).toString()).toBe("contenido");
  });
});
