
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "cafe": {
          Tables: {
            "baches": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"merma_pct": number | null,"numero": number,"observaciones": string | null,"peso_entrada_kg": number,"peso_salida_kg": number,"proceso_id": string,"temperatura_c": number | null,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"merma_pct"?: never,"numero": number,"observaciones"?: string | null,"peso_entrada_kg": number,"peso_salida_kg": number,"proceso_id": string,"temperatura_c"?: number | null,"tenant_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"merma_pct"?: never,"numero"?: number,"observaciones"?: string | null,"peso_entrada_kg"?: number,"peso_salida_kg"?: number,"proceso_id"?: string,"temperatura_c"?: number | null,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "baches_proceso_fk"
      columns: ["tenant_id","proceso_id"]
isOneToOne: false
      referencedRelation: "procesos"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"empaque_lineas": {
                  Row: {
                    "articulo_pt_id": string,"created_at": string,"created_by": string | null,"id": string,"presentacion_g": number,"proceso_id": string,"tenant_id": string,"unidades": number
                  }
                  ComputedFields: never
                  Insert: {
                    "articulo_pt_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"presentacion_g": number,"proceso_id": string,"tenant_id"?: string,"unidades": number
                  }
                  Update: {
                    "articulo_pt_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"presentacion_g"?: number,"proceso_id"?: string,"tenant_id"?: string,"unidades"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "empaque_lineas_proceso_fk"
      columns: ["tenant_id","proceso_id"]
isOneToOne: false
      referencedRelation: "procesos"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"lote_bultos": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"lote_id": string,"numero": number,"peso_kg": number,"tenant_id": string,"updated_at": string | null,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"lote_id": string,"numero": number,"peso_kg": number,"tenant_id"?: string,"updated_at"?: string | null,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"lote_id"?: string,"numero"?: number,"peso_kg"?: number,"tenant_id"?: string,"updated_at"?: string | null,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "lote_bultos_lote_fk"
      columns: ["tenant_id","lote_id"]
isOneToOne: false
      referencedRelation: "lotes"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "lote_bultos_lote_fk"
      columns: ["tenant_id","lote_id"]
isOneToOne: false
      referencedRelation: "v_lotes"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"lotes": {
                  Row: {
                    "alertas_calidad": (string)[],"anulado_at": string | null,"anulado_por": string | null,"codigo": string,"created_at": string,"created_by": string | null,"densidad": number | null,"factura_proveedor": string | null,"fecha_recepcion": string,"humedad_pct": number | null,"id": string,"linea": Database["cafe"]['Enums']["linea_lote"],"motivo_anulacion": string | null,"nivel_tueste": Database["cafe"]['Enums']["nivel_tueste"] | null,"num_bultos": number,"observaciones": string | null,"peso_recibido_kg": number,"precio_compra_kg": number | null,"rangos_calidad": Json | null,"servicios": (Database["cafe"]['Enums']["tipo_proceso"])[],"tenant_id": string,"tercero_id": string,"tipo_cafe_id": string | null,"updated_at": string | null,"updated_by": string | null,"valor_compra": number | null,"servicios_requeridos": (Database["cafe"]['Enums']["tipo_proceso"])[] | null
                  }
                  ComputedFields: "servicios_requeridos"
                  Insert: {
                    "alertas_calidad"?: (string)[],"anulado_at"?: string | null,"anulado_por"?: string | null,"codigo": string,"created_at"?: string,"created_by"?: string | null,"densidad"?: number | null,"factura_proveedor"?: string | null,"fecha_recepcion": string,"humedad_pct"?: number | null,"id"?: string,"linea": Database["cafe"]['Enums']["linea_lote"],"motivo_anulacion"?: string | null,"nivel_tueste"?: Database["cafe"]['Enums']["nivel_tueste"] | null,"num_bultos": number,"observaciones"?: string | null,"peso_recibido_kg": number,"precio_compra_kg"?: number | null,"rangos_calidad"?: Json | null,"servicios"?: (Database["cafe"]['Enums']["tipo_proceso"])[],"tenant_id"?: string,"tercero_id": string,"tipo_cafe_id"?: string | null,"updated_at"?: string | null,"updated_by"?: string | null,"valor_compra"?: never
                  }
                  Update: {
                    "alertas_calidad"?: (string)[],"anulado_at"?: string | null,"anulado_por"?: string | null,"codigo"?: string,"created_at"?: string,"created_by"?: string | null,"densidad"?: number | null,"factura_proveedor"?: string | null,"fecha_recepcion"?: string,"humedad_pct"?: number | null,"id"?: string,"linea"?: Database["cafe"]['Enums']["linea_lote"],"motivo_anulacion"?: string | null,"nivel_tueste"?: Database["cafe"]['Enums']["nivel_tueste"] | null,"num_bultos"?: number,"observaciones"?: string | null,"peso_recibido_kg"?: number,"precio_compra_kg"?: number | null,"rangos_calidad"?: Json | null,"servicios"?: (Database["cafe"]['Enums']["tipo_proceso"])[],"tenant_id"?: string,"tercero_id"?: string,"tipo_cafe_id"?: string | null,"updated_at"?: string | null,"updated_by"?: string | null,"valor_compra"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "lotes_tipo_cafe_fk"
      columns: ["tenant_id","tipo_cafe_id"]
isOneToOne: false
      referencedRelation: "tipos_cafe"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"proceso_bultos": {
                  Row: {
                    "bulto_id": string,"created_at": string,"created_by": string | null,"id": string,"lote_id": string,"proceso_id": string,"tenant_id": string,"tipo": Database["cafe"]['Enums']["tipo_proceso"]
                  }
                  ComputedFields: never
                  Insert: {
                    "bulto_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"lote_id": string,"proceso_id": string,"tenant_id"?: string,"tipo": Database["cafe"]['Enums']["tipo_proceso"]
                  }
                  Update: {
                    "bulto_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"lote_id"?: string,"proceso_id"?: string,"tenant_id"?: string,"tipo"?: Database["cafe"]['Enums']["tipo_proceso"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "proceso_bultos_bulto_fk"
      columns: ["tenant_id","lote_id","bulto_id"]
isOneToOne: false
      referencedRelation: "lote_bultos"
      referencedColumns: ["tenant_id","lote_id","id"]
    },{
      foreignKeyName: "proceso_bultos_bulto_fk"
      columns: ["tenant_id","lote_id","bulto_id"]
isOneToOne: false
      referencedRelation: "v_bultos_estado"
      referencedColumns: ["tenant_id","lote_id","bulto_id"]
    },{
      foreignKeyName: "proceso_bultos_proceso_fk"
      columns: ["tenant_id","proceso_id","tipo","lote_id"]
isOneToOne: false
      referencedRelation: "procesos"
      referencedColumns: ["tenant_id","id","tipo","lote_id"]
    }
                  ]
                },"procesos": {
                  Row: {
                    "anulado_at": string | null,"anulado_por": string | null,"created_at": string,"created_by": string | null,"desvio": boolean | null,"fecha": string,"id": string,"lote_id": string,"merma_kg": number | null,"merma_pct": number | null,"merma_referencia_pct": number | null,"motivo_anulacion": string | null,"nivel_tueste": Database["cafe"]['Enums']["nivel_tueste"] | null,"observaciones": string | null,"peso_entrada_kg": number,"peso_salida_kg": number,"reapertura_id": string | null,"tarifa_kg": number,"tenant_id": string,"tipo": Database["cafe"]['Enums']["tipo_proceso"],"tolerancia_pts": number | null,"updated_at": string | null,"updated_by": string | null,"valor": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "anulado_at"?: string | null,"anulado_por"?: string | null,"created_at"?: string,"created_by"?: string | null,"desvio"?: never,"fecha": string,"id"?: string,"lote_id": string,"merma_kg"?: never,"merma_pct"?: never,"merma_referencia_pct"?: number | null,"motivo_anulacion"?: string | null,"nivel_tueste"?: Database["cafe"]['Enums']["nivel_tueste"] | null,"observaciones"?: string | null,"peso_entrada_kg": number,"peso_salida_kg": number,"reapertura_id"?: string | null,"tarifa_kg"?: number,"tenant_id"?: string,"tipo": Database["cafe"]['Enums']["tipo_proceso"],"tolerancia_pts"?: number | null,"updated_at"?: string | null,"updated_by"?: string | null,"valor"?: never
                  }
                  Update: {
                    "anulado_at"?: string | null,"anulado_por"?: string | null,"created_at"?: string,"created_by"?: string | null,"desvio"?: never,"fecha"?: string,"id"?: string,"lote_id"?: string,"merma_kg"?: never,"merma_pct"?: never,"merma_referencia_pct"?: number | null,"motivo_anulacion"?: string | null,"nivel_tueste"?: Database["cafe"]['Enums']["nivel_tueste"] | null,"observaciones"?: string | null,"peso_entrada_kg"?: number,"peso_salida_kg"?: number,"reapertura_id"?: string | null,"tarifa_kg"?: number,"tenant_id"?: string,"tipo"?: Database["cafe"]['Enums']["tipo_proceso"],"tolerancia_pts"?: number | null,"updated_at"?: string | null,"updated_by"?: string | null,"valor"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "procesos_lote_fk"
      columns: ["tenant_id","lote_id"]
isOneToOne: false
      referencedRelation: "lotes"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "procesos_lote_fk"
      columns: ["tenant_id","lote_id"]
isOneToOne: false
      referencedRelation: "v_lotes"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"remisiones": {
                  Row: {
                    "anulada_at": string | null,"anulada_por": string | null,"cliente_identificacion": string | null,"cliente_nombre": string,"created_at": string,"created_by": string | null,"detalle": NonNullable<Json>,"fecha": string,"forzada": boolean,"id": string,"lote_codigo": string,"lote_id": string,"merma_total_kg": number | null,"merma_total_pct": number | null,"motivo_anulacion": string | null,"numero": string,"observaciones": string | null,"peso_entregado_kg": number,"peso_recibido_kg": number,"recibido_por": string | null,"tenant_id": string,"tercero_id": string,"updated_at": string | null,"updated_by": string | null,"valor_servicios": number
                  }
                  ComputedFields: never
                  Insert: {
                    "anulada_at"?: string | null,"anulada_por"?: string | null,"cliente_identificacion"?: string | null,"cliente_nombre": string,"created_at"?: string,"created_by"?: string | null,"detalle": NonNullable<Json>,"fecha": string,"forzada"?: boolean,"id"?: string,"lote_codigo": string,"lote_id": string,"merma_total_kg"?: never,"merma_total_pct"?: never,"motivo_anulacion"?: string | null,"numero": string,"observaciones"?: string | null,"peso_entregado_kg": number,"peso_recibido_kg": number,"recibido_por"?: string | null,"tenant_id"?: string,"tercero_id": string,"updated_at"?: string | null,"updated_by"?: string | null,"valor_servicios": number
                  }
                  Update: {
                    "anulada_at"?: string | null,"anulada_por"?: string | null,"cliente_identificacion"?: string | null,"cliente_nombre"?: string,"created_at"?: string,"created_by"?: string | null,"detalle"?: NonNullable<Json>,"fecha"?: string,"forzada"?: boolean,"id"?: string,"lote_codigo"?: string,"lote_id"?: string,"merma_total_kg"?: never,"merma_total_pct"?: never,"motivo_anulacion"?: string | null,"numero"?: string,"observaciones"?: string | null,"peso_entregado_kg"?: number,"peso_recibido_kg"?: number,"recibido_por"?: string | null,"tenant_id"?: string,"tercero_id"?: string,"updated_at"?: string | null,"updated_by"?: string | null,"valor_servicios"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "remisiones_lote_fk"
      columns: ["tenant_id","lote_id"]
isOneToOne: false
      referencedRelation: "lotes"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "remisiones_lote_fk"
      columns: ["tenant_id","lote_id"]
isOneToOne: false
      referencedRelation: "v_lotes"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"tipos_cafe": {
                  Row: {
                    "activo": boolean,"created_at": string,"created_by": string | null,"id": string,"nombre": string,"orden": number,"tenant_id": string,"updated_at": string | null,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"nombre": string,"orden"?: number,"tenant_id"?: string,"updated_at"?: string | null,"updated_by"?: string | null
                  }
                  Update: {
                    "activo"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"nombre"?: string,"orden"?: number,"tenant_id"?: string,"updated_at"?: string | null,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "v_bultos_estado": {
                  Row: {
                    "bulto_id": string,"lote_id": string,"numero": number,"pasos": (Database["cafe"]['Enums']["tipo_proceso"])[] | null,"peso_actual_exacto_kg": number | null,"peso_actual_kg": number | null,"peso_kg": number,"tenant_id": string,"ultimo_tipo": Database["cafe"]['Enums']["tipo_proceso"] | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "lote_bultos_lote_fk"
      columns: ["tenant_id","lote_id"]
isOneToOne: false
      referencedRelation: "lotes"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "lote_bultos_lote_fk"
      columns: ["tenant_id","lote_id"]
isOneToOne: false
      referencedRelation: "v_lotes"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"v_lote_etapas": {
                  Row: {
                    "bultos_procesados": number | null,"bultos_total": number | null,"completo": boolean | null,"desvios": number | null,"lote_id": string,"merma_kg": number | null,"merma_pct": number | null,"num_procesos": number | null,"parcial": boolean | null,"peso_entrada": number | null,"peso_salida": number | null,"tenant_id": string,"tipo": Database["cafe"]['Enums']["tipo_proceso"],"ultima_fecha": string | null,"valor": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "procesos_lote_fk"
      columns: ["tenant_id","lote_id"]
isOneToOne: false
      referencedRelation: "lotes"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "procesos_lote_fk"
      columns: ["tenant_id","lote_id"]
isOneToOne: false
      referencedRelation: "v_lotes"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"v_lotes": {
                  Row: {
                    "alertas_calidad": (string)[],"anulado_at": string | null,"anulado_por": string | null,"avance_texto": string | null,"codigo": string,"created_at": string,"created_by": string | null,"densidad": number | null,"estado": string | null,"factura_proveedor": string | null,"fecha_recepcion": string,"humedad_pct": number | null,"id": string,"linea": Database["cafe"]['Enums']["linea_lote"],"merma_total_kg": number | null,"merma_total_pct": number | null,"motivo_anulacion": string | null,"nivel_tueste": Database["cafe"]['Enums']["nivel_tueste"] | null,"num_bultos": number,"observaciones": string | null,"peso_actual_kg": number | null,"peso_recibido_kg": number,"precio_compra_kg": number | null,"rangos_calidad": Json | null,"servicios": (Database["cafe"]['Enums']["tipo_proceso"])[],"servicios_completados": number | null,"servicios_requeridos": (Database["cafe"]['Enums']["tipo_proceso"])[] | null,"tenant_id": string,"tercero_id": string,"tercero_identificacion": string | null,"tercero_nombre": string | null,"tiene_desvio": boolean | null,"tipo_cafe_id": string | null,"tipo_cafe_nombre": string | null,"valor_compra": number | null,"valor_servicios": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "lotes_tipo_cafe_fk"
      columns: ["tenant_id","tipo_cafe_id"]
isOneToOne: false
      referencedRelation: "tipos_cafe"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"v_proceso_bultos_peso": {
                  Row: {
                    "bulto_id": string,"entrada_bulto_kg": number | null,"lote_id": string,"numero": number,"peso_bulto_kg": number,"proceso_id": string,"salida_bulto_kg": number | null,"tenant_id": string,"tipo": Database["cafe"]['Enums']["tipo_proceso"]
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "proceso_bultos_bulto_fk"
      columns: ["tenant_id","lote_id","bulto_id"]
isOneToOne: false
      referencedRelation: "lote_bultos"
      referencedColumns: ["tenant_id","lote_id","id"]
    },{
      foreignKeyName: "proceso_bultos_bulto_fk"
      columns: ["tenant_id","lote_id","bulto_id"]
isOneToOne: false
      referencedRelation: "v_bultos_estado"
      referencedColumns: ["tenant_id","lote_id","bulto_id"]
    },{
      foreignKeyName: "proceso_bultos_proceso_fk"
      columns: ["tenant_id","proceso_id","tipo","lote_id"]
isOneToOne: false
      referencedRelation: "procesos"
      referencedColumns: ["tenant_id","id","tipo","lote_id"]
    }
                  ]
                }
          }
          Functions: {
            "_insertar_proceso":
{ Args: { "p_baches": Json,"p_bultos": (string)[],"p_entrada": number,"p_fecha": string,"p_lote": string,"p_nivel": Database["cafe"]['Enums']["nivel_tueste"],"p_observaciones": string,"p_salida": number,"p_tipo": Database["cafe"]['Enums']["tipo_proceso"] }; Returns: Json
                           },
"anular_proceso":
{ Args: { "p_motivo": string,"p_proceso": string }; Returns: Json
                           },
"anular_remision":
{ Args: { "p_motivo": string,"p_remision": string }; Returns: Json
                           },
"asegurar_productos_terminados":
{ Args: { "p_tenant"?: string }; Returns: number
                           },
"etiqueta_presentacion":
{ Args: { "p_gramos": number }; Returns: string
                           },
"generar_remision":
{ Args: { "p": Json }; Returns: Json
                           },
"instante_fecha":
{ Args: { "p_fecha": string }; Returns: string
                           },
"orden_proceso":
{ Args: { "t": Database["cafe"]['Enums']["tipo_proceso"] }; Returns: number
                           },
"orden_ultimo_proceso":
{ Args: { "p_lote": string }; Returns: number
                           },
"parametro_numero":
{ Args: { "p_clave": string,"p_default": number }; Returns: number
                           },
"paso_previo":
{ Args: { "p_bulto"?: string,"p_lote": string,"p_tipo": Database["cafe"]['Enums']["tipo_proceso"] }; Returns: Database["cafe"]['Enums']["tipo_proceso"]
                           },
"pasos_del_lote":
{ Args: { "p_lote": string }; Returns: (Database["cafe"]['Enums']["tipo_proceso"])[]
                           },
"peso_disponible":
{ Args: { "p_bultos": (string)[],"p_lote": string,"p_tipo": Database["cafe"]['Enums']["tipo_proceso"] }; Returns: number
                           },
"rango_calidad":
{ Args: { "p_clave": string }; Returns: Json
                           },
"registrar_compra":
{ Args: { "p": Json }; Returns: Json
                           },
"registrar_empaque":
{ Args: { "p": Json }; Returns: Json
                           },
"registrar_proceso":
{ Args: { "p": Json }; Returns: Json
                           },
"registrar_recepcion":
{ Args: { "p": Json }; Returns: Json
                           },
"registrar_salida_pt":
{ Args: { "p": Json }; Returns: Json
                           },
"repartir_peso":
{ Args: { "p_n": number,"p_total": number }; Returns: (number)[]
                           },
"responsables_lote":
{ Args: { "p_lote": string }; Returns: {
              "email": string,"user_id": string
            }[]
                           },
"servicios_requeridos":
{ Args: { "l": Omit<Database["cafe"]['Tables']["lotes"]['Row'], Database["cafe"]['Tables']["lotes"]['ComputedFields']> }; Returns: (Database["cafe"]['Enums']["tipo_proceso"])[]
                           },
"sugerir_baches":
{ Args: { "p_peso": number }; Returns: Json
                           },
"ultimo_precio_compra":
{ Args: { "p_tercero": string,"p_tipo": string }; Returns: number
                           },
"verificar_baches_proceso":
{ Args: { "p_proceso": string }; Returns: undefined
                           },
"verificar_bultos_lote":
{ Args: { "p_lote": string }; Returns: undefined
                           }
          }
          Enums: {
            "linea_lote": "marca_propia"|"servicio","nivel_tueste": "bajo"|"medio"|"alto","tipo_proceso": "trilla"|"tostion"|"molienda"|"empaque"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "animales": {
                  Row: {
                    "alta": boolean,"concentrado_por_ordeno": number | null,"created_at": string | null,"estado_productivo": Database["public"]['Enums']["estado_productivo"] | null,"estado_reproductivo": Database["public"]['Enums']["estado_reproductivo"] | null,"fecha_compra": string | null,"fecha_nacimiento": string | null,"id": string,"identificador": string,"madre_externa_nombre": string | null,"madre_id": string | null,"nombre": string,"nombre_largo": string | null,"numero_registro": string | null,"origen": Database["public"]['Enums']["vaca_origen"] | null,"padre_alquiler_nombre": string | null,"padre_alquiler_raza": Database["public"]['Enums']["animal_raza"] | null,"padre_id": string | null,"padre_pajilla_nombre": string | null,"raza": Database["public"]['Enums']["animal_raza"] | null,"sangre": string | null,"sexo": Database["public"]['Enums']["animal_sexo"],"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alta"?: boolean,"concentrado_por_ordeno"?: number | null,"created_at"?: string | null,"estado_productivo"?: Database["public"]['Enums']["estado_productivo"] | null,"estado_reproductivo"?: Database["public"]['Enums']["estado_reproductivo"] | null,"fecha_compra"?: string | null,"fecha_nacimiento"?: string | null,"id"?: string,"identificador": string,"madre_externa_nombre"?: string | null,"madre_id"?: string | null,"nombre": string,"nombre_largo"?: string | null,"numero_registro"?: string | null,"origen"?: Database["public"]['Enums']["vaca_origen"] | null,"padre_alquiler_nombre"?: string | null,"padre_alquiler_raza"?: Database["public"]['Enums']["animal_raza"] | null,"padre_id"?: string | null,"padre_pajilla_nombre"?: string | null,"raza"?: Database["public"]['Enums']["animal_raza"] | null,"sangre"?: string | null,"sexo": Database["public"]['Enums']["animal_sexo"],"tenant_id"?: string
                  }
                  Update: {
                    "alta"?: boolean,"concentrado_por_ordeno"?: number | null,"created_at"?: string | null,"estado_productivo"?: Database["public"]['Enums']["estado_productivo"] | null,"estado_reproductivo"?: Database["public"]['Enums']["estado_reproductivo"] | null,"fecha_compra"?: string | null,"fecha_nacimiento"?: string | null,"id"?: string,"identificador"?: string,"madre_externa_nombre"?: string | null,"madre_id"?: string | null,"nombre"?: string,"nombre_largo"?: string | null,"numero_registro"?: string | null,"origen"?: Database["public"]['Enums']["vaca_origen"] | null,"padre_alquiler_nombre"?: string | null,"padre_alquiler_raza"?: Database["public"]['Enums']["animal_raza"] | null,"padre_id"?: string | null,"padre_pajilla_nombre"?: string | null,"raza"?: Database["public"]['Enums']["animal_raza"] | null,"sangre"?: string | null,"sexo"?: Database["public"]['Enums']["animal_sexo"],"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "animales_madre_id_fkey"
      columns: ["madre_id"]
isOneToOne: false
      referencedRelation: "animales"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "animales_padre_id_fkey"
      columns: ["padre_id"]
isOneToOne: false
      referencedRelation: "animales"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "animales_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"arriendos": {
                  Row: {
                    "arrendatario": string,"canon": number,"created_at": string,"fecha_fin": string,"fecha_inicio": string,"finca_nombre": string,"id": string,"observaciones": string | null,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "arrendatario": string,"canon": number,"created_at"?: string,"fecha_fin": string,"fecha_inicio": string,"finca_nombre": string,"id"?: string,"observaciones"?: string | null,"tenant_id"?: string
                  }
                  Update: {
                    "arrendatario"?: string,"canon"?: number,"created_at"?: string,"fecha_fin"?: string,"fecha_inicio"?: string,"finca_nombre"?: string,"id"?: string,"observaciones"?: string | null,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "arriendos_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"arriendos_abonos": {
                  Row: {
                    "arriendo_id": string,"created_at": string,"fecha": string,"gasto_id": number | null,"id": string,"observaciones": string | null,"tenant_id": string,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "arriendo_id": string,"created_at"?: string,"fecha": string,"gasto_id"?: number | null,"id"?: string,"observaciones"?: string | null,"tenant_id"?: string,"valor": number
                  }
                  Update: {
                    "arriendo_id"?: string,"created_at"?: string,"fecha"?: string,"gasto_id"?: number | null,"id"?: string,"observaciones"?: string | null,"tenant_id"?: string,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "arriendos_abonos_arriendo_id_fkey"
      columns: ["arriendo_id"]
isOneToOne: false
      referencedRelation: "arriendos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "arriendos_abonos_gasto_id_fkey"
      columns: ["gasto_id"]
isOneToOne: false
      referencedRelation: "gastos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "arriendos_abonos_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"articulos": {
                  Row: {
                    "activo": boolean,"atributos": NonNullable<Json>,"codigo": string | null,"created_at": string,"created_by": string | null,"id": string,"nombre": string,"stock_minimo": number | null,"tenant_id": string,"tipo": Database["public"]['Enums']["tipo_articulo"],"unidad": string,"updated_at": string | null,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"atributos"?: NonNullable<Json>,"codigo"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"nombre": string,"stock_minimo"?: number | null,"tenant_id"?: string,"tipo": Database["public"]['Enums']["tipo_articulo"],"unidad"?: string,"updated_at"?: string | null,"updated_by"?: string | null
                  }
                  Update: {
                    "activo"?: boolean,"atributos"?: NonNullable<Json>,"codigo"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"nombre"?: string,"stock_minimo"?: number | null,"tenant_id"?: string,"tipo"?: Database["public"]['Enums']["tipo_articulo"],"unidad"?: string,"updated_at"?: string | null,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "articulos_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"conceptos_gasto": {
                  Row: {
                    "id": number,"nombre": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: never,"nombre": string,"tenant_id"?: string
                  }
                  Update: {
                    "id"?: never,"nombre"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "conceptos_gasto_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"conceptos_ingreso": {
                  Row: {
                    "id": number,"nombre": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: never,"nombre": string,"tenant_id"?: string
                  }
                  Update: {
                    "id"?: never,"nombre"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "conceptos_ingreso_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"consecutivos": {
                  Row: {
                    "anio": number,"serie": string,"tenant_id": string,"ultimo": number
                  }
                  ComputedFields: never
                  Insert: {
                    "anio": number,"serie": string,"tenant_id": string,"ultimo"?: number
                  }
                  Update: {
                    "anio"?: number,"serie"?: string,"tenant_id"?: string,"ultimo"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "consecutivos_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "consecutivos_tenant_id_serie_fkey"
      columns: ["tenant_id","serie"]
isOneToOne: false
      referencedRelation: "series_consecutivo"
      referencedColumns: ["tenant_id","serie"]
    }
                  ]
                },"eventos_animal": {
                  Row: {
                    "animal_id": string,"animal_tipo": string,"created_at": string | null,"descripcion": string | null,"fecha": string,"fecha_revacunacion": string | null,"id": string,"pajilla_id": string | null,"periodo_revacunacion": string | null,"requiere_revacunacion": boolean | null,"responsable": string | null,"resultado": string | null,"tenant_id": string,"tipo_evento": string,"toro_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "animal_id": string,"animal_tipo": string,"created_at"?: string | null,"descripcion"?: string | null,"fecha": string,"fecha_revacunacion"?: string | null,"id"?: string,"pajilla_id"?: string | null,"periodo_revacunacion"?: string | null,"requiere_revacunacion"?: boolean | null,"responsable"?: string | null,"resultado"?: string | null,"tenant_id"?: string,"tipo_evento": string,"toro_id"?: string | null
                  }
                  Update: {
                    "animal_id"?: string,"animal_tipo"?: string,"created_at"?: string | null,"descripcion"?: string | null,"fecha"?: string,"fecha_revacunacion"?: string | null,"id"?: string,"pajilla_id"?: string | null,"periodo_revacunacion"?: string | null,"requiere_revacunacion"?: boolean | null,"responsable"?: string | null,"resultado"?: string | null,"tenant_id"?: string,"tipo_evento"?: string,"toro_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "eventos_animal_animal_id_fkey"
      columns: ["animal_id"]
isOneToOne: false
      referencedRelation: "animales"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "eventos_animal_pajilla_id_fkey"
      columns: ["pajilla_id"]
isOneToOne: false
      referencedRelation: "pajillas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "eventos_animal_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "eventos_animal_toro_id_fkey"
      columns: ["toro_id"]
isOneToOne: false
      referencedRelation: "animales"
      referencedColumns: ["id"]
    }
                  ]
                },"extracciones_leche": {
                  Row: {
                    "created_at": string,"fecha": string,"id": number,"litros_cantina": number,"litros_cria": number,"tenant_id": string,"vacas_en_produccion": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"fecha": string,"id"?: number,"litros_cantina": number,"litros_cria"?: number,"tenant_id"?: string,"vacas_en_produccion"?: number | null
                  }
                  Update: {
                    "created_at"?: string,"fecha"?: string,"id"?: number,"litros_cantina"?: number,"litros_cria"?: number,"tenant_id"?: string,"vacas_en_produccion"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "extracciones_leche_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"fincas_cooperativa": {
                  Row: {
                    "activa": boolean,"created_at": string,"id": number,"metodo_pago": string,"nombre": string,"precio_litro": number
                  }
                  ComputedFields: never
                  Insert: {
                    "activa"?: boolean,"created_at"?: string,"id"?: number,"metodo_pago"?: string,"nombre": string,"precio_litro"?: number
                  }
                  Update: {
                    "activa"?: boolean,"created_at"?: string,"id"?: number,"metodo_pago"?: string,"nombre"?: string,"precio_litro"?: number
                  }
                  Relationships: [
                    
                  ]
                },"gastos": {
                  Row: {
                    "created_at": string,"fecha": string,"id": number,"numero_factura": string | null,"observaciones": string | null,"pagado": boolean,"proveedor": string | null,"source": string | null,"subconcepto_id": number | null,"tenant_id": string,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"fecha": string,"id"?: number,"numero_factura"?: string | null,"observaciones"?: string | null,"pagado"?: boolean,"proveedor"?: string | null,"source"?: string | null,"subconcepto_id"?: number | null,"tenant_id"?: string,"valor": number
                  }
                  Update: {
                    "created_at"?: string,"fecha"?: string,"id"?: number,"numero_factura"?: string | null,"observaciones"?: string | null,"pagado"?: boolean,"proveedor"?: string | null,"source"?: string | null,"subconcepto_id"?: number | null,"tenant_id"?: string,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "gastos_subconcepto_id_fkey"
      columns: ["subconcepto_id"]
isOneToOne: false
      referencedRelation: "subconceptos_gasto"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "gastos_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"ingresos": {
                  Row: {
                    "created_at": string,"fecha": string,"id": number,"observaciones": string | null,"source": string | null,"subconcepto_id": number,"tenant_id": string,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"fecha": string,"id"?: number,"observaciones"?: string | null,"source"?: string | null,"subconcepto_id": number,"tenant_id"?: string,"valor": number
                  }
                  Update: {
                    "created_at"?: string,"fecha"?: string,"id"?: number,"observaciones"?: string | null,"source"?: string | null,"subconcepto_id"?: number,"tenant_id"?: string,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "ingresos_subconcepto_id_fkey"
      columns: ["subconcepto_id"]
isOneToOne: false
      referencedRelation: "subconceptos_ingreso"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ingresos_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"itinerarios": {
                  Row: {
                    "created_at": string,"id": number,"nombre": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id": number,"nombre": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: number,"nombre"?: string
                  }
                  Relationships: [
                    
                  ]
                },"itinerarios_fincas": {
                  Row: {
                    "finca_id": number,"itinerario_id": number,"orden": number
                  }
                  ComputedFields: never
                  Insert: {
                    "finca_id": number,"itinerario_id": number,"orden"?: number
                  }
                  Update: {
                    "finca_id"?: number,"itinerario_id"?: number,"orden"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "itinerarios_fincas_finca_id_fkey"
      columns: ["finca_id"]
isOneToOne: true
      referencedRelation: "fincas_cooperativa"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "itinerarios_fincas_itinerario_id_fkey"
      columns: ["itinerario_id"]
isOneToOne: false
      referencedRelation: "itinerarios"
      referencedColumns: ["id"]
    }
                  ]
                },"mediciones_leche_animal": {
                  Row: {
                    "animal_id": string,"created_at": string,"fecha": string,"id": string,"litros": number,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "animal_id": string,"created_at"?: string,"fecha": string,"id"?: string,"litros": number,"tenant_id"?: string
                  }
                  Update: {
                    "animal_id"?: string,"created_at"?: string,"fecha"?: string,"id"?: string,"litros"?: number,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "mediciones_leche_animal_animal_id_fkey"
      columns: ["animal_id"]
isOneToOne: false
      referencedRelation: "animales"
      referencedColumns: ["id"]
    }
                  ]
                },"modulos": {
                  Row: {
                    "base": boolean,"descripcion": string | null,"id": string,"nombre": string,"vertical": Database["public"]['Enums']["vertical"] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "base"?: boolean,"descripcion"?: string | null,"id": string,"nombre": string,"vertical"?: Database["public"]['Enums']["vertical"] | null
                  }
                  Update: {
                    "base"?: boolean,"descripcion"?: string | null,"id"?: string,"nombre"?: string,"vertical"?: Database["public"]['Enums']["vertical"] | null
                  }
                  Relationships: [
                    
                  ]
                },"movimientos_inventario": {
                  Row: {
                    "articulo_id": string,"cantidad": number,"costo_unitario": number | null,"created_at": string,"created_by": string | null,"fecha": string,"id": string,"motivo": Database["public"]['Enums']["motivo_movimiento"],"observaciones": string | null,"ref_id": string | null,"ref_tipo": string | null,"seq": number,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "articulo_id": string,"cantidad": number,"costo_unitario"?: number | null,"created_at"?: string,"created_by"?: string | null,"fecha"?: string,"id"?: string,"motivo": Database["public"]['Enums']["motivo_movimiento"],"observaciones"?: string | null,"ref_id"?: string | null,"ref_tipo"?: string | null,"seq"?: never,"tenant_id"?: string
                  }
                  Update: {
                    "articulo_id"?: string,"cantidad"?: number,"costo_unitario"?: number | null,"created_at"?: string,"created_by"?: string | null,"fecha"?: string,"id"?: string,"motivo"?: Database["public"]['Enums']["motivo_movimiento"],"observaciones"?: string | null,"ref_id"?: string | null,"ref_tipo"?: string | null,"seq"?: never,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "movimientos_articulo_fk"
      columns: ["tenant_id","articulo_id"]
isOneToOne: false
      referencedRelation: "articulos"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "movimientos_articulo_fk"
      columns: ["tenant_id","articulo_id"]
isOneToOne: false
      referencedRelation: "v_stock"
      referencedColumns: ["tenant_id","articulo_id"]
    },{
      foreignKeyName: "movimientos_inventario_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"pagos": {
                  Row: {
                    "banco": string | null,"forma_pago": string,"gasto_id": number,"id": number,"numero_cuenta": string | null,"tenant_id": string,"tipo_cuenta": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "banco"?: string | null,"forma_pago": string,"gasto_id": number,"id"?: never,"numero_cuenta"?: string | null,"tenant_id"?: string,"tipo_cuenta"?: string | null
                  }
                  Update: {
                    "banco"?: string | null,"forma_pago"?: string,"gasto_id"?: number,"id"?: never,"numero_cuenta"?: string | null,"tenant_id"?: string,"tipo_cuenta"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "pagos_gasto_id_fkey"
      columns: ["gasto_id"]
isOneToOne: true
      referencedRelation: "gastos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pagos_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"pagos_finca": {
                  Row: {
                    "activado_por": string | null,"created_at": string | null,"estado": string,"fecha_fin": string,"fecha_inicio": string,"fecha_marcado": string | null,"finca_id": number,"id": number,"itinerario_id": number | null,"litros": number,"marcado_por": string | null,"responsable": string,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "activado_por"?: string | null,"created_at"?: string | null,"estado"?: string,"fecha_fin": string,"fecha_inicio": string,"fecha_marcado"?: string | null,"finca_id": number,"id"?: number,"itinerario_id"?: number | null,"litros"?: number,"marcado_por"?: string | null,"responsable"?: string,"updated_at"?: string | null
                  }
                  Update: {
                    "activado_por"?: string | null,"created_at"?: string | null,"estado"?: string,"fecha_fin"?: string,"fecha_inicio"?: string,"fecha_marcado"?: string | null,"finca_id"?: number,"id"?: number,"itinerario_id"?: number | null,"litros"?: number,"marcado_por"?: string | null,"responsable"?: string,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "pagos_finca_finca_id_fkey"
      columns: ["finca_id"]
isOneToOne: false
      referencedRelation: "fincas_cooperativa"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pagos_finca_itinerario_id_fkey"
      columns: ["itinerario_id"]
isOneToOne: false
      referencedRelation: "itinerarios"
      referencedColumns: ["id"]
    }
                  ]
                },"pajillas": {
                  Row: {
                    "cantidad": number,"cantidad_disponible": number,"created_at": string,"fecha_compra": string,"id": string,"observaciones": string | null,"proveedor": string | null,"raza": Database["public"]['Enums']["animal_raza"] | null,"tenant_id": string,"toro_nombre": string,"toro_ref_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cantidad": number,"cantidad_disponible": number,"created_at"?: string,"fecha_compra": string,"id"?: string,"observaciones"?: string | null,"proveedor"?: string | null,"raza"?: Database["public"]['Enums']["animal_raza"] | null,"tenant_id"?: string,"toro_nombre": string,"toro_ref_id": string
                  }
                  Update: {
                    "cantidad"?: number,"cantidad_disponible"?: number,"created_at"?: string,"fecha_compra"?: string,"id"?: string,"observaciones"?: string | null,"proveedor"?: string | null,"raza"?: Database["public"]['Enums']["animal_raza"] | null,"tenant_id"?: string,"toro_nombre"?: string,"toro_ref_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pajillas_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"parametros": {
                  Row: {
                    "clave": string,"created_at": string,"created_by": string | null,"id": string,"tenant_id": string,"updated_at": string | null,"updated_by": string | null,"valor": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "clave": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"tenant_id"?: string,"updated_at"?: string | null,"updated_by"?: string | null,"valor": NonNullable<Json>
                  }
                  Update: {
                    "clave"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"tenant_id"?: string,"updated_at"?: string | null,"updated_by"?: string | null,"valor"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "parametros_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"platform_admins": {
                  Row: {
                    "user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "user_id": string
                  }
                  Update: {
                    "user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"precios": {
                  Row: {
                    "created_at": string | null,"id": number,"tenant_id": string,"tipo": string,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string | null,"id"?: number,"tenant_id"?: string,"tipo"?: string,"valor": number
                  }
                  Update: {
                    "created_at"?: string | null,"id"?: number,"tenant_id"?: string,"tipo"?: string,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "precios_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"recolecciones": {
                  Row: {
                    "created_at": string,"fecha": string,"finca_id": number,"id": number,"litros": number,"precio_litro": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"fecha": string,"finca_id": number,"id"?: number,"litros": number,"precio_litro": number
                  }
                  Update: {
                    "created_at"?: string,"fecha"?: string,"finca_id"?: number,"id"?: number,"litros"?: number,"precio_litro"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "recolecciones_finca_id_fkey"
      columns: ["finca_id"]
isOneToOne: false
      referencedRelation: "fincas_cooperativa"
      referencedColumns: ["id"]
    }
                  ]
                },"roles": {
                  Row: {
                    "created_at": string,"id": number,"rol": Database["public"]['Enums']["rol"],"tenant_id": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: number,"rol": Database["public"]['Enums']["rol"],"tenant_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: number,"rol"?: Database["public"]['Enums']["rol"],"tenant_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "roles_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"rutas_cooperativa": {
                  Row: {
                    "created_at": string,"id": number,"nombre": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: number,"nombre": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: number,"nombre"?: string
                  }
                  Relationships: [
                    
                  ]
                },"rutas_fincas": {
                  Row: {
                    "finca_id": number,"orden": number,"ruta_id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "finca_id": number,"orden"?: number,"ruta_id": number
                  }
                  Update: {
                    "finca_id"?: number,"orden"?: number,"ruta_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "rutas_fincas_finca_id_fkey"
      columns: ["finca_id"]
isOneToOne: true
      referencedRelation: "fincas_cooperativa"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rutas_fincas_ruta_id_fkey"
      columns: ["ruta_id"]
isOneToOne: false
      referencedRelation: "rutas_cooperativa"
      referencedColumns: ["id"]
    }
                  ]
                },"series_consecutivo": {
                  Row: {
                    "activo": boolean,"created_at": string,"created_by": string | null,"descripcion": string,"formato": string,"id": string,"reinicia_anual": boolean,"serie": string,"tenant_id": string,"updated_at": string | null,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"created_at"?: string,"created_by"?: string | null,"descripcion": string,"formato"?: string,"id"?: string,"reinicia_anual"?: boolean,"serie": string,"tenant_id"?: string,"updated_at"?: string | null,"updated_by"?: string | null
                  }
                  Update: {
                    "activo"?: boolean,"created_at"?: string,"created_by"?: string | null,"descripcion"?: string,"formato"?: string,"id"?: string,"reinicia_anual"?: boolean,"serie"?: string,"tenant_id"?: string,"updated_at"?: string | null,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "series_consecutivo_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"subconceptos_gasto": {
                  Row: {
                    "concepto_id": number,"id": number,"nombre": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "concepto_id": number,"id"?: never,"nombre": string,"tenant_id"?: string
                  }
                  Update: {
                    "concepto_id"?: number,"id"?: never,"nombre"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subconceptos_gasto_concepto_id_fkey"
      columns: ["concepto_id"]
isOneToOne: false
      referencedRelation: "conceptos_gasto"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subconceptos_gasto_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"subconceptos_ingreso": {
                  Row: {
                    "concepto_id": number,"id": number,"nombre": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "concepto_id": number,"id"?: never,"nombre": string,"tenant_id"?: string
                  }
                  Update: {
                    "concepto_id"?: number,"id"?: never,"nombre"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subconceptos_ingreso_concepto_id_fkey"
      columns: ["concepto_id"]
isOneToOne: false
      referencedRelation: "conceptos_ingreso"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subconceptos_ingreso_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"tarifas": {
                  Row: {
                    "concepto": string,"created_at": string,"created_by": string | null,"id": string,"observaciones": string | null,"tenant_id": string,"unidad": string,"valor": number,"vigente_desde": string
                  }
                  ComputedFields: never
                  Insert: {
                    "concepto": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"observaciones"?: string | null,"tenant_id"?: string,"unidad"?: string,"valor": number,"vigente_desde"?: string
                  }
                  Update: {
                    "concepto"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"observaciones"?: string | null,"tenant_id"?: string,"unidad"?: string,"valor"?: number,"vigente_desde"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tarifas_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"tenant_members": {
                  Row: {
                    "activo": boolean,"created_at": string,"created_by": string | null,"id": string,"permisos": (string)[],"rol": Database["public"]['Enums']["rol_tenant"],"tenant_id": string,"updated_at": string | null,"updated_by": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"permisos"?: (string)[],"rol": Database["public"]['Enums']["rol_tenant"],"tenant_id": string,"updated_at"?: string | null,"updated_by"?: string | null,"user_id": string
                  }
                  Update: {
                    "activo"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"permisos"?: (string)[],"rol"?: Database["public"]['Enums']["rol_tenant"],"tenant_id"?: string,"updated_at"?: string | null,"updated_by"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tenant_members_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"tenant_modulos": {
                  Row: {
                    "activado_at": string,"activado_por": string | null,"activo": boolean,"config": NonNullable<Json>,"id": string,"modulo_id": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activado_at"?: string,"activado_por"?: string | null,"activo"?: boolean,"config"?: NonNullable<Json>,"id"?: string,"modulo_id": string,"tenant_id": string
                  }
                  Update: {
                    "activado_at"?: string,"activado_por"?: string | null,"activo"?: boolean,"config"?: NonNullable<Json>,"id"?: string,"modulo_id"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tenant_modulos_modulo_id_fkey"
      columns: ["modulo_id"]
isOneToOne: false
      referencedRelation: "modulos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tenant_modulos_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"tenants": {
                  Row: {
                    "color_primario": string | null,"created_at": string,"estado": Database["public"]['Enums']["tenant_estado"],"id": string,"logo_url": string | null,"moneda": string,"nit": string | null,"nombre": string,"plan": string,"slug": string,"updated_at": string | null,"updated_by": string | null,"vertical": Database["public"]['Enums']["vertical"],"zona_horaria": string
                  }
                  ComputedFields: never
                  Insert: {
                    "color_primario"?: string | null,"created_at"?: string,"estado"?: Database["public"]['Enums']["tenant_estado"],"id"?: string,"logo_url"?: string | null,"moneda"?: string,"nit"?: string | null,"nombre": string,"plan"?: string,"slug": string,"updated_at"?: string | null,"updated_by"?: string | null,"vertical": Database["public"]['Enums']["vertical"],"zona_horaria"?: string
                  }
                  Update: {
                    "color_primario"?: string | null,"created_at"?: string,"estado"?: Database["public"]['Enums']["tenant_estado"],"id"?: string,"logo_url"?: string | null,"moneda"?: string,"nit"?: string | null,"nombre"?: string,"plan"?: string,"slug"?: string,"updated_at"?: string | null,"updated_by"?: string | null,"vertical"?: Database["public"]['Enums']["vertical"],"zona_horaria"?: string
                  }
                  Relationships: [
                    
                  ]
                },"terceros": {
                  Row: {
                    "activo": boolean,"created_at": string,"created_by": string | null,"digito_verificacion": number | null,"direccion": string,"email": string | null,"es_consumidor_final": boolean,"id": string,"identificacion": string,"nombre": string,"observaciones": string | null,"roles": (string)[],"telefono": string,"tenant_id": string,"tipo_identificacion": Database["public"]['Enums']["tipo_identificacion"],"updated_at": string | null,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"created_at"?: string,"created_by"?: string | null,"digito_verificacion"?: number | null,"direccion": string,"email"?: string | null,"es_consumidor_final"?: boolean,"id"?: string,"identificacion": string,"nombre": string,"observaciones"?: string | null,"roles"?: (string)[],"telefono": string,"tenant_id"?: string,"tipo_identificacion"?: Database["public"]['Enums']["tipo_identificacion"],"updated_at"?: string | null,"updated_by"?: string | null
                  }
                  Update: {
                    "activo"?: boolean,"created_at"?: string,"created_by"?: string | null,"digito_verificacion"?: number | null,"direccion"?: string,"email"?: string | null,"es_consumidor_final"?: boolean,"id"?: string,"identificacion"?: string,"nombre"?: string,"observaciones"?: string | null,"roles"?: (string)[],"telefono"?: string,"tenant_id"?: string,"tipo_identificacion"?: Database["public"]['Enums']["tipo_identificacion"],"updated_at"?: string | null,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "terceros_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"toros_legacy": {
                  Row: {
                    "alta": boolean,"created_at": string | null,"estado": string | null,"fecha_compra": string | null,"fecha_nacimiento": string | null,"id": string,"madre_id": string | null,"nombre": string,"numero_registro": string | null,"origen": Database["public"]['Enums']["vaca_origen"] | null,"padre_id": string | null,"toro_id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "alta"?: boolean,"created_at"?: string | null,"estado"?: string | null,"fecha_compra"?: string | null,"fecha_nacimiento"?: string | null,"id"?: string,"madre_id"?: string | null,"nombre": string,"numero_registro"?: string | null,"origen"?: Database["public"]['Enums']["vaca_origen"] | null,"padre_id"?: string | null,"toro_id": number
                  }
                  Update: {
                    "alta"?: boolean,"created_at"?: string | null,"estado"?: string | null,"fecha_compra"?: string | null,"fecha_nacimiento"?: string | null,"id"?: string,"madre_id"?: string | null,"nombre"?: string,"numero_registro"?: string | null,"origen"?: Database["public"]['Enums']["vaca_origen"] | null,"padre_id"?: string | null,"toro_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "toros_madre_id_fkey"
      columns: ["madre_id"]
isOneToOne: false
      referencedRelation: "vacas_legacy"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "toros_padre_id_fkey"
      columns: ["padre_id"]
isOneToOne: false
      referencedRelation: "toros_legacy"
      referencedColumns: ["id"]
    }
                  ]
                },"user_itinerarios": {
                  Row: {
                    "created_at": string,"itinerario_id": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"itinerario_id": number,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"itinerario_id"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_itinerarios_itinerario_id_fkey"
      columns: ["itinerario_id"]
isOneToOne: false
      referencedRelation: "itinerarios"
      referencedColumns: ["id"]
    }
                  ]
                },"user_tenant_activo": {
                  Row: {
                    "tenant_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "tenant_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "tenant_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_tenant_activo_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"vacas_legacy": {
                  Row: {
                    "alta": boolean,"created_at": string | null,"estado": Database["public"]['Enums']["vaca_estado"] | null,"fecha_compra": string | null,"fecha_nacimiento": string | null,"id": string,"madre_id": string | null,"nombre": string,"numero_registro": string | null,"origen": Database["public"]['Enums']["vaca_origen"] | null,"padre_id": string | null,"padre_pajilla_nombre": string | null,"vaca_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alta"?: boolean,"created_at"?: string | null,"estado"?: Database["public"]['Enums']["vaca_estado"] | null,"fecha_compra"?: string | null,"fecha_nacimiento"?: string | null,"id"?: string,"madre_id"?: string | null,"nombre": string,"numero_registro"?: string | null,"origen"?: Database["public"]['Enums']["vaca_origen"] | null,"padre_id"?: string | null,"padre_pajilla_nombre"?: string | null,"vaca_id": string
                  }
                  Update: {
                    "alta"?: boolean,"created_at"?: string | null,"estado"?: Database["public"]['Enums']["vaca_estado"] | null,"fecha_compra"?: string | null,"fecha_nacimiento"?: string | null,"id"?: string,"madre_id"?: string | null,"nombre"?: string,"numero_registro"?: string | null,"origen"?: Database["public"]['Enums']["vaca_origen"] | null,"padre_id"?: string | null,"padre_pajilla_nombre"?: string | null,"vaca_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vacas_madre_id_fkey"
      columns: ["madre_id"]
isOneToOne: false
      referencedRelation: "vacas_legacy"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vacas_padre_id_fkey"
      columns: ["padre_id"]
isOneToOne: false
      referencedRelation: "toros_legacy"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "v_kardex": {
                  Row: {
                    "articulo_id": string,"articulo_nombre": string,"cantidad": number,"costo_unitario": number | null,"created_at": string,"created_by": string | null,"fecha": string,"id": string,"motivo": Database["public"]['Enums']["motivo_movimiento"],"observaciones": string | null,"ref_id": string | null,"ref_tipo": string | null,"saldo": number | null,"seq": number,"tenant_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "movimientos_articulo_fk"
      columns: ["tenant_id","articulo_id"]
isOneToOne: false
      referencedRelation: "articulos"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "movimientos_articulo_fk"
      columns: ["tenant_id","articulo_id"]
isOneToOne: false
      referencedRelation: "v_stock"
      referencedColumns: ["tenant_id","articulo_id"]
    },{
      foreignKeyName: "movimientos_inventario_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"v_stock": {
                  Row: {
                    "activo": boolean,"articulo_id": string,"atributos": NonNullable<Json>,"bajo_minimo": boolean | null,"codigo": string | null,"nombre": string,"stock": number | null,"stock_minimo": number | null,"tenant_id": string,"tipo": Database["public"]['Enums']["tipo_articulo"],"unidad": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "articulos_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"v_tarifas_vigentes": {
                  Row: {
                    "concepto": string,"tenant_id": string,"unidad": string,"valor": number,"vigente_desde": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "tarifas_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "asegurar_consumidor_final":
{ Args: { "p_tenant"?: string }; Returns: string
                           },
"buscar_terceros_similares":
{ Args: { "p_identificacion"?: string,"p_nombre": string }; Returns: {
              "activo": boolean,
"created_at": string,
"created_by": string | null,
"digito_verificacion": number | null,
"direccion": string,
"email": string | null,
"es_consumidor_final": boolean,
"id": string,
"identificacion": string,
"nombre": string,
"observaciones": string | null,
"roles": (string)[],
"telefono": string,
"tenant_id": string,
"tipo_identificacion": Database["public"]['Enums']["tipo_identificacion"],
"updated_at": string | null,
"updated_by": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "terceros"
        isOneToOne: false
        isSetofReturn: true
      } },
"cambiar_estado_miembro_tenant":
{ Args: { "p_activo": boolean,"p_user": string }; Returns: undefined
                           },
"cambiar_rol_miembro_tenant":
{ Args: { "p_rol": Database["public"]['Enums']["rol_tenant"],"p_user": string }; Returns: undefined
                           },
"cambiar_tenant_activo":
{ Args: { "p_tenant": string }; Returns: string
                           },
"es_platform_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"formatear_consecutivo":
{ Args: { "p_anio": number,"p_formato": string,"p_n": number,"p_serie": string }; Returns: string
                           },
"get_cooperativa_users":
{ Args: Record<PropertyKey, never>; Returns: {
              "email": string,"itinerario_id": number,"itinerario_nombre": string,"rol": string,"user_id": string
            }[]
                           },
"guardar_parametro":
{ Args: { "p_clave": string,"p_valor": Json }; Returns: Json
                           },
"historial_cambios":
{ Args: { "p_limite"?: number,"p_registro_id"?: string,"p_tabla": string }; Returns: {
              "accion": string,"at": string,"cambios": Json,"email": string,"id": number,"registro_id": string,"tabla": string,"user_id": string
            }[]
                           },
"invitar_miembro_tenant":
{ Args: { "p_email": string,"p_rol": Database["public"]['Enums']["rol_tenant"] }; Returns: Json
                           },
"listar_miembros_tenant":
{ Args: Record<PropertyKey, never>; Returns: {
              "activo": boolean,"created_at": string,"email": string,"id": string,"rol": Database["public"]['Enums']["rol_tenant"],"ultimo_acceso": string,"user_id": string
            }[]
                           },
"mi_sesion":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"movimiento_signo_valido":
{ Args: { "p_cantidad": number,"p_motivo": Database["public"]['Enums']["motivo_movimiento"] }; Returns: boolean
                           },
"nombres_usuarios_tenant":
{ Args: { "p_ids": (string)[] }; Returns: {
              "email": string,"user_id": string
            }[]
                           },
"normalizar_identificacion":
{ Args: { "p_texto": string }; Returns: string
                           },
"normalizar_nombre":
{ Args: { "p_texto": string }; Returns: string
                           },
"parametro":
{ Args: { "p_clave": string,"p_default"?: Json }; Returns: Json
                           },
"platform_actualizar_tenant":
{ Args: { "p_cambios": Json,"p_tenant": string }; Returns: undefined
                           },
"platform_agregar_miembro":
{ Args: { "p_email": string,"p_rol": Database["public"]['Enums']["rol_tenant"],"p_tenant": string }; Returns: string
                           },
"platform_crear_tenant":
{ Args: { "p_modulos"?: (string)[],"p_nit"?: string,"p_nombre": string,"p_plan"?: string,"p_slug": string,"p_vertical": Database["public"]['Enums']["vertical"] }; Returns: string
                           },
"platform_listar_tenants":
{ Args: Record<PropertyKey, never>; Returns: {
              "estado": Database["public"]['Enums']["tenant_estado"],"id": string,"nombre": string,"slug": string,"vertical": Database["public"]['Enums']["vertical"]
            }[]
                           },
"platform_obtener_tenant":
{ Args: { "p_tenant": string }; Returns: Json
                           },
"platform_quitar_miembro":
{ Args: { "p_tenant": string,"p_user": string }; Returns: undefined
                           },
"platform_set_modulo":
{ Args: { "p_activo": boolean,"p_modulo": string,"p_tenant": string }; Returns: undefined
                           },
"platform_tenants_resumen":
{ Args: Record<PropertyKey, never>; Returns: {
              "created_at": string,"estado": Database["public"]['Enums']["tenant_estado"],"id": string,"miembros": number,"modulos": number,"nit": string,"nombre": string,"plan": string,"slug": string,"vertical": Database["public"]['Enums']["vertical"]
            }[]
                           },
"registrar_movimientos":
{ Args: { "p_movs": Json,"p_permitir_negativo"?: boolean }; Returns: Json
                           },
"rol_actual":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["rol"]
                           },
"rol_en_tenant":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["rol_tenant"]
                           },
"rol_legacy_a_membresia":
{ Args: { "p_rol": Database["public"]['Enums']["rol"],"p_tenant_id": string }; Returns: {
              "rol": Database["public"]['Enums']["rol_tenant"],"tenant_id": string
            }[]
                           },
"siguiente_consecutivo":
{ Args: { "p_fecha"?: string,"p_serie": string }; Returns: string
                           },
"tarifa_vigente":
{ Args: { "p_at"?: string,"p_concepto": string }; Returns: number
                           },
"tarifas_historial":
{ Args: { "p_concepto"?: string }; Returns: {
              "concepto": string,"created_at": string,"created_by": string,"email": string,"id": string,"observaciones": string,"unidad": string,"valor": number,"vigente_desde": string
            }[]
                           },
"tenant_actual":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"tenant_tiene_modulo":
{ Args: { "p_modulo": string }; Returns: boolean
                           },
"tiene_permiso":
{ Args: { "p": string }; Returns: boolean
                           }
          }
          Enums: {
            "animal_raza": "holstein"|"jersey"|"jerhol"|"normando"|"ayrshire"|"cruce","animal_sexo": "hembra"|"macho","estado_productivo": "leche"|"levante_1"|"levante_2"|"produccion"|"secado"|"reproductor","estado_reproductivo": "pre_puber"|"puber"|"pre_servicio"|"servicio"|"servida"|"por_confirmar"|"rechequeo"|"cargada","motivo_movimiento": "saldo_inicial"|"compra"|"produccion"|"consumo"|"venta"|"cortesia"|"muestra"|"perdida"|"ajuste"|"devolucion"|"reapertura","rol": "admin"|"user"|"cooperativa_admin"|"cooperativa_user"|"viewer","rol_tenant": "owner"|"admin"|"operativo"|"viewer","tenant_estado": "activo"|"prueba"|"suspendido"|"baja","tipo_articulo": "insumo"|"producto_terminado"|"materia_prima"|"otro","tipo_identificacion": "NIT"|"CC"|"CE"|"PAS"|"OTRO","vaca_estado": "produccion"|"secado"|"pre_jardin"|"jardin"|"transicion","vaca_origen": "finca"|"externa","vertical": "ganaderia"|"cooperativa"|"cafe"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "cafe": {
          Enums: {
            "linea_lote": ["marca_propia", "servicio"],"nivel_tueste": ["bajo", "medio", "alto"],"tipo_proceso": ["trilla", "tostion", "molienda", "empaque"]
          }
        },"public": {
          Enums: {
            "animal_raza": ["holstein", "jersey", "jerhol", "normando", "ayrshire", "cruce"],"animal_sexo": ["hembra", "macho"],"estado_productivo": ["leche", "levante_1", "levante_2", "produccion", "secado", "reproductor"],"estado_reproductivo": ["pre_puber", "puber", "pre_servicio", "servicio", "servida", "por_confirmar", "rechequeo", "cargada"],"motivo_movimiento": ["saldo_inicial", "compra", "produccion", "consumo", "venta", "cortesia", "muestra", "perdida", "ajuste", "devolucion", "reapertura"],"rol": ["admin", "user", "cooperativa_admin", "cooperativa_user", "viewer"],"rol_tenant": ["owner", "admin", "operativo", "viewer"],"tenant_estado": ["activo", "prueba", "suspendido", "baja"],"tipo_articulo": ["insumo", "producto_terminado", "materia_prima", "otro"],"tipo_identificacion": ["NIT", "CC", "CE", "PAS", "OTRO"],"vaca_estado": ["produccion", "secado", "pre_jardin", "jardin", "transicion"],"vaca_origen": ["finca", "externa"],"vertical": ["ganaderia", "cooperativa", "cafe"]
          }
        }
} as const
