import Dexie, { type Table } from "dexie";

export interface FincaCacheRecord {
  id: number;
  nombre: string;
  precio_litro: number;
  orden: number;
  cachedAt: number;
}

export interface RecoleccionLocalRecord {
  localId?: number;
  finca_id: number;
  fecha: string;
  litros: number;
  precio_litro: number;
  serverId: number | null;
  syncStatus: "pending" | "synced" | "failed";
  createdAt: number;
  syncedAt: number | null;
}

export interface SyncQueueRecord {
  id?: number;
  localId: number;
  retryCount: number;
  lastAttemptAt: number | null;
  error: string | null;
}

class FincaTocaOfflineDB extends Dexie {
  fincasCache!: Table<FincaCacheRecord>;
  recoleccionesLocal!: Table<RecoleccionLocalRecord>;
  syncQueue!: Table<SyncQueueRecord>;

  constructor() {
    super("finca-toca-offline");
    this.version(1).stores({
      fincasCache: "id, cachedAt",
      recoleccionesLocal: "++localId, [finca_id+fecha], syncStatus, createdAt, syncedAt",
      syncQueue: "++id, localId",
    });
    // v2: añade índice individual en fecha para queries eficientes
    this.version(2).stores({
      recoleccionesLocal: "++localId, [finca_id+fecha], fecha, syncStatus, createdAt, syncedAt",
    });
  }
}

export const db = new FincaTocaOfflineDB();

export async function purgeOldSyncedRecords(): Promise<void> {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const old = await db.recoleccionesLocal
    .where("syncStatus")
    .equals("synced")
    .and((r) => r.syncedAt !== null && r.syncedAt < cutoff)
    .toArray();

  const oldLocalIds = old.map((r) => r.localId!);
  if (oldLocalIds.length === 0) return;

  await db.transaction("rw", [db.recoleccionesLocal, db.syncQueue], async () => {
    await db.recoleccionesLocal.bulkDelete(oldLocalIds);
    await db.syncQueue.where("localId").anyOf(oldLocalIds).delete();
  });
}
