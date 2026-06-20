import { db } from "./db";

interface SyncResult {
  results: { localId: number; serverId: number }[];
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

      if (response.status === 409) {
        // Ya existe en servidor — marcar como sincronizado
        await db.recoleccionesLocal.update(localId, {
          syncStatus: "synced",
          syncedAt: Date.now(),
        });
        if (queueEntry?.id) await db.syncQueue.delete(queueEntry.id);
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: SyncResult = await response.json();
      const matched = data.results.find((r) => r.localId === localId);

      await db.recoleccionesLocal.update(localId, {
        syncStatus: "synced",
        serverId: matched?.serverId ?? null,
        syncedAt: Date.now(),
      });
      if (queueEntry?.id) await db.syncQueue.delete(queueEntry.id);
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
