export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      animales: {
        Row: {
          alta: boolean
          created_at: string | null
          estado_productivo:
            | Database["public"]["Enums"]["estado_productivo"]
            | null
          estado_reproductivo:
            | Database["public"]["Enums"]["estado_reproductivo"]
            | null
          fecha_compra: string | null
          fecha_nacimiento: string | null
          id: string
          identificador: string
          madre_id: string | null
          nombre: string
          numero_registro: string | null
          origen: Database["public"]["Enums"]["vaca_origen"] | null
          padre_id: string | null
          padre_pajilla_nombre: string | null
          raza: Database["public"]["Enums"]["animal_raza"] | null
          sexo: Database["public"]["Enums"]["animal_sexo"]
        }
        Insert: {
          alta?: boolean
          created_at?: string | null
          estado_productivo?:
            | Database["public"]["Enums"]["estado_productivo"]
            | null
          estado_reproductivo?:
            | Database["public"]["Enums"]["estado_reproductivo"]
            | null
          fecha_compra?: string | null
          fecha_nacimiento?: string | null
          id?: string
          identificador: string
          madre_id?: string | null
          nombre: string
          numero_registro?: string | null
          origen?: Database["public"]["Enums"]["vaca_origen"] | null
          padre_id?: string | null
          padre_pajilla_nombre?: string | null
          raza?: Database["public"]["Enums"]["animal_raza"] | null
          sexo: Database["public"]["Enums"]["animal_sexo"]
        }
        Update: {
          alta?: boolean
          created_at?: string | null
          estado_productivo?:
            | Database["public"]["Enums"]["estado_productivo"]
            | null
          estado_reproductivo?:
            | Database["public"]["Enums"]["estado_reproductivo"]
            | null
          fecha_compra?: string | null
          fecha_nacimiento?: string | null
          id?: string
          identificador?: string
          madre_id?: string | null
          nombre?: string
          numero_registro?: string | null
          origen?: Database["public"]["Enums"]["vaca_origen"] | null
          padre_id?: string | null
          padre_pajilla_nombre?: string | null
          raza?: Database["public"]["Enums"]["animal_raza"] | null
          sexo?: Database["public"]["Enums"]["animal_sexo"]
        }
        Relationships: [
          {
            foreignKeyName: "animales_madre_id_fkey"
            columns: ["madre_id"]
            isOneToOne: false
            referencedRelation: "animales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "animales_padre_id_fkey"
            columns: ["padre_id"]
            isOneToOne: false
            referencedRelation: "animales"
            referencedColumns: ["id"]
          },
        ]
      }
      conceptos_gasto: {
        Row: {
          id: number
          nombre: string
        }
        Insert: {
          id?: never
          nombre: string
        }
        Update: {
          id?: never
          nombre?: string
        }
        Relationships: []
      }
      conceptos_ingreso: {
        Row: {
          id: number
          nombre: string
        }
        Insert: {
          id?: never
          nombre: string
        }
        Update: {
          id?: never
          nombre?: string
        }
        Relationships: []
      }
      eventos_animal: {
        Row: {
          animal_id: string
          animal_tipo: string
          created_at: string | null
          descripcion: string | null
          fecha: string
          id: string
          pajilla_toro_ref_id: string | null
          responsable: string | null
          resultado: string | null
          tipo_evento: string
          toro_id: string | null
        }
        Insert: {
          animal_id: string
          animal_tipo: string
          created_at?: string | null
          descripcion?: string | null
          fecha: string
          id?: string
          pajilla_toro_ref_id?: string | null
          responsable?: string | null
          resultado?: string | null
          tipo_evento: string
          toro_id?: string | null
        }
        Update: {
          animal_id?: string
          animal_tipo?: string
          created_at?: string | null
          descripcion?: string | null
          fecha?: string
          id?: string
          pajilla_toro_ref_id?: string | null
          responsable?: string | null
          resultado?: string | null
          tipo_evento?: string
          toro_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eventos_animal_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "animales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_animal_toro_id_fkey"
            columns: ["toro_id"]
            isOneToOne: false
            referencedRelation: "animales"
            referencedColumns: ["id"]
          },
        ]
      }
      extracciones_leche: {
        Row: {
          created_at: string
          fecha: string
          id: number
          litros: number
          vacas_en_produccion: number | null
        }
        Insert: {
          created_at?: string
          fecha: string
          id?: number
          litros: number
          vacas_en_produccion?: number | null
        }
        Update: {
          created_at?: string
          fecha?: string
          id?: number
          litros?: number
          vacas_en_produccion?: number | null
        }
        Relationships: []
      }
      fincas_cooperativa: {
        Row: {
          activa: boolean
          created_at: string
          id: number
          metodo_pago: string
          nombre: string
          precio_litro: number
        }
        Insert: {
          activa?: boolean
          created_at?: string
          id?: number
          metodo_pago?: string
          nombre: string
          precio_litro?: number
        }
        Update: {
          activa?: boolean
          created_at?: string
          id?: number
          metodo_pago?: string
          nombre?: string
          precio_litro?: number
        }
        Relationships: []
      }
      gastos: {
        Row: {
          created_at: string
          fecha: string
          id: number
          numero_factura: string | null
          observaciones: string | null
          pagado: boolean
          proveedor: string | null
          subconcepto_id: number | null
          valor: number
        }
        Insert: {
          created_at?: string
          fecha: string
          id?: number
          numero_factura?: string | null
          observaciones?: string | null
          pagado?: boolean
          proveedor?: string | null
          subconcepto_id?: number | null
          valor: number
        }
        Update: {
          created_at?: string
          fecha?: string
          id?: number
          numero_factura?: string | null
          observaciones?: string | null
          pagado?: boolean
          proveedor?: string | null
          subconcepto_id?: number | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "gastos_subconcepto_id_fkey"
            columns: ["subconcepto_id"]
            isOneToOne: false
            referencedRelation: "subconceptos_gasto"
            referencedColumns: ["id"]
          },
        ]
      }
      ingresos: {
        Row: {
          created_at: string
          fecha: string
          id: number
          observaciones: string | null
          source: string | null
          subconcepto_id: number
          valor: number
        }
        Insert: {
          created_at?: string
          fecha: string
          id?: number
          observaciones?: string | null
          source?: string | null
          subconcepto_id: number
          valor: number
        }
        Update: {
          created_at?: string
          fecha?: string
          id?: number
          observaciones?: string | null
          source?: string | null
          subconcepto_id?: number
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "ingresos_subconcepto_id_fkey"
            columns: ["subconcepto_id"]
            isOneToOne: false
            referencedRelation: "subconceptos_ingreso"
            referencedColumns: ["id"]
          },
        ]
      }
      itinerarios: {
        Row: {
          created_at: string
          id: number
          nombre: string
        }
        Insert: {
          created_at?: string
          id: number
          nombre: string
        }
        Update: {
          created_at?: string
          id?: number
          nombre?: string
        }
        Relationships: []
      }
      itinerarios_fincas: {
        Row: {
          finca_id: number
          itinerario_id: number
          orden: number
        }
        Insert: {
          finca_id: number
          itinerario_id: number
          orden?: number
        }
        Update: {
          finca_id?: number
          itinerario_id?: number
          orden?: number
        }
        Relationships: [
          {
            foreignKeyName: "itinerarios_fincas_finca_id_fkey"
            columns: ["finca_id"]
            isOneToOne: true
            referencedRelation: "fincas_cooperativa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerarios_fincas_itinerario_id_fkey"
            columns: ["itinerario_id"]
            isOneToOne: false
            referencedRelation: "itinerarios"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos: {
        Row: {
          banco: string | null
          forma_pago: string
          gasto_id: number
          id: number
          numero_cuenta: string | null
          tipo_cuenta: string | null
        }
        Insert: {
          banco?: string | null
          forma_pago: string
          gasto_id: number
          id?: never
          numero_cuenta?: string | null
          tipo_cuenta?: string | null
        }
        Update: {
          banco?: string | null
          forma_pago?: string
          gasto_id?: number
          id?: never
          numero_cuenta?: string | null
          tipo_cuenta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pagos_gasto_id_fkey"
            columns: ["gasto_id"]
            isOneToOne: true
            referencedRelation: "gastos"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos_finca: {
        Row: {
          activado_por: string | null
          created_at: string | null
          estado: string
          fecha_fin: string
          fecha_inicio: string
          fecha_marcado: string | null
          finca_id: number
          id: number
          itinerario_id: number | null
          litros: number
          marcado_por: string | null
          responsable: string
          updated_at: string | null
        }
        Insert: {
          activado_por?: string | null
          created_at?: string | null
          estado?: string
          fecha_fin: string
          fecha_inicio: string
          fecha_marcado?: string | null
          finca_id: number
          id?: number
          itinerario_id?: number | null
          litros?: number
          marcado_por?: string | null
          responsable?: string
          updated_at?: string | null
        }
        Update: {
          activado_por?: string | null
          created_at?: string | null
          estado?: string
          fecha_fin?: string
          fecha_inicio?: string
          fecha_marcado?: string | null
          finca_id?: number
          id?: number
          itinerario_id?: number | null
          litros?: number
          marcado_por?: string | null
          responsable?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pagos_finca_finca_id_fkey"
            columns: ["finca_id"]
            isOneToOne: false
            referencedRelation: "fincas_cooperativa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_finca_itinerario_id_fkey"
            columns: ["itinerario_id"]
            isOneToOne: false
            referencedRelation: "itinerarios"
            referencedColumns: ["id"]
          },
        ]
      }
      pajillas: {
        Row: {
          cantidad: number
          cantidad_disponible: number
          created_at: string
          fecha_compra: string
          id: string
          observaciones: string | null
          toro_nombre: string
          toro_ref_id: string
        }
        Insert: {
          cantidad: number
          cantidad_disponible: number
          created_at?: string
          fecha_compra: string
          id?: string
          observaciones?: string | null
          toro_nombre: string
          toro_ref_id: string
        }
        Update: {
          cantidad?: number
          cantidad_disponible?: number
          created_at?: string
          fecha_compra?: string
          id?: string
          observaciones?: string | null
          toro_nombre?: string
          toro_ref_id?: string
        }
        Relationships: []
      }
      precios: {
        Row: {
          created_at: string | null
          id: number
          tipo: string
          valor: number
        }
        Insert: {
          created_at?: string | null
          id?: number
          tipo?: string
          valor: number
        }
        Update: {
          created_at?: string | null
          id?: number
          tipo?: string
          valor?: number
        }
        Relationships: []
      }
      recolecciones: {
        Row: {
          created_at: string
          fecha: string
          finca_id: number
          id: number
          litros: number
          precio_litro: number
        }
        Insert: {
          created_at?: string
          fecha: string
          finca_id: number
          id?: number
          litros: number
          precio_litro: number
        }
        Update: {
          created_at?: string
          fecha?: string
          finca_id?: number
          id?: number
          litros?: number
          precio_litro?: number
        }
        Relationships: [
          {
            foreignKeyName: "recolecciones_finca_id_fkey"
            columns: ["finca_id"]
            isOneToOne: false
            referencedRelation: "fincas_cooperativa"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          id: number
          rol: Database["public"]["Enums"]["rol"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          rol: Database["public"]["Enums"]["rol"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: number
          rol?: Database["public"]["Enums"]["rol"]
          user_id?: string
        }
        Relationships: []
      }
      rutas_cooperativa: {
        Row: {
          created_at: string
          id: number
          nombre: string
        }
        Insert: {
          created_at?: string
          id?: number
          nombre: string
        }
        Update: {
          created_at?: string
          id?: number
          nombre?: string
        }
        Relationships: []
      }
      rutas_fincas: {
        Row: {
          finca_id: number
          orden: number
          ruta_id: number
        }
        Insert: {
          finca_id: number
          orden?: number
          ruta_id: number
        }
        Update: {
          finca_id?: number
          orden?: number
          ruta_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "rutas_fincas_finca_id_fkey"
            columns: ["finca_id"]
            isOneToOne: true
            referencedRelation: "fincas_cooperativa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rutas_fincas_ruta_id_fkey"
            columns: ["ruta_id"]
            isOneToOne: false
            referencedRelation: "rutas_cooperativa"
            referencedColumns: ["id"]
          },
        ]
      }
      subconceptos_gasto: {
        Row: {
          concepto_id: number
          id: number
          nombre: string
        }
        Insert: {
          concepto_id: number
          id?: never
          nombre: string
        }
        Update: {
          concepto_id?: number
          id?: never
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "subconceptos_gasto_concepto_id_fkey"
            columns: ["concepto_id"]
            isOneToOne: false
            referencedRelation: "conceptos_gasto"
            referencedColumns: ["id"]
          },
        ]
      }
      subconceptos_ingreso: {
        Row: {
          concepto_id: number
          id: number
          nombre: string
        }
        Insert: {
          concepto_id: number
          id?: never
          nombre: string
        }
        Update: {
          concepto_id?: number
          id?: never
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "subconceptos_ingreso_concepto_id_fkey"
            columns: ["concepto_id"]
            isOneToOne: false
            referencedRelation: "conceptos_ingreso"
            referencedColumns: ["id"]
          },
        ]
      }
      toros_legacy: {
        Row: {
          alta: boolean
          created_at: string | null
          estado: string | null
          fecha_compra: string | null
          fecha_nacimiento: string | null
          id: string
          madre_id: string | null
          nombre: string
          numero_registro: string | null
          origen: Database["public"]["Enums"]["vaca_origen"] | null
          padre_id: string | null
          toro_id: number
        }
        Insert: {
          alta?: boolean
          created_at?: string | null
          estado?: string | null
          fecha_compra?: string | null
          fecha_nacimiento?: string | null
          id?: string
          madre_id?: string | null
          nombre: string
          numero_registro?: string | null
          origen?: Database["public"]["Enums"]["vaca_origen"] | null
          padre_id?: string | null
          toro_id: number
        }
        Update: {
          alta?: boolean
          created_at?: string | null
          estado?: string | null
          fecha_compra?: string | null
          fecha_nacimiento?: string | null
          id?: string
          madre_id?: string | null
          nombre?: string
          numero_registro?: string | null
          origen?: Database["public"]["Enums"]["vaca_origen"] | null
          padre_id?: string | null
          toro_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "toros_madre_id_fkey"
            columns: ["madre_id"]
            isOneToOne: false
            referencedRelation: "vacas_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "toros_padre_id_fkey"
            columns: ["padre_id"]
            isOneToOne: false
            referencedRelation: "toros_legacy"
            referencedColumns: ["id"]
          },
        ]
      }
      user_itinerarios: {
        Row: {
          created_at: string
          itinerario_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          itinerario_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          itinerario_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_itinerarios_itinerario_id_fkey"
            columns: ["itinerario_id"]
            isOneToOne: false
            referencedRelation: "itinerarios"
            referencedColumns: ["id"]
          },
        ]
      }
      vacas_legacy: {
        Row: {
          alta: boolean
          created_at: string | null
          estado: Database["public"]["Enums"]["vaca_estado"] | null
          fecha_compra: string | null
          fecha_nacimiento: string | null
          id: string
          madre_id: string | null
          nombre: string
          numero_registro: string | null
          origen: Database["public"]["Enums"]["vaca_origen"] | null
          padre_id: string | null
          padre_pajilla_nombre: string | null
          vaca_id: string
        }
        Insert: {
          alta?: boolean
          created_at?: string | null
          estado?: Database["public"]["Enums"]["vaca_estado"] | null
          fecha_compra?: string | null
          fecha_nacimiento?: string | null
          id?: string
          madre_id?: string | null
          nombre: string
          numero_registro?: string | null
          origen?: Database["public"]["Enums"]["vaca_origen"] | null
          padre_id?: string | null
          padre_pajilla_nombre?: string | null
          vaca_id: string
        }
        Update: {
          alta?: boolean
          created_at?: string | null
          estado?: Database["public"]["Enums"]["vaca_estado"] | null
          fecha_compra?: string | null
          fecha_nacimiento?: string | null
          id?: string
          madre_id?: string | null
          nombre?: string
          numero_registro?: string | null
          origen?: Database["public"]["Enums"]["vaca_origen"] | null
          padre_id?: string | null
          padre_pajilla_nombre?: string | null
          vaca_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vacas_madre_id_fkey"
            columns: ["madre_id"]
            isOneToOne: false
            referencedRelation: "vacas_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacas_padre_id_fkey"
            columns: ["padre_id"]
            isOneToOne: false
            referencedRelation: "toros_legacy"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_cooperativa_users: {
        Args: never
        Returns: {
          email: string
          itinerario_id: number
          itinerario_nombre: string
          rol: string
          user_id: string
        }[]
      }
    }
    Enums: {
      animal_raza: "holstein" | "jersey" | "jerholm" | "normando"
      animal_sexo: "hembra" | "macho"
      estado_productivo:
        | "leche"
        | "levante_1"
        | "levante_2"
        | "produccion"
        | "secado"
        | "reproductor"
      estado_reproductivo:
        | "vacia"
        | "pre_servicio"
        | "por_confirmar"
        | "rechequeo"
        | "cargada"
      rol:
        | "admin"
        | "user"
        | "cooperativa_admin"
        | "cooperativa_user"
        | "viewer"
      vaca_estado:
        | "produccion"
        | "secado"
        | "pre_jardin"
        | "jardin"
        | "transicion"
      vaca_origen: "finca" | "externa"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      animal_raza: ["holstein", "jersey", "jerholm", "normando"],
      animal_sexo: ["hembra", "macho"],
      estado_productivo: [
        "leche",
        "levante_1",
        "levante_2",
        "produccion",
        "secado",
        "reproductor",
      ],
      estado_reproductivo: [
        "vacia",
        "pre_servicio",
        "por_confirmar",
        "rechequeo",
        "cargada",
      ],
      rol: ["admin", "user", "cooperativa_admin", "cooperativa_user", "viewer"],
      vaca_estado: [
        "produccion",
        "secado",
        "pre_jardin",
        "jardin",
        "transicion",
      ],
      vaca_origen: ["finca", "externa"],
    },
  },
} as const
