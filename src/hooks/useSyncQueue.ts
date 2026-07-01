"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, purgeOldSyncedRecords } from "@/lib/offline/db";
import { syncQueue, syncPagos } from "@/lib/offline/sync";

export function useSyncQueue(isOnline: boolean) {
  // Mutex real: useRef se lee/escribe sincrónicamente, a diferencia de useState (cuyo
  // setState diferido permite que dos syncNow() casi simultáneos lean isSyncing=false
  // y corran en paralelo, duplicando peticiones). isSyncing (state) solo refleja la UI.
  const isSyncingRef = useRef(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const prevOnlineRef = useRef(isOnline);

  const pendingCount =
    useLiveQuery(
      () => db.recoleccionesLocal.where("syncStatus").equals("pending").count(),
      [],
      0
    ) ?? 0;

  const syncNow = async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    setIsSyncing(true);
    try {
      await Promise.all([syncQueue(), syncPagos()]);
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  };

  // Al montar: purgar datos antiguos y sincronizar si hay conexión
  useEffect(() => {
    purgeOldSyncedRecords();
    if (isOnline) syncNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Al recuperar conexión: esperar 500ms (Supabase renueva token) y sincronizar
  useEffect(() => {
    if (isOnline && !prevOnlineRef.current) {
      const timer = setTimeout(() => syncNow(), 500);
      prevOnlineRef.current = true;
      return () => clearTimeout(timer);
    }
    prevOnlineRef.current = isOnline;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  return { pendingCount, isSyncing, syncNow };
}
