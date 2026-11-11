import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { COPY_TUESTE } from "./copy";

// Guardia del glosario (B-20 · FIN-146): ni «receta» ni «bulto» en textos visibles de la app de café. Se miran los
// literales de cadena y el texto JSX; los comentarios y los identificadores (`lote_bultos`, `LoteBulto`,
// `cafe.peso_bulto_kg`) quedan fuera porque el `\b` no corta en «_» ni dentro de camelCase.

const RAIZ = join(__dirname, "..", "..", "..");
const CARPETAS = ["src/modules/cafe", "src/app/dashboard/cafe", "src/app/(print)", "src/modules/core/rpc"];
const PROHIBIDAS = /\b(receta|recetas|bulto|bultos)\b/i;

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return ficheros(p);
    return /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

/** Quita comentarios de línea y de bloque sin tocar cadenas (aprox. suficiente para este código). */
function sinComentarios(src: string): string {
  let out = "";
  let i = 0;
  let comilla: string | null = null;
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (comilla) {
      out += c;
      if (c === "\\") out += src[++i] ?? "";
      else if (c === comilla) comilla = null;
      i++;
    } else if (c === "/" && d === "/") {
      while (i < src.length && src[i] !== "\n") i++;
    } else if (c === "/" && d === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
    } else {
      if (c === '"' || c === "'" || c === "`") comilla = c;
      out += c;
      i++;
    }
  }
  return out;
}

describe("glosario de tueste (B-20)", () => {
  it("ningún texto visible de café dice «receta» ni «bulto»", () => {
    const infractores: string[] = [];
    for (const carpeta of CARPETAS) {
      for (const f of ficheros(join(RAIZ, carpeta))) {
        sinComentarios(readFileSync(f, "utf8"))
          .split("\n")
          .forEach((linea, k) => {
            if (PROHIBIDAS.test(linea)) infractores.push(`${relative(RAIZ, f)}:${k + 1}: ${linea.trim().slice(0, 100)}`);
          });
      }
    }
    expect(infractores).toEqual([]);
  });

  it("el glosario fija los rótulos", () => {
    expect(COPY_TUESTE.perfilDeTueste).toBe("Perfil de tueste");
    expect(COPY_TUESTE.nivelDeTueste).toBe("Nivel de tueste");
    expect(COPY_TUESTE.tipoDeCafe).toBe("Tipo de café");
    expect(COPY_TUESTE.perfilesPorTipoDeCafe).toBe("Perfiles de tueste por tipo de café");
    expect(COPY_TUESTE.perfilN(2)).toBe("Perfil 2");
  });
});
