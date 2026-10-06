## 1. Configuracion segura

- [ ] 1.1 Anadir `TRUST_PROXY_HOPS` al esquema de entorno con mensajes de validacion comprensibles. La parte de API key de esta tarea ya esta cubierta: `cerrar-hallazgos-42crunch-ronda-2` anadio `API_KEY` (no `INTEGRATION_API_KEY`) como variable requerida, reutilizando el nombre de cabecera ya existente `API_KEY_HEADER`.
- [ ] 1.2 Rechazar en el arranque `CORS_CREDENTIALS=true` combinado con `CORS_ORIGIN=*`.
- [ ] 1.3 Alinear `.env.example` con `ORCHESTRATOR_BASE_URL`, `ORCHESTRATOR_ENDPOINT` y el resto de variables reales usando solo valores ficticios.
- [ ] 1.4 Actualizar Docker y pruebas para proporcionar claves ficticias sin exponer secretos.

## 2. Autenticacion y red

- [x] 2.1 Implementar middleware de API key con comparacion en tiempo constante y respuesta `401` reducida. Hecho en `cerrar-hallazgos-42crunch-ronda-2` (`src/middlewares/auth.middleware.ts`, comparacion por hash SHA-256 + `timingSafeEqual`).
- [x] 2.2 Proteger las rutas `/api/` y mantener `/health` accesible sin autenticacion. Hecho en `cerrar-hallazgos-42crunch-ronda-2` (`src/routes/index.ts`).
- [ ] 2.3 Aplicar `TRUST_PROXY_HOPS` a Express y comprobar que el rate limiter usa la IP esperada.
- [ ] 2.4 Anadir pruebas de clave valida, ausente e incorrecta, confirmando que los rechazos no escriben en MongoDB.
- [ ] 2.5 Anadir pruebas de CORS valido e invalido y de cabeceras permitidas.

## 3. Minimizacion de datos

- [ ] 3.1 Retirar `issue` y `transformedIssue` del contrato de respuesta publica conservando identificadores, resultado, errores y `201`.
- [ ] 3.2 Ampliar la redaccion del logger para API key, autorizacion, cookies y contrasenas de forma case-insensitive.
- [ ] 3.3 Confirmar mediante pruebas que logs y respuestas no contienen body, adjuntos, credenciales ni datos personales.
- [ ] 3.4 Actualizar la coleccion Postman y las guias manuales para enviar la cabecera y consultar el detalle en MongoDB.

## 4. Dependencias

- [ ] 4.1 Confirmar con busqueda completa si `bcryptjs` y `jsonwebtoken` carecen de uso y eliminarlos junto con sus tipos cuando corresponda.
- [ ] 4.2 Actualizar Mongoose, Mammoth, Express Rate Limit, UUID y dependencias transitivas a versiones corregidas compatibles.
- [ ] 4.3 Regenerar el lockfile sin cambiar el gestor de paquetes ni introducir paquetes no necesarios.
- [ ] 4.4 Ejecutar auditoria de produccion y confirmar cero vulnerabilidades criticas o altas.

## 5. Regresion y entrega

- [ ] 5.1 Verificar que exactamente un ticket autenticado sigue devolviendo `201` y se persiste correctamente.
- [ ] 5.2 Verificar que cero o varios tickets autenticados siguen devolviendo `400` sin persistencia.
- [ ] 5.3 Ejecutar typecheck, formato, lint, Jest con cobertura y build.
- [ ] 5.4 Documentar los cambios incompatibles de autenticacion y respuesta en README, CHANGELOG y documentacion operativa.
