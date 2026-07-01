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

export async function syncQueue(): Promise<void> {
  const pending = await db.recoleccionesLocal
    .where("syncStatus")
    .equals("pending")
    .toArray();

  for (const record of pending) {
    const localId = record.localId!;
    const queueEntry = await db.syncQueue.where("localId").equals(localId).first();

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

      // Si el registro cambió localmente (otra edición) mientras esta petición estaba en
      // vuelo, no lo marquemos synced con los datos viejos: dejarlo "pending" en la cola
      // para que el próximo ciclo de sync reenvíe el valor más reciente.
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

      if (response.status === 409) {
        // Ya existe en servidor — marcar como sincronizado
        if (await stillUnchanged()) {
          await db.recoleccionesLocal.update(localId, {
            syncStatus: "synced",
            syncedAt: Date.now(),
          });
          if (queueEntry?.id) await db.syncQueue.delete(queueEntry.id);
        }
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: SyncResult = await response.json();
      const matched = data.results.find((r) => r.localId === localId);

      if (await stillUnchanged()) {
        await db.recoleccionesLocal.update(localId, {
          syncStatus: "synced",
          serverId: matched?.serverId ?? null,
          syncedAt: Date.now(),
        });
        if (queueEntry?.id) await db.syncQueue.delete(queueEntry.id);
      }
    } catch {
      const retryCount = (queueEntry?.retryCount ?? 0) + 1;
      const newStatus = retryCount >= 3 ? "failed" : "pending";

      if (queueEntry?.id) {
        await db.syncQueue.update(queueEntry.id, {
          retryCount,
          lastAttemptAt: Date.now(),
          error: `Retry ${retryCount}`,
        });
      }
      if (newStatus === "failed") {
        await db.recoleccionesLocal.update(localId, { syncStatus: "failed" });
      }
    }
  }
}
