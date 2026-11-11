import { pctDeMerma } from "./formato";
import type { BacheLinea, ProcesoLinea } from "./linea-tiempo";
import { etiquetaTueste } from "./servicios";
import type { NivelTueste } from "../types";

// Tandas de la historia del lote (B-12): «Tostión · tanda 1», «Empaque · tanda 1». La tanda es la tostión (cada una
// con su empaque, que cierra su salida con la báscula). Puro: sin base ni React.

export interface InfoTanda {
  numero: number;
  /** Merma de la tostión de la tanda (%); `null` mientras la tanda no esté empacada. */
  mermaTandaPct: number | null;
  /** Merma acumulada de las tandas cerradas hasta este empaque (%); solo en el empaque. */
  acumuladaPct: number | null;
}

type ProcesoTanda = Pick<
  ProcesoLinea,
  "id" | "tipo" | "fecha" | "creadoEn" | "pesoEntradaKg" | "pesoSalidaKg" | "mermaKg" | "anulacion" | "reaperturaId" | "origenProcesoId"
>;

const porInstante = (a: ProcesoTanda, b: ProcesoTanda) =>
  a.fecha.localeCompare(b.fecha) || a.creadoEn.localeCompare(b.creadoEn) || a.id.localeCompare(b.id);

/** Numera las tostiones vigentes del lote y calcula, para cada empaque, la merma de su tanda y la acumulada. */
export function calcularTandas(procesos: readonly ProcesoTanda[]): Map<string, InfoTanda> {
  const vigentes = procesos.filter((p) => p.anulacion === null && !p.reaperturaId);
  const tostiones = vigentes.filter((p) => p.tipo === "tostion").sort(porInstante);
  const empaques = vigentes.filter((p) => p.tipo === "empaque").sort(porInstante);
  const resultado = new Map<string, InfoTanda>();
  const numeroDe = new Map<string, number>();

  tostiones.forEach((t, i) => {
    numeroDe.set(t.id, i + 1);
    const cerrada = t.pesoSalidaKg !== null && t.mermaKg !== null;
    resultado.set(t.id, { numero: i + 1, mermaTandaPct: cerrada ? pctDeMerma(t.mermaKg, t.pesoEntradaKg) : null, acumuladaPct: null });
  });

  const cerradas = new Map<string, ProcesoTanda>();
  empaques.forEach((emp, i) => {
    const origen = tostiones.find((t) => t.id === emp.origenProcesoId) ?? null;
    if (origen && origen.pesoSalidaKg !== null && origen.mermaKg !== null) cerradas.set(origen.id, origen);
    let entrada = 0;
    let merma = 0;
    for (const t of cerradas.values()) {
      entrada += Math.round(t.pesoEntradaKg * 1000);
      merma += Math.round((t.mermaKg ?? 0) * 1000);
    }
    resultado.set(emp.id, {
      numero: origen ? (numeroDe.get(origen.id) ?? i + 1) : i + 1,
      mermaTandaPct: origen && origen.mermaKg !== null ? pctDeMerma(origen.mermaKg, origen.pesoEntradaKg) : null,
      acumuladaPct: pctDeMerma(merma / 1000, entrada / 1000),
    });
  });
  return resultado;
}

export interface PerfilTueste {
  nivel: NivelTueste | null;
  tempC: number | null;
  tiempoMin: number | null;
}

const num = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

/** «3», «3 y 4», «3, 4 y 5». */
function listaNumeros(ns: readonly number[]): string {
  if (ns.length <= 1) return ns.join("");
  return `${ns.slice(0, -1).join(", ")} y ${ns[ns.length - 1]}`;
}

/**
 * Baches que se apartaron del perfil de tueste del lote (temperatura, tiempo o nivel distintos). Sin perfil (o sin
 * el dato correspondiente) no hay con qué comparar y no se marca nada.
 */
export function bachesModificados(baches: readonly BacheLinea[], perfil: PerfilTueste | null): BacheLinea[] {
  if (!perfil) return [];
  return baches.filter(
    (b) =>
      (perfil.tempC !== null && b.temperaturaC != null && b.temperaturaC !== perfil.tempC) ||
      (perfil.tiempoMin !== null && b.tiempoMin != null && b.tiempoMin !== perfil.tiempoMin) ||
      (perfil.nivel !== null && b.nivelTueste != null && b.nivelTueste !== perfil.nivel),
  );
}

/**
 * Resumen de una tanda de tostión: «5 baches · Medio · 216 °C · 17 min» o, con baches fuera del perfil,
 * «4 baches · baches 3 y 4 a 220 °C, alto». Nunca incluye pesos de salida por bache.
 */
export function resumenTostion(baches: readonly BacheLinea[], perfil: PerfilTueste | null, nivelProceso: NivelTueste | null): string {
  const partes: string[] = [];
  if (baches.length > 0) partes.push(`${baches.length} ${baches.length === 1 ? "bache" : "baches"}`);
  const modificados = bachesModificados(baches, perfil);
  if (modificados.length === 0) {
    const nivel = perfil?.nivel ?? nivelProceso;
    if (nivel) partes.push(etiquetaTueste(nivel));
    if (perfil?.tempC != null) partes.push(`${num(perfil.tempC)} °C`);
    if (perfil?.tiempoMin != null) partes.push(`${num(perfil.tiempoMin)} min`);
  } else {
    const primero = modificados[0];
    const cambios: string[] = [];
    if (perfil?.tempC != null && primero.temperaturaC != null && primero.temperaturaC !== perfil.tempC) cambios.push(`${num(primero.temperaturaC)} °C`);
    if (perfil?.tiempoMin != null && primero.tiempoMin != null && primero.tiempoMin !== perfil.tiempoMin) cambios.push(`${num(primero.tiempoMin)} min`);
    if (perfil?.nivel != null && primero.nivelTueste != null && primero.nivelTueste !== perfil.nivel) cambios.push(etiquetaTueste(primero.nivelTueste).toLowerCase());
    partes.push(`${modificados.length === 1 ? "bache" : "baches"} ${listaNumeros(modificados.map((b) => b.numero))} a ${cambios.join(", ")}`);
  }
  return partes.join(" · ");
}
