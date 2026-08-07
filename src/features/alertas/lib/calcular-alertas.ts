import { addDays, addMonths, differenceInCalendarDays, format } from "date-fns";
import { es } from "date-fns/locale";
import {
  DIAS_CELO_POST_PARTO,
  DIAS_CICLO_CELO,
  DIAS_TOPIZADO,
  MESES_PARTO,
  MESES_SECADO,
  TIPOS_EVENTO_FIN_GESTACION,
  parseFechaDB,
} from "@/lib/animales/estados";
import { formatDate } from "@/lib/utils";
import type {
  Alerta,
  AnimalSexo,
  EstadoProductivo,
  EstadoReproductivo,
  ResultadoPalpacion,
  SeveridadAlerta,
  TipoEvento,
  VacaOrigen,
} from "@/types";

/** Subconjunto de `Animal` que necesita el cálculo — `Animal` lo satisface estructuralmente. */
export interface AnimalParaAlertas {
  id: string;
  nombre: string;
  identificador: string;
  sexo: AnimalSexo;
  origen: VacaOrigen | null;
  fecha_nacimiento: string | null;
  estado_productivo: EstadoProductivo | null;
  estado_reproductivo: EstadoReproductivo | null;
}

/** Subconjunto de `EventoAnimal` que necesita el cálculo. */
export interface EventoParaAlertas {
  animal_id: string;
  tipo_evento: TipoEvento;
  fecha: string;
  resultado: ResultadoPalpacion | null;
}

const fmt = (d: Date) => format(d, "dd/MM/yyyy", { locale: es });

function severidad(diasRestantes: number): SeveridadAlerta {
  if (diasRestantes < 0) return "vencida";
  if (diasRestantes === 0) return "hoy";
  return "proxima";
}

function construir(
  animal: AnimalParaAlertas,
  tipo: Alerta["tipo"],
  objetivo: Date,
  detalle: string,
  hoy: Date
): Alerta {
  const diasRestantes = differenceInCalendarDays(objetivo, hoy);
  return {
    id: `${animal.id}:${tipo}`,
    tipo,
    animal_id: animal.id,
    animal_nombre: animal.nombre,
    animal_identificador: animal.identificador,
    fecha_objetivo: formatDate(objetivo),
    dias_restantes: diasRestantes,
    severidad: severidad(diasRestantes),
    resoluble: tipo === "secado" || tipo === "topizado",
    detalle,
  };
}

/** Último evento de los tipos indicados, o `null`. `eventos` debe venir ordenado ascendente por fecha. */
function ultimoDe(eventos: EventoParaAlertas[], tipos: TipoEvento[]): EventoParaAlertas | null {
  for (let i = eventos.length - 1; i >= 0; i--) {
    if (tipos.includes(eventos[i].tipo_evento)) return eventos[i];
  }
  return null;
}

/** ¿Existe algún evento de estos tipos con fecha >= `desde`? */
function existeDesde(eventos: EventoParaAlertas[], tipos: TipoEvento[], desde: string): boolean {
  return eventos.some((e) => tipos.includes(e.tipo_evento) && e.fecha >= desde);
}

/**
 * Una vaca marcada como `cargada` a mano, sin evento de inseminación/monta registrado,
 * no puede generar las alertas de secado ni de parto: no hay fecha base. La ficha del
 * animal usa esto para avisar en vez de callar.
 */
export function faltaRegistrarServicio(
  animal: AnimalParaAlertas,
  eventos: EventoParaAlertas[]
): boolean {
  if (animal.sexo !== "hembra" || animal.estado_reproductivo !== "cargada") return false;
  return ultimoDe(eventos, ["inseminacion", "monta"]) === null;
}

/**
 * Deriva las alertas pendientes a partir del estado de los animales y su historial de eventos.
 * Función pura: no toca Supabase ni el reloj salvo por el parámetro `hoy`.
 *
 * Reglas (ver diagrama de flujo de la finca):
 * - **Secado** y **parto probable** se cuentan desde `fecha` del último evento
 *   `inseminacion`/`monta`, nunca desde la palpación ni desde `created_at`.
 * - **Topizado**: 15 días desde el nacimiento, solo mientras la cría siga en estado `leche`.
 * - **Celo**: 60 días tras cerrarse la gestación —parto o aborto— mientras la vaca esté en
 *   pre-servicio o servicio; para cualquier otra vaca en servicio (nunca parió, o volvió a
 *   servicio tras una palpación con resultado "vacía"), el siguiente múltiplo de 20 días
 *   desde su último evento reproductivo.
 */
