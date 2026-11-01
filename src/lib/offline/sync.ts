import { db } from "./db";

interface SyncResult {
  results: { localId: number; serverId: number }[];
  errors: { localId: number; error: string }[];
}

interface PagoSyncResult {
  results: { localId: number }[];
  errors: { localId: number; error: string }[];
}

export async function addToSyncQueue(localId: number): Promise<void> {
  const existing = await db.syncQueue.where("localId").equals(localId).first();
  if (existing?.id) {
    await db.syncQueue.update(existing.id, { retryCount: 0, lastAttemptAt: null, error: null });
  } else {
    await db.syncQueue.add({ localId, retryCount: 0, lastAttemptAt: null, error: null });
  }
}

export async function syncPagos(): Promise<void> {
  const pending = await db.pagosLocal.where("syncStatus").equals("pending").toArray();
  if (pending.length === 0) return;

  const payload = pending.map((p) => ({
    localId: p.localId!,
    serverId: p.serverId,
    nuevoEstado: p.estado,
    responsable: p.responsable,
    fechaMarcado: p.fechaMarcadoLocal
      ? new Date(p.fechaMarcadoLocal).toISOString()
      : null,
  }));

  try {
    const response = await fetch("/api/pagos-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data: PagoSyncResult = await response.json();
    const succeededIds = new Set(data.results.map((r) => r.localId));
    const failedIds = new Set(data.errors.map((r) => r.localId));

    await db.transaction("rw", db.pagosLocal, async () => {
      for (const p of pending) {
        const lid = p.localId!;
        if (!succeededIds.has(lid) && !failedIds.has(lid)) continue;

        // Si el registro cambió localmente mientras la petición estaba en vuelo (el conductor
        // tocó el estado de nuevo antes de que volviera la respuesta), no lo marquemos synced/failed:
        // dejarlo "pending" para que el próximo syncNow() reenvíe el valor más reciente.
        const current = await db.pagosLocal.get(lid);
        const unchanged =
          current &&
          current.estado === p.estado &&
          current.responsable === p.responsable &&
          current.fechaMarcadoLocal === p.fechaMarcadoLocal;
        if (!unchanged) continue;

        if (succeededIds.has(lid)) {
          await db.pagosLocal.update(lid, { syncStatus: "synced" });
        } else {
          await db.pagosLocal.update(lid, { syncStatus: "failed" });
        }
      }
    });
  } catch {
    // Silencioso — reintentará en próxima conexión
  }
}

const MAX_ERRORES_SERVIDOR = 3;

// Errores 4xx que no se arreglan reintentando (cuerpo inválido, sin permisos...). 408 y 429
// sí son transitorios.
function esErrorDefinitivo(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

export async function syncQueue(): Promise<void> {
  const pending = await db.recoleccionesLocal
    .where("syncStatus")
    .equals("pending")
    .toArray();

  for (const record of pending) {
    const localId = record.localId!;
    const queueEntry = await db.syncQueue.where("localId").equals(localId).first();

    // Si el registro cambió localmente (otra edición) mientras la petición estaba en
    // vuelo, no lo marquemos con el resultado de los datos viejos: dejarlo "pending" en la
    // cola para que el próximo ciclo de sync reenvíe el valor más reciente.
    const stillUnchanged = async () => {
      const current = await db.recoleccionesLocal.get(localId);
      return (
        !!current &&
        current.syncStatus === "pending" &&
        current.litros === record.litros &&
        current.precio_litro === record.precio_litro &&
        current.fecha === record.fecha &&
        current.finca_id === record.finca_id
      );
    };

    const marcarSynced = async (serverId: number | null) => {
      if (!(await stillUnchanged())) return;
      await db.recoleccionesLocal.update(localId, {
        syncStatus: "synced",
        serverId,
        syncedAt: Date.now(),
      });
      if (queueEntry?.id) await db.syncQueue.delete(queueEntry.id);
    };

    // Un fallo de red/timeout/5xx NO es un fallo del registro: la petición pudo haber llegado
    // al servidor aunque la respuesta se perdiera. Se queda "pending" y se reintenta siempre.
    // Solo es "failed" un rechazo definitivo (4xx) o un error del servidor que se repite.
    const registrarFallo = async (motivo: string, definitivo: boolean) => {
      const retryCount = (queueEntry?.retryCount ?? 0) + 1;
      if (queueEntry?.id) {
        await db.syncQueue.update(queueEntry.id, {
          retryCount,
          lastAttemptAt: Date.now(),
          error: motivo,
        });
      }
      if (definitivo && (await stillUnchanged())) {
        await db.recoleccionesLocal.update(localId, { syncStatus: "failed" });
      }
    };

    try {
      const payload = [
        {
          localId,
          finca_id: record.finca_id,
          fecha: record.fecha,
          litros: record.litros,
          precio_litro: record.precio_litro,
        },
      ];

      const response = await fetch("/api/recolecciones-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.status === 401) {
        // Token expirado — detener sync, redirigir al login
        window.location.href = "/login";
        return;
      }

      if (response.status === 409) {
        // Ya existe en servidor — marcar como sincronizado
        await marcarSynced(null);
        continue;
      }

      if (!response.ok) {
        await registrarFallo(`HTTP ${response.status}`, esErrorDefinitivo(response.status));
        continue;
      }

      const data: SyncResult = await response.json();
      const matched = data.results.find((r) => r.localId === localId);

      if (matched) {
        await marcarSynced(matched.serverId);
        continue;
      }

      // La ruta responde 200 aunque el upsert de un item falle: no darlo por sincronizado.
      const rechazo = data.errors.find((e) => e.localId === localId);
      const intentos = (queueEntry?.retryCount ?? 0) + 1;
      await registrarFallo(
        rechazo?.error ?? "Sin confirmación del servidor",
        !!rechazo && intentos >= MAX_ERRORES_SERVIDOR
      );
    } catch {
      // fetch lanzó (sin señal, timeout) o la respuesta no era JSON: transitorio.
      await registrarFallo("Error de red", false);
    }
  }
}

interface RecoleccionServidor {
  finca_id: number;
  serverId: number;
  litros: number;
  precio_litro: number;
}

/**
 * Deja una sola fila local por (finca, hoy) y la alinea con lo que ya hay en el servidor.
 * Debe ejecutarse dentro de una transacción rw sobre recoleccionesLocal y syncQueue.
 *
 * - Duplicados: se conserva el pendiente más reciente (es la intención aún sin enviar); si no
 *   hay pendientes, el que coincide con el servidor; si tampoco, el más reciente.
 * - "failed" con el mismo valor ya en el servidor → synced (la petición sí llegó).
 * - "failed" distinto o sin fila en el servidor → pending, para que el sync lo reenvíe.
 * - "synced" con litros distintos del servidor → se actualiza al valor del servidor.
 */
export async function reconciliarRecoleccionesHoy(
  today: string,
  servidor: RecoleccionServidor[]
): Promise<void> {
  const delServidor = new Map(servidor.map((s) => [s.finca_id, s]));
  const filas = await db.recoleccionesLocal.where("fecha").equals(today).toArray();

  const porFinca = new Map<number, typeof filas>();
  for (const f of filas) {
    const grupo = porFinca.get(f.finca_id);
    if (grupo) grupo.push(f);
    else porFinca.set(f.finca_id, [f]);
  }

  for (const srv of servidor) {
    if (!porFinca.has(srv.finca_id)) {
      await db.recoleccionesLocal.add({
        finca_id: srv.finca_id,
        fecha: today,
        litros: srv.litros,
        precio_litro: srv.precio_litro,
        serverId: srv.serverId,
        syncStatus: "synced",
        createdAt: Date.now(),
        syncedAt: Date.now(),
      });
    }
  }

  for (const [fincaId, grupo] of porFinca) {
    const srv = delServidor.get(fincaId);
    const masReciente = (a: (typeof filas)[number], b: (typeof filas)[number]) =>
      b.createdAt - a.createdAt;

    const keeper =
      grupo.filter((f) => f.syncStatus === "pending").sort(masReciente)[0] ??
      (srv ? grupo.find((f) => f.litros === srv.litros) : undefined) ??
      [...grupo].sort(masReciente)[0];

    const sobrantes = grupo.filter((f) => f.localId !== keeper.localId).map((f) => f.localId!);
    if (sobrantes.length > 0) {
      await db.recoleccionesLocal.bulkDelete(sobrantes);
      await db.syncQueue.where("localId").anyOf(sobrantes).delete();
    }

    const localId = keeper.localId!;
    if (keeper.syncStatus === "failed") {
      if (srv && srv.litros === keeper.litros) {
        await db.recoleccionesLocal.update(localId, {
          syncStatus: "synced",
          serverId: srv.serverId,
          syncedAt: Date.now(),
        });
        await db.syncQueue.where("localId").equals(localId).delete();
      } else {
        await db.recoleccionesLocal.update(localId, { syncStatus: "pending" });
        const entry = await db.syncQueue.where("localId").equals(localId).first();
        if (entry?.id) {
          await db.syncQueue.update(entry.id, { retryCount: 0, lastAttemptAt: null, error: null });
        } else {
          await db.syncQueue.add({ localId, retryCount: 0, lastAttemptAt: null, error: null });
        }
      }
    } else if (keeper.syncStatus === "synced" && srv && keeper.litros !== srv.litros) {
      await db.recoleccionesLocal.update(localId, {
        litros: srv.litros,
        precio_litro: srv.precio_litro,
        serverId: srv.serverId,
      });
    }
  }
}
