import type { Database } from "@/lib/supabase/database.types";
import type { NivelTueste } from "../lotes/types";

/** Fila de `cafe.perfil_tueste_tipo`. */
export type PerfilTuesteFila = Database["cafe"]["Tables"]["perfil_tueste_tipo"]["Row"];

/**
 * Una versión del perfil de tueste de un tipo de café (B-18). `tipoCafeId = null` es el perfil predeterminado de
 * maquila (servicios a terceros). `vigenteDesde` es `YYYY-MM-DD`.
 */
export interface PerfilTuesteTipo {
  id: string;
  tipoCafeId: string | null;
  nivel: NivelTueste;
  tempC: number;
  tiempoMin: number;
  vigenteDesde: string;
}
