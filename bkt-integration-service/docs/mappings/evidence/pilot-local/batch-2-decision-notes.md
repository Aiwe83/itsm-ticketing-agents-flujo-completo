# Evidencia batch 2 - notas de decision

Este batch documenta las secciones funcionales Alta, Solucion, Impacto e Imputacion.

## Reglas usadas

- Solo se confirma un mapping si existe campo Jira claro, ruta de lectura clara y destino interno claro.
- No se inventan `customfield_*`.
- Un campo con forma observada, pero sin nombre funcional confirmado, queda como `pending-validation`.
- Un campo generado despues del intake Jira queda como `excluded`.
- Los adjuntos no se tratan como mappings regulares.
- `content.status` es el destino correcto del estado; no se recupera el campo legacy `statusSp`.
- `timeEntries[]` no se cataloga como mapping regular porque representa una coleccion hija.

## Decision global del batch

No se promocionan mappings nuevos a `mappings[]` en este batch. La razon es que las secciones nuevas aportan modelo funcional, pero todavia no aportan metadata Jira suficiente para confirmar nuevos `sourceField`.

Los mappings confirmados actuales se mantienen:

- `key -> itsmTicketId`
- `fields.issuetype.name -> ticketType`
- `fields.description -> content.issueDescription`
- `fields.summary -> content.title`
- `fields.status.name -> content.status`
- `fields.priority.name -> content.severityLevel`

## Evidencia descartada o saneada

Se descartan valores reales de texto libre, personas, correos, URLs internas completas, SQL real, tokens, cookies y adjuntos reales. Solo se conservan formas tecnicas, nombres funcionales, rutas candidatas y decisiones de clasificacion.
