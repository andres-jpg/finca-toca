"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Wifi, WifiOff, Loader2, CheckSquare, Square, Pencil, Check, X, Search, Banknote } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { db, type FincaCacheRecord, type PagoLocalRecord } from "@/lib/offline/db";
import { addToSyncQueue } from "@/lib/offline/sync";
import { useOnline } from "@/hooks/useOnline";
import { useSyncQueue } from "@/hooks/useSyncQueue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
interface RutaConductorViewProps {
  itinerarioId: number;
  itinerarioNombre: string;
  userId: string;
}

function SyncDot({ status }: { status: string }) {
  if (status === "synced") return <span className="h-2 w-2 rounded-full bg-teal-500 shrink-0" />;
  if (status === "failed") return <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" />;
  return <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0 animate-pulse" />;
}

function ConnectionBadge({ isOnline, isSyncing }: { isOnline: boolean; isSyncing: boolean }) {
  if (!isOnline) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600">
        <span className="h-2 w-2 rounded-full bg-red-500" />
        Sin conexión
      </span>
    );
  }
  if (isSyncing) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-600">
        <Loader2 className="h-3 w-3 animate-spin" />
        Sincronizando...
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-600">
      <span className="h-2 w-2 rounded-full bg-teal-500" />
      Sincronizado
    </span>
  );
}

const OFFLINE_USER_KEY = "offlineUserId";

