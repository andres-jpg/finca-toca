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
  // Si llega un syncNow() mientras otro corre (p.ej. un registro nuevo), se anota y se repite
  // al terminar; si no, ese registro esperaría hasta el próximo disparador.
  const rerunRef = useRef(false);
  const isOnlineRef = useRef(isOnline);

  const pendingCount =
    useLiveQuery(
      () => db.recoleccionesLocal.where("syncStatus").equals("pending").count(),
      [],
      0
    ) ?? 0;

  const syncNow = async () => {
    if (isSyncingRef.current) {
      rerunRef.current = true;
      return;
    }
    isSyncingRef.current = true;
    setIsSyncing(true);
    try {
      await Promise.all([syncQueue(), syncPagos()]);
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
    if (rerunRef.current && isOnlineRef.current) {
      rerunRef.current = false;
      await syncNow();
    }
    rerunRef.current = false;
  };

  // "online" del navegador no garantiza datos reales (señal débil): reintentar al volver a
  // primer plano y cada 30 s mientras queden pendientes.
  const pendingRef = useRef(pendingCount);
  useEffect(() => {
    isOnlineRef.current = isOnline;
    pendingRef.current = pendingCount;
  }, [isOnline, pendingCount]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && isOnlineRef.current) syncNow();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => {
      if (isOnlineRef.current && pendingRef.current > 0) syncNow();
    }, 30_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
