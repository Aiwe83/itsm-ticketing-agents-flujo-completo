## 1. Estados operativos de la ejecucion

- [ ] 1.1 Anadir los enums `integrationStatus`, `attachmentStatus` y `orchestratorStatus` al modelo y tipos de `Execution`
- [ ] 1.2 Actualizar el flujo API y worker para transicionar cada fase entre `pending`, `succeeded`, `failed` y `skipped`
- [ ] 1.3 Mantener los booleanos anteriores derivados de los nuevos estados durante la compatibilidad
- [ ] 1.4 Adaptar las lecturas para tolerar ejecuciones historicas sin enums
- [ ] 1.5 Anadir pruebas de exito, fallo, omision y compatibilidad historica

## 2. Liveness y readiness

- [ ] 2.1 Mantener `/health` como liveness sin dependencias externas
- [ ] 2.2 Implementar comprobaciones acotadas de conexion MongoDB, indices y mappings minimos
- [ ] 2.3 Crear `GET /ready` con respuestas `200` y `503` sanitizadas
- [ ] 2.4 Comprobar el arranque del worker cuando `PROCESS_ROLE=all`
- [ ] 2.5 Anadir pruebas del endpoint preparado y de cada dependencia ausente

## 3. Logging estructurado y seguro

- [ ] 3.1 Definir el formato estructurado para peticion, ticket, trabajo, revision, intento, fase y duracion
- [ ] 3.2 Propagar `requestId` desde Express hasta la ejecucion, outbox y worker
- [ ] 3.3 Implementar una serializacion de errores que elimine payloads, adjuntos, datos personales y secretos
- [ ] 3.4 Escribir logs operativos en stdout/stderr y configurar la rotacion de Docker
- [ ] 3.5 Anadir pruebas que aseguren la correlacion y ausencia de valores sensibles

## 4. Formato, lint y cobertura

- [ ] 4.1 Crear `eslint.config.js` compatible con ESLint 9 y los patrones TypeScript del repositorio
- [ ] 4.2 Incorporar scripts `lint`, `format` y `format:check` reproducibles
- [ ] 4.3 Aplicar Prettier en un cambio mecanico separado y comprobar que no altera comportamiento
- [ ] 4.4 Configurar los umbrales iniciales de cobertura 69/51/53/70
- [ ] 4.5 Elevar sentencias a 75% y ramas a 60% al completar las pruebas de outbox

## 5. Pipeline y seguridad de dependencias

- [ ] 5.1 Configurar instalacion reproducible, typecheck, formato, lint, Jest, auditoria y build Docker en el pipeline
- [ ] 5.2 Hacer fallar la entrega ante vulnerabilidades `high` o `critical` sin excepcion documentada
- [ ] 5.3 Documentar formato, responsable y caducidad de una excepcion temporal de seguridad
- [ ] 5.4 Ejecutar el pipeline completo y corregir todas las regresiones dentro del alcance

## 6. Ensayo escalable

- [ ] 6.1 Preparar Docker Compose de ensayo con dos APIs y dos workers
- [ ] 6.2 Crear el generador de 50 peticiones concurrentes con tickets distintos y medida de latencia
- [ ] 6.3 Crear la comprobacion posterior de raw, traducidos, trabajos finales y ausencia de duplicados
- [ ] 6.4 Ejecutar el ensayo y registrar versiones, recursos, p95, errores y resultado
- [ ] 6.5 Corregir perdidas, duplicados o trabajos no terminales antes de aceptar el piloto

## 7. Documentacion y demostracion

- [ ] 7.1 Actualizar la guia operativa con el significado sencillo de cada estado
- [ ] 7.2 Crear una demostracion de dos minutos con Postman y MongoDB Compass para raw, traducido, ejecucion y trabajo
- [ ] 7.3 Documentar la diferencia entre `/health` y `/ready` sin mostrar informacion sensible
- [ ] 7.4 Ejecutar la demostracion desde un entorno limpio y corregir pasos ambiguos
- [ ] 7.5 Revisar que README, CHANGELOG y documentacion operativa reflejen el comportamiento final
