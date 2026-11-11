# Microcopy y glosario · Cofradía v2

Fuente: `AJUSTES_COFRADIA_FASE1_v2.md` (§2 y §3). Léelo antes de tocar cualquier texto de las pantallas de café; aplica a todo texto nuevo o tocado.

**Formato de cifras: un único helper.** Usar `src/modules/core/formato/numeros.ts` (`formatKg` «202,0 kg», `formatCOP` «$28.500», `formatPct` «18,1 %»). No duplicar formateadores. Los textos nuevos de v2 se centralizan en `src/modules/cafe/copy.ts`.

## Principios transversales y glosario de tueste (§2)

| Tema | Regla |
| --- | --- |
| Unidad de peso | **Solo kilogramos**, con 1 decimal en pantalla. Se eliminan los bultos de toda la app (recepción, planta, inventario, ficha). |
| Unidad de venta | **Libra = 500 g.** El panel y el inventario de producto terminado hablan en libras. Una bolsa de 2.500 g = 5 lb. |
| Merma | Solo existe merma en **trilla** (peso final de trilla) y en **tostión** (calculada con el peso total en báscula al empacar). **Molienda y empaque no tienen merma.** |
| Sobrante de empaque | Marca propia: pasa a **«Tostado sin empacar»**. Nunca vuelve a café verde. Terceros: se entrega a granel al cliente. |
| Estimados | Toda cifra calculada antes de tiempo (molienda, tostado esperado, valor del servicio) lleva la etiqueta **«Estimado»**. |
| Inventario | No se vende lo que no hay (B-11). Las correcciones se hacen con **Ajustar inventario**, con motivo y auditoría (B-15). |
| Vocabulario | Marca propia / Servicios a terceros (v1). Inventario de marca propia: **Café verde por tostar · Tostado sin empacar · Producto terminado**. |
| Glosario de tueste | **Tostión** = el proceso. **Tipo de café** = Excelso o Consumo (solo marca propia). **Nivel de tueste** = Alto, Medio o Bajo (marca propia y maquila). **Perfil de tueste** = nivel de tueste + temperatura + tiempo. **Perfil 1, Perfil 2** = cada perfil con sus kilos cuando un lote de maquila trae varios. **No se usa la palabra «receta»** en ninguna pantalla ni documento impreso (B-20). |
| Alcance | Esta fase **no** controla pagos ni cuentas por cobrar de terceros. |

---

## Guía de microcopy (§3)

Objetivo acordado con Cofradía: textos **corporativos, frescos, ejecutivos y claros**. Que la herramienta se lea como software profesional, no como una app informal.

| Regla | Sí | No |
| --- | --- | --- |
| Botones en infinitivo, con el resultado cuando ayuda | «Registrar trilla → Por tostar» · «Guardar venta» · «Aplicar a los seleccionados» | «¡Listo, guardemos!» · «Dale» |
| Ayudas e indicaciones en forma impersonal | «Seleccionar un producto para agregarlo» · «Humedad y densidad se registran al finalizar la trilla» | «Toca aquí para…» · «Tú puedes…» |
| Confirmaciones: hecho + siguiente paso | «Empaque registrado. Lote MQ-2026-0088 listo para entrega.» | «¡Súper! Todo salió bien 🎉» |
| Errores: qué pasó + cómo resolverlo | «Las bolsas suman más que el peso en báscula. Revisar cantidades.» | «Ups, algo salió mal» |
| Alertas: dato primero, sin adjetivos | «Consumo 2.500 g agotado. Programar empaque.» | «¡Atención! Te quedaste sin café» |
| Sin exclamaciones, sin emoji, sin diminutivos | «Lote listo» | «¡Lotecito listo! ☕» |
| Cifras con unidad y formato colombiano | «202,0 kg» · «$28.500/kg» · «18,1 %» | «202 kgs» · «28500» |
| Estados con una o dos palabras | «En rango» · «Revisar · alta» · «Verificar · baja» · «Agotado» | Frases largas en una etiqueta |

Revisar con esta guía los textos existentes de las pantallas tocadas en cada ajuste.

---
