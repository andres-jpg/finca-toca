-- Catálogo de módulos: aclara qué es `cafe.exportacion` (FIN-116 · CO-35).
--
-- El módulo se sembró como «Documentación de exportación» (comercio exterior: documentos para vender fuera del país).
-- Se confundía con la exportación a Excel, que NO es un módulo: `/api/export/<recurso>` la gobierna el módulo dueño de
-- cada recurso (lotes y procesos → `cafe.recepcion`, terceros → `core.terceros`). Solo cambia el texto del catálogo:
-- ni el id, ni `base`, ni los clientes que lo tengan activo se tocan.
update public.modulos
   set descripcion = 'Documentación de comercio exterior (no es la exportación a Excel, que va con cada módulo)'
 where id = 'cafe.exportacion';
