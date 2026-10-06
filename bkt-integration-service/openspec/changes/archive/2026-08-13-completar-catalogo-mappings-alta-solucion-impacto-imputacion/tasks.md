## 1. Preparar evidencias batch 2

- [x] 1.1 Crear `docs/mappings/evidence/pilot-local/README.md` o actualizarlo con reglas especificas para el nuevo batch.
- [x] 1.2 Preparar evidencia sanitizada para las secciones `Alta`, `Solucion`, `Impacto` e `Imputacion`.
- [x] 1.3 Confirmar que la evidencia no contiene credenciales, cookies, tokens, personas reales, correos, comentarios sensibles ni URLs internas completas.
- [x] 1.4 Documentar el origen permitido de la evidencia: metadata Jira, payload Jira sanitizado, modelo funcional o confirmacion funcional equivalente.

## 2. Clasificar Alta

- [x] 2.1 Crear `docs/mappings/contexts/pilot-local/alta-data-matrix.md`.
- [x] 2.2 Listar cada campo funcional de `Alta` como una fila independiente.
- [x] 2.3 Clasificar cada campo como `confirmed`, `pending-validation` o `excluded`.
- [x] 2.4 Identificar duplicados funcionales con `Datos basicos` y documentar si se reutilizan o quedan pendientes.
- [x] 2.5 Promocionar a `catalog.json` solo los mappings de `Alta` confirmados con evidencia.

## 3. Clasificar Solucion

- [x] 3.1 Crear `docs/mappings/contexts/pilot-local/solucion-data-matrix.md`.
- [x] 3.2 Separar campos Jira de campos generados por procesamiento posterior.
- [x] 3.3 Excluir diagnosticos, resoluciones o conclusiones que no procedan del payload Jira inicial.
- [x] 3.4 Clasificar cada campo como `confirmed`, `pending-validation` o `excluded`.
- [x] 3.5 Promocionar a `catalog.json` solo los mappings de `Solucion` confirmados con evidencia.

## 4. Clasificar Impacto

- [x] 4.1 Crear `docs/mappings/contexts/pilot-local/impacto-data-matrix.md`.
- [x] 4.2 Documentar campos de afectacion, criticidad, ambito o impacto de negocio.
- [x] 4.3 Confirmar rutas `.value` solo cuando el campo Jira sea objeto de opcion y la evidencia lo demuestre.
- [x] 4.4 Mantener arrays o estructuras multiples como `pending-validation` si el transformador actual no preserva correctamente su forma.
- [x] 4.5 Promocionar a `catalog.json` solo los mappings de `Impacto` confirmados con evidencia.

## 5. Documentar bloqueo de Imputacion

- [x] 5.1 Crear `docs/mappings/contexts/pilot-local/imputacion-timeentries.md`.
- [x] 5.2 Documentar que `timeEntries[]` queda bloqueado por limitacion actual del motor de mappings.
- [x] 5.3 Explicar que el motor actual no genera colecciones hijas ni expande arrays complejos hacia documentos independientes.
- [x] 5.4 Mantener `timeEntries[]` fuera de mappings cargables hasta aprobar un flujo especifico.
- [x] 5.5 Registrar alternativas futuras: motor de colecciones hijas, endpoint dedicado o procesamiento especializado.

## 6. Actualizar catalogo

- [x] 6.1 Actualizar `docs/mappings/contexts/pilot-local/catalog.json` solo con mappings confirmados.
- [x] 6.2 Actualizar `docs/mappings/contexts/pilot-local/catalog.md` con un resumen humano de las nuevas secciones.
- [x] 6.3 Mantener candidatos pendientes y excluidos separados de mappings cargables.
- [x] 6.4 Mantener `content.status` como destino de estado y no introducir `content.statusSp`.
- [x] 6.5 Mantener adjuntos duales fuera de mappings regulares si pertenecen al flujo especializado de adjuntos.

## 7. Validar alcance y consistencia

- [x] 7.1 Validar que todos los JSON modificados son validos.
- [x] 7.2 Validar que no hay `targetField: "content.statusSp"`.
- [x] 7.3 Validar que no hay mappings duplicados para el mismo `targetField` sin decision explicita.
- [x] 7.4 Validar que ningun `customfield_XXXXX` confirmado carece de evidencia.
- [x] 7.5 Validar que los campos `pending-validation` y `excluded` no aparecen en mappings cargables.
- [x] 7.6 Validar que `timeEntries[]` queda documentado como bloqueado o fuera de alcance.
- [x] 7.7 Confirmar que no se modifica `src/`, MongoDB, `.env`, Docker ni `openapi.yaml`.
