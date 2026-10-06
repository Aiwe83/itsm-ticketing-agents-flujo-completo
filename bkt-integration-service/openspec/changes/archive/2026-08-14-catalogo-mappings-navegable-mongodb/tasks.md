## 1. Preparacion documental

- [x] 1.1 Confirmar que `integration-service` es la base MongoDB activa para la demo
- [x] 1.2 Revisar `catalog.json`, matrices por seccion, `json_modelo_datos _1.md` y `ejemplo_ticket.json`
- [x] 1.3 Sanitizar `ejemplo_ticket.json` antes de incluirlo en cualquier seed si contiene correos, nombres o identificadores personales

## 2. Backup de seguridad de `mappings`

- [x] 2.1 Crear `docs/mappings/evidence/pilot-local/mappings-before.json` desde la coleccion operativa `mappings`
- [x] 2.2 Verificar que el backup no contiene credenciales ni informacion sensible que no deba versionarse
- [x] 2.3 Documentar que `mappings-before.json` sirve como linea base para comprobar que la carga de revision no toca mappings reales

## 3. Generador de seed

- [x] 3.1 Crear `docs/mappings/scripts/build-mongo-review-seed.mjs`
- [x] 3.2 Leer las fuentes documentales requeridas
- [x] 3.3 Generar documentos `field`, `model-reference`, `gotcha` y `example-ticket`
- [x] 3.4 Forzar `meshId: REVIEW-NOT-OPERATIONAL` en todos los documentos
- [x] 3.5 Rechazar cualquier aparicion de `content.statusSp`
- [x] 3.6 Generar `docs/mappings/evidence/pilot-local/mapping-catalog-review-seed.js`
- [x] 3.7 Imprimir el recuento por `docType` y fallar si el resultado no coincide con lo esperado

## 4. Carga idempotente en MongoDB

- [x] 4.1 Ejecutar el seed con `mongosh --file`
- [x] 4.2 Usar `bulkWrite` con `updateOne` y `upsert: true`
- [x] 4.3 No usar `drop()` ni comandos destructivos
- [x] 4.4 Crear el indice opcional `{ docType: 1, decision: 1 }`

## 5. Verificacion tecnica

- [x] 5.1 Exportar `mappings-after.json` y comprobar que no hay diferencias con `mappings-before.json`
- [x] 5.2 Confirmar el total de documentos de `mapping_catalog_review`
- [x] 5.3 Confirmar el desglose por `docType`
- [x] 5.4 Confirmar que no existe ningun documento con `meshId` distinto de `REVIEW-NOT-OPERATIONAL`
- [x] 5.5 Confirmar que no existe `targetField: "content.statusSp"`
- [x] 5.6 Confirmar que los campos `confirmed` tienen `futureMapping`
- [x] 5.7 Ejecutar smoke test de `POST /api/v1/issues`
- [x] 5.8 Confirmar que Docker Compose sigue arriba sin reinicios

## 6. Guia de demo

- [x] 6.1 Crear o actualizar una guia sencilla para MongoDB Compass
- [x] 6.2 Incluir filtros de Compass para `gotcha`, `confirmed`, `pending-validation`, `engineBlocked`, `model-reference` y `example-ticket`
- [x] 6.3 Explicar que `mapping_catalog_review` es documental y que `mappings` sigue siendo la coleccion operativa
- [x] 6.4 Explicar que las validaciones se cambian en Git y luego se regenera MongoDB

## 7. Cierre

- [x] 7.1 Confirmar que no se modifico `src/`
- [x] 7.2 Confirmar que no se modifico Docker, `.env`, endpoints ni `openapi.yaml`
- [x] 7.3 Confirmar que el cambio se aplico tras la autorizacion explicita actual