export function RutaConductorView({ itinerarioNombre, userId }: RutaConductorViewProps) {
  const isOnline = useOnline();
  const { pendingCount, isSyncing, syncNow } = useSyncQueue(isOnline);

  const [selectedFincaId, setSelectedFincaId] = useState<number | null>(null);
  const [fincaSearch, setFincaSearch] = useState("");
  const [fincaDropdownOpen, setFincaDropdownOpen] = useState(false);
  const fincaSearchRef = useRef<HTMLInputElement>(null);
  const fincaDropdownRef = useRef<HTMLDivElement>(null);
  const [litros, setLitros] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingCache, setIsLoadingCache] = useState(false);

  const [editingLocalId, setEditingLocalId] = useState<number | null>(null);
  const [editLitros, setEditLitros] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [markingPagoLocalId, setMarkingPagoLocalId] = useState<number | null>(null);

  const [today, setToday] = useState(() =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date())
  );

  // Cerrar dropdown al tocar fuera
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (
        fincaDropdownRef.current &&
        !fincaDropdownRef.current.contains(e.target as Node) &&
        fincaSearchRef.current &&
        !fincaSearchRef.current.contains(e.target as Node)
      ) {
        setFincaDropdownOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  // Actualizar la fecha cuando el conductor vuelve a la app (nuevo día)
  useEffect(() => {
    const checkDate = () => {
      const newDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
      setToday((prev) => (prev !== newDate ? newDate : prev));
    };
    document.addEventListener("visibilitychange", checkDate);
    return () => document.removeEventListener("visibilitychange", checkDate);
  }, []);

  // Limpiar IndexedDB si cambió el usuario logueado
  useEffect(() => {
    if (!userId) return;
    const lastUserId = localStorage.getItem(OFFLINE_USER_KEY);
    if (lastUserId && lastUserId !== userId) {
      db.transaction("rw", [db.fincasCache, db.recoleccionesLocal, db.syncQueue], async () => {
        await db.fincasCache.clear();
        await db.recoleccionesLocal.clear();
        await db.syncQueue.clear();
      });
    }
    localStorage.setItem(OFFLINE_USER_KEY, userId);
  // Solo al montar — userId no cambia durante la sesión
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fincas = useLiveQuery(
    () => db.fincasCache.toArray().then((rows) => rows.sort((a, b) => a.orden - b.orden)),
    [],
    undefined
  );
  const recoleccionesHoy = useLiveQuery(
    () =>
      db.recoleccionesLocal
        .toArray()
        .then((rows) =>
          rows.filter((r) => r.fecha === today).sort((a, b) => b.createdAt - a.createdAt)
        ),
    [today],
    []
  );

  // Pagos pendientes con responsable=conductor para la finca seleccionada
  const pagosPendientes = useLiveQuery(
    () =>
      selectedFincaId !== null
        ? db.pagosLocal
            .where("finca_id")
            .equals(selectedFincaId)
            .filter((p) => p.estado === "pendiente" && p.responsable === "conductor")
            .toArray()
        : Promise.resolve([] as PagoLocalRecord[]),
    [selectedFincaId],
    [] as PagoLocalRecord[]
  );

  // Cargar datos del servidor al montar (si hay conexión)
  useEffect(() => {
    if (!isOnline) return;
    // Si isOnline parpadea o "today" cambia (medianoche) antes de que esta respuesta
    // vuelva, una respuesta vieja podría resolver después de una más nueva y sobreescribir
    // el caché de fincas/precios con datos obsoletos. `ignore` descarta la respuesta si
    // el efecto ya se volvió a ejecutar.
    let ignore = false;
    setIsLoadingCache(true);

    fetch("/api/itinerario-data")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then(async (data) => {
        if (ignore) return;
        if (!data.itinerario) return;
        const fincasToCache: FincaCacheRecord[] = data.itinerario.fincas.map(
          (f: { id: number; nombre: string; precio_litro: number; orden: number }) => ({
            id: f.id,
            nombre: f.nombre,
            precio_litro: f.precio_litro,
            orden: f.orden,
            cachedAt: Date.now(),
          })
        );

        await db.transaction("rw", [db.fincasCache, db.recoleccionesLocal, db.pagosLocal], async () => {
          await db.fincasCache.clear();
          await db.fincasCache.bulkPut(fincasToCache);

          // Reconciliar registros ya sincronizados hoy
          for (const synced of data.syncedToday as { finca_id: number; serverId: number; litros: number; precio_litro: number; fecha: string }[]) {
            // Guard: descartar si el servidor devolvió datos de otro día (p.ej. respuesta cacheada)
            if (synced.fecha && synced.fecha !== today) continue;
            const existing = await db.recoleccionesLocal
              .where("[finca_id+fecha]")
              .equals([synced.finca_id, today])
              .first();
            if (!existing) {
              await db.recoleccionesLocal.add({
                finca_id: synced.finca_id,
                fecha: today,
                litros: synced.litros,
                precio_litro: synced.precio_litro,
                serverId: synced.serverId,
                syncStatus: "synced",
                createdAt: Date.now(),
                syncedAt: Date.now(),
              });
            } else if (existing.syncStatus === "synced" && existing.litros !== synced.litros) {
              // Actualizar litros si difieren (p.ej. editado desde otro dispositivo)
              await db.recoleccionesLocal.update(existing.localId!, {
                litros: synced.litros,
                precio_litro: synced.precio_litro,
                serverId: synced.serverId,
              });
            }
          }

          // Mergear pagos activos: insertar solo si no existen ya (para no sobreescribir pending)
          for (const pago of (data.pagosActivos ?? []) as { id: number; finca_id: number; fecha_inicio: string; fecha_fin: string; estado: string; responsable: string }[]) {
            const existing = await db.pagosLocal.where("serverId").equals(pago.id).first();
            if (!existing) {
              await db.pagosLocal.add({
                serverId: pago.id,
                finca_id: pago.finca_id,
                fecha_inicio: pago.fecha_inicio,
                fecha_fin: pago.fecha_fin,
                estado: pago.estado as PagoLocalRecord["estado"],
                responsable: pago.responsable as PagoLocalRecord["responsable"],
                fechaMarcadoLocal: null,
                syncStatus: "synced",
                cachedAt: Date.now(),
              });
            }
          }
        });
      })
      .catch(() => {
        // Silencioso — puede que offline
      })
      .finally(() => {
        if (!ignore) setIsLoadingCache(false);
      });

    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, today]);

  const fincasRegistradas = new Set(
    (recoleccionesHoy ?? [])
      .filter((r) => r.syncStatus !== "failed")
      .map((r) => r.finca_id)
  );

  const fincasRestantes = (fincas ?? []).filter((f) => !fincasRegistradas.has(f.id));
  const totalLitros = (recoleccionesHoy ?? []).reduce((sum, r) => sum + r.litros, 0);
  const total = fincas?.length ?? 0;
  const visitadas = fincasRegistradas.size;
  const allDone = total > 0 && fincasRestantes.length === 0;
  const progreso = total > 0 ? (visitadas / total) * 100 : 0;

  const handleSubmit = async () => {
    if (!selectedFincaId || litros === "" || parseFloat(litros) < 0) return;
    const finca = fincas?.find((f) => f.id === selectedFincaId);
    if (!finca) return;

    setIsSubmitting(true);
    try {
      const localId = await db.recoleccionesLocal.add({
        finca_id: selectedFincaId,
        fecha: today,
        litros: parseFloat(litros),
        precio_litro: finca.precio_litro,
        serverId: null,
        syncStatus: "pending",
        createdAt: Date.now(),
        syncedAt: null,
      });
      await addToSyncQueue(localId as number);
      if (isOnline) syncNow();

      // Auto-seleccionar la siguiente finca pendiente
      const nextFinca = fincasRestantes.find((f) => f.id !== selectedFincaId);
      setSelectedFincaId(nextFinca?.id ?? null);
      setFincaSearch(nextFinca?.nombre ?? "");
      setLitros("");
      toast.success(`${finca.nombre} registrada`);
    } catch {
      toast.error("Error al guardar la recolección");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMarcarPago = async (
    pagoLocalId: number,
    nuevoEstado: "pagado" | "punto_venta" | "devuelto"
  ) => {
    setMarkingPagoLocalId(pagoLocalId);
    try {
      const responsable =
        nuevoEstado === "punto_venta" ? "punto_venta" : ("conductor" as PagoLocalRecord["responsable"]);
      await db.pagosLocal.update(pagoLocalId, {
        estado: nuevoEstado,
        responsable,
        fechaMarcadoLocal: Date.now(),
        syncStatus: "pending",
      });
      if (isOnline) syncNow();
      toast.success(
        nuevoEstado === "pagado"
          ? "Pago marcado como pagado"
          : nuevoEstado === "punto_venta"
          ? "Dejado en punto de venta"
          : "Devuelto a secretaría"
      );
    } catch {
      toast.error("Error al marcar el pago");
    } finally {
      setMarkingPagoLocalId(null);
    }
  };

  const handleSaveEdit = async (localId: number) => {
    const val = parseFloat(editLitros);
    if (isNaN(val) || val < 0) return;
    setIsSavingEdit(true);
    try {
      await db.recoleccionesLocal.update(localId, { litros: val, syncStatus: "pending" });
      await addToSyncQueue(localId);
      if (isOnline) syncNow();
      setEditingLocalId(null);
      toast.success("Litros actualizados");
    } catch {
      toast.error("Error al actualizar");
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Pantalla de carga inicial (Dexie aún no respondió)
  if (fincas === undefined) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Cargando datos de ruta...</p>
      </div>
    );
  }

  // Sin caché y sin conexión
  if (fincas.length === 0 && !isOnline && !isLoadingCache) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center gap-3 px-4">
        <WifiOff className="h-10 w-10 text-muted-foreground" />
        <p className="text-base font-semibold text-gray-700">Sin datos de ruta</p>
        <p className="text-sm text-gray-500 max-w-sm">
          Necesitas conexión para descargar tu ruta por primera vez. Conéctate a internet y recarga
          la página.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Conductor — campo</p>
          <h2 className="text-lg font-semibold">{itinerarioNombre}</h2>
        </div>
        <ConnectionBadge isOnline={isOnline} isSyncing={isSyncing} />
      </div>

      {/* Banner offline con pendientes */}
      {!isOnline && pendingCount > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <Square className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Sin conexión. {pendingCount} {pendingCount === 1 ? "registro guardado" : "registros guardados"} localmente.
          </span>
        </div>
      )}

      {/* Banner ruta completada */}
      {allDone && pendingCount === 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-800">
          <CheckSquare className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Ruta completada. {recoleccionesHoy?.length ?? 0} registros sincronizados con el servidor.
          </span>
        </div>
      )}

      {/* Tarjetas de progreso */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-2xl font-bold">
              <span className="text-teal-600">{visitadas}</span>
              <span className="text-muted-foreground text-base font-normal">/{total}</span>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">fincas visitadas</p>
          </div>
          <div>
            <p className="text-2xl font-bold">
              <span className="text-teal-600">{totalLitros.toLocaleString("es-CO", { maximumFractionDigits: 0 })}</span>
              <span className="ml-1 text-base font-normal text-muted-foreground">L</span>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">litros acumulados</p>
          </div>
        </div>

        {/* Barra de progreso */}
        {total > 0 && (
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-teal-500 transition-all duration-300"
              style={{ width: `${progreso}%` }}
            />
          </div>
        )}
      </div>

      {/* Formulario de registro */}
      {allDone ? (
        <div className="space-y-3">
          <div>
            <Label className="text-sm text-muted-foreground mb-1.5 block">Finca</Label>
            <Input value="Todas las fincas registradas ✓" disabled className="text-muted-foreground" />
          </div>
          <div>
            <Label className="text-sm text-muted-foreground mb-1.5 block">Litros recolectados</Label>
            <Input value="—" disabled className="text-muted-foreground" />
          </div>
          <Button disabled className="w-full gap-2">
            <CheckSquare className="h-4 w-4" />
            Ruta finalizada
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <Label className="text-sm mb-1.5 block">Finca</Label>
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  ref={fincaSearchRef}
                  value={fincaSearch}
                  onChange={(e) => {
                    setFincaSearch(e.target.value);
                    setSelectedFincaId(null);
                    setFincaDropdownOpen(true);
                  }}
                  onFocus={() => setFincaDropdownOpen(true)}
                  placeholder="Buscar finca..."
                  disabled={isSubmitting}
                  autoComplete="off"
                  className="pl-9"
                />
              </div>
              {fincaDropdownOpen && (
                <div
                  ref={fincaDropdownRef}
                  className="absolute z-10 mt-1 w-full max-h-52 overflow-y-auto rounded-md border border-input bg-background shadow-md"
                >
                  {fincasRestantes
                    .filter((f) =>
                      f.nombre.toLowerCase().includes(fincaSearch.toLowerCase())
                    )
                    .map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onPointerDown={(e) => {
                          e.preventDefault();
                          setSelectedFincaId(f.id);
                          setFincaSearch(f.nombre);
                          setFincaDropdownOpen(false);
                        }}
                        className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent active:bg-accent/80 border-b border-border/50 last:border-0"
                      >
                        {f.nombre}
                      </button>
                    ))}
                  {fincasRestantes.filter((f) =>
                    f.nombre.toLowerCase().includes(fincaSearch.toLowerCase())
                  ).length === 0 && (
                    <p className="px-3 py-2.5 text-sm text-muted-foreground">Sin resultados</p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div>
            <Label className="text-sm mb-1.5 block">Litros recolectados</Label>
            <Input
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              value={litros}
              onChange={(e) => setLitros(e.target.value)}
              disabled={isSubmitting}
              className="text-lg text-center font-semibold h-14"
            />
          </div>

          {/* Bloque de pago — solo si hay pagos pendientes para la finca seleccionada */}
          {(pagosPendientes ?? []).map((pago) => {
            const fmtDate = (s: string) =>
              format(new Date(s + "T12:00:00"), "d MMM", { locale: es });
            const isMarking = markingPagoLocalId === pago.localId;
            return (
              <div
                key={pago.localId}
                className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium flex items-center gap-1.5">
                    <Banknote className="h-4 w-4 text-amber-600" />
                    Pago período {fmtDate(pago.fecha_inicio)}–{fmtDate(pago.fecha_fin)}
                  </span>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-200 text-amber-800">
                    Pendiente
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">Guíate por el desprendible impreso</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => handleMarcarPago(pago.localId!, "pagado")}
                    disabled={isMarking}
                  >
                    {isMarking ? <Loader2 className="h-3 w-3 animate-spin" /> : "Pagado"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleMarcarPago(pago.localId!, "punto_venta")}
                    disabled={isMarking}
                  >
                    P. venta
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleMarcarPago(pago.localId!, "devuelto")}
                    disabled={isMarking}
                  >
                    Devuelto
                  </Button>
                </div>
              </div>
            );
          })}

          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedFincaId || litros === "" || parseFloat(litros) < 0}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                {!isOnline && <WifiOff className="mr-2 h-4 w-4" />}
                Registrar recolección
              </>
            )}
          </Button>
        </div>
      )}

      {/* Lista de recolecciones registradas hoy */}
      {(recoleccionesHoy ?? []).length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Registradas hoy</p>
          <div className="space-y-2">
            {(recoleccionesHoy ?? []).map((rec) => {
              const finca = fincas?.find((f) => f.id === rec.finca_id);
              const isEditing = editingLocalId === rec.localId;
              return (
                <div key={rec.localId} className="rounded-lg border bg-card px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <SyncDot status={rec.syncStatus} />
                      <span className="text-sm font-medium truncate">
                        {finca?.nombre ?? `Finca ${rec.finca_id}`}
                      </span>
                    </div>

                    {isEditing ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Input
                          type="number"
                          inputMode="decimal"
                          value={editLitros}
                          onChange={(e) => setEditLitros(e.target.value)}
                          className="w-20 h-8 text-center text-sm"
                          disabled={isSavingEdit}
                          autoFocus
                        />
                        <Button
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => handleSaveEdit(rec.localId!)}
                          disabled={isSavingEdit || editLitros === "" || parseFloat(editLitros) < 0}
                        >
                          {isSavingEdit ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Check className="h-3 w-3" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          onClick={() => setEditingLocalId(null)}
                          disabled={isSavingEdit}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-semibold tabular-nums">
                          {rec.litros.toLocaleString("es-CO", { maximumFractionDigits: 1 })} L
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setEditingLocalId(rec.localId!);
                            setEditLitros(String(rec.litros));
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Icono de conexión en footer cuando online y sin pendientes */}
      {isOnline && pendingCount === 0 && !allDone && (
        <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1">
          <Wifi className="h-3 w-3" />
          Los registros se guardan en tiempo real
        </p>
      )}
    </div>
  );
}
