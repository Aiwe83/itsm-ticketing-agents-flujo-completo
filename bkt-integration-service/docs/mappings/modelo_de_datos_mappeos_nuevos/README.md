# Modelo de datos para revisar mappings

Esta carpeta contiene el material funcional nuevo que se usara para decidir mappings Jira -> modelo interno.

No es una carpeta operativa del servicio. Sirve para que el equipo revise el modelo antes de tocar MongoDB o cambiar el runtime.

## Archivos

| Archivo | Para que sirve |
| --- | --- |
| `json_modelo_datos _1.md` | Describe el modelo funcional y los campos que negocio quiere revisar. |
| `ejemplo_ticket.json` | Muestra un ejemplo de ticket con la forma esperada del dato. |

## Como se usara

1. Identificar cada campo funcional del modelo.
2. Buscar si existe un campo Jira real que lo alimente.
3. Definir la ruta de origen como `sourceField`.
4. Definir el destino interno como `targetField`.
5. Marcar el campo como `confirmed`, `pending-validation`, `excluded` o `engineBlocked`.
6. Pasar solo los confirmados al catalogo cargable.

## Regla importante

El modelo ayuda a decidir que queremos obtener, pero no confirma por si solo de que campo Jira viene cada dato.

Por eso:

- no se inventan `customfield_*`;
- no se cargan mappings pendientes en MongoDB;
- no se edita la coleccion operativa `mappings` a mano durante la revision;
- la vista de MongoDB se usa solo para ensenar y validar el catalogo con claridad.

Cuando un campo pasa de `pending-validation` a `confirmed` en `catalog.json`, la forma correcta de
llevarlo a la coleccion operativa `mappings` es `pnpm mappings:dry-run`/`pnpm mappings:apply` (ver
`docs/mappings/README.md`, seccion "Pipeline de promocion"), nunca edicion manual en Compass.

## Estado

Este material ya fue procesado por `docs/mappings/scripts/build-mongo-review-seed.mjs` y cargado
en `mapping_catalog_review` (ver `docs/mappings/README.md` > "Vista documental en MongoDB" para
el detalle). `json_modelo_datos _1.md` se partio por sus 4 secciones (cada una con el texto
completo embebido) y sus 10 "Notas de la seccion N" se cargaron como `docType: gotcha` con
`scope: "functional"`. `ejemplo_ticket.json` se cargo sanitizado (dominios reales sustituidos).