export function calcularAlertas(
  animales: AnimalParaAlertas[],
  eventos: EventoParaAlertas[],
  hoy: Date = new Date()
): Alerta[] {
  const porAnimal = new Map<string, EventoParaAlertas[]>();
  for (const evento of eventos) {
    const lista = porAnimal.get(evento.animal_id);
    if (lista) lista.push(evento);
    else porAnimal.set(evento.animal_id, [evento]);
  }
  for (const lista of porAnimal.values()) {
    lista.sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  const alertas: Alerta[] = [];

  for (const animal of animales) {
    const suyos = porAnimal.get(animal.id) ?? [];

    // --- Topizado: 15 días desde el nacimiento, mientras la cría esté en "leche".
    if (
      animal.origen === "finca" &&
      animal.fecha_nacimiento &&
      animal.estado_productivo === "leche" &&
      !ultimoDe(suyos, ["topizado"])
    ) {
      const nacimiento = parseFechaDB(animal.fecha_nacimiento);
      alertas.push(
        construir(
          animal,
          "topizado",
          addDays(nacimiento, DIAS_TOPIZADO),
          `Nacida el ${fmt(nacimiento)}`,
          hoy
        )
      );
    }

    if (animal.sexo !== "hembra") continue;

    const servicio = ultimoDe(suyos, ["inseminacion", "monta"]);
    // Parto y aborto cierran la gestación igual: devuelven la vaca a pre-servicio y
    // son la fecha base desde la que se cuenta el primer celo.
    const finGestacion = ultimoDe(suyos, TIPOS_EVENTO_FIN_GESTACION);

    // --- Secado y parto probable: solo en la rama "cargada" del diagrama, y siempre
    //     contados desde la fecha del servicio que introdujo el usuario.
    if (animal.estado_reproductivo === "cargada" && servicio) {
      const fechaServicio = parseFechaDB(servicio.fecha);
      const etiquetaServicio =
        servicio.tipo_evento === "monta" ? "Monta" : "Inseminación";
      const detalle = `${etiquetaServicio} del ${fmt(fechaServicio)}`;

      if (!existeDesde(suyos, ["secado"], servicio.fecha)) {
        alertas.push(
          construir(animal, "secado", addMonths(fechaServicio, MESES_SECADO), detalle, hoy)
        );
      }
      if (!existeDesde(suyos, ["parto"], servicio.fecha)) {
        alertas.push(
          construir(animal, "parto", addMonths(fechaServicio, MESES_PARTO), detalle, hoy)
        );
      }
    }

    // --- Celo tras cerrarse la gestación: +60 días desde el parto/aborto.
    // Incluye `servicio` además de `pre_servicio`: el cron mueve la vaca a `servicio`
    // exactamente el día objetivo de esta alerta, así que filtrar solo por `pre_servicio`
    // la apagaría justo cuando vence. Sigue viva hasta que se registre el celo o el servicio.
    let celoPostParto = false;
    if (
      (animal.estado_reproductivo === "pre_servicio" ||
        animal.estado_reproductivo === "servicio") &&
      finGestacion
    ) {
      const yaEntroEnCelo = existeDesde(
        suyos,
        ["celo", "inseminacion", "monta"],
        finGestacion.fecha
      );
      if (!yaEntroEnCelo) {
        celoPostParto = true;
        const fechaCierre = parseFechaDB(finGestacion.fecha);
        const etiquetaCierre =
          finGestacion.tipo_evento === "aborto" ? "Aborto" : "Parto";
        alertas.push(
          construir(
            animal,
            "celo",
            addDays(fechaCierre, DIAS_CELO_POST_PARTO),
            `${etiquetaCierre} del ${fmt(fechaCierre)}`,
            hoy
          )
        );
      }
    }

    // --- Celo cíclico en servicio: ciclo estral de 20 días, avanzando hasta la próxima
    // fecha ≥ hoy. Cubre a cualquier vaca en "servicio" que no acabe de cerrar gestación
    // (el bloque anterior ya la cubrió con la fecha de parto/aborto) — típicamente porque
    // nunca hubo parto, o porque una palpación posterior la devolvió a "servicio" ("vacía"
    // ya no es un estado propio) tras un servicio que no prendió.
    if (animal.estado_reproductivo === "servicio" && !celoPostParto) {
      const base = ultimoDe(suyos, [
        "celo",
        "palpacion",
        "confirmacion_prenez",
        "parto",
        "aborto",
        "inseminacion",
        "monta",
      ]);
      if (base) {
        const fechaBase = parseFechaDB(base.fecha);
        const transcurridos = differenceInCalendarDays(hoy, fechaBase);
        // Al menos un ciclo; si ya pasaron varios, saltar al siguiente que aún no ha llegado.
        const ciclos = Math.max(1, Math.ceil(transcurridos / DIAS_CICLO_CELO));
        alertas.push(
          construir(
            animal,
            "celo",
            addDays(fechaBase, ciclos * DIAS_CICLO_CELO),
            `En servicio desde el ${fmt(fechaBase)}`,
            hoy
          )
        );
      }
    }
  }

  return alertas.sort(
    (a, b) =>
      a.fecha_objetivo.localeCompare(b.fecha_objetivo) ||
      a.animal_identificador.localeCompare(b.animal_identificador, undefined, { numeric: true })
  );
}
