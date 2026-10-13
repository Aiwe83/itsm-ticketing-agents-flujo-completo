# ITSM Ticketing Agents - flujo completo

Repositorio de referencia para un sistema de agentes orientado a la resolucion asistida de incidencias ITSM. El proyecto integra Jira, servicios backend, persistencia en MongoDB, ejecucion de agentes y un proxy LLM para construir un flujo trazable desde la creacion de un ticket hasta su procesamiento por agentes especializados.

El objetivo principal es automatizar parte del analisis inicial de incidencias, enriquecer la informacion disponible para los agentes y dejar evidencia tecnica del procesamiento realizado.

## Objetivos del proyecto

- Capturar tickets creados o enviados desde Jira.
- Normalizar y validar la informacion recibida.
- Persistir el ticket original, el ticket procesado y la ejecucion asociada.
- Convertir adjuntos relevantes a Markdown para que puedan ser usados por los agentes.
- Despachar el caso hacia un runtime de agentes.
- Centralizar las llamadas LLM a traves de un proxy controlado.
- Mantener trazabilidad mediante identificadores de correlacion.
- Facilitar pruebas locales, de integracion y de extremo a extremo.

## Arquitectura general

```text
Jira / Forge
  |
  | evento o envio manual
  v
bkt-jira-triggers / bkt-jira-forge
  |
  | POST /api/v1/issues
  v
bkt-integration-service
  |
  | persistencia + normalizacion + conversion de adjuntos
  v
MongoDB
  |
  | dispatch
  v
agent-runtime
  |
  | llamada de modelo
  v
bkt-cortex-proxy-llm
  |
  v
Proveedor LLM
```

## Componentes principales

### `bkt-jira-triggers`

Aplicacion Forge encargada de escuchar eventos de Jira y construir el contrato que se envia al servicio de integracion.

Responsabilidades:

- Escuchar eventos de creacion de tickets.
- Leer informacion ampliada del ticket desde Jira cuando el evento no incluye todos los campos necesarios.
- Preparar el payload para `bkt-integration-service`.
- Aplicar configuracion segura mediante variables Forge.
- Registrar trazas utiles para depuracion y auditoria.

Tecnologias:

- TypeScript
- Atlassian Forge
- Jest
- ESLint
- Zod

### `bkt-jira-forge`

Aplicacion Forge visual con panel integrado en Jira. Permite mostrar informacion contextual y ejecutar acciones manuales desde la interfaz.

Responsabilidades:

- Presentar una experiencia visual integrada en Jira.
- Mostrar informacion relacionada con el ticket.
- Permitir interacciones manuales con servicios backend.
- Mantener una interfaz consistente con la paleta visual definida para Forge.

Tecnologias:

- JavaScript
- React
- Vite
- Atlassian Forge
- CSS modular

### `bkt-integration-service`

Servicio principal de integracion. Recibe tickets, valida el contrato, persiste datos y coordina el envio hacia el runtime de agentes.

Responsabilidades:

- Exponer `POST /api/v1/issues`.
- Validar la autenticacion por API key.
- Persistir tickets originales y procesados en MongoDB.
- Registrar ejecuciones.
- Aplicar mappings y transformaciones.
- Descargar y procesar adjuntos.
- Convertir documentos soportados a Markdown.
- Despachar la ejecucion hacia `agent-runtime`.
- Publicar contrato OpenAPI.

Tecnologias:

- Node.js
- Express
- TypeScript
- MongoDB
- Mongoose
- Zod
- Jest
- Docker
- OpenAPI

### `bkt-integration-service-python`

Implementacion paralela en Python del servicio de integracion. Sirve como base de migracion y comparacion funcional frente a la version TypeScript.

Responsabilidades:

- Reproducir el contrato principal del servicio de integracion.
- Validar compatibilidad funcional con el flujo existente.
- Probar una arquitectura basada en Python para futuras evoluciones.

Tecnologias:

- Python
- Litestar
- Dishka
- MongoDB
- Pytest
- Docker

### `agent-runtime`

Runtime encargado de ejecutar agentes y adaptar la solicitud del servicio de integracion al modelo de conversacion interno.

Responsabilidades:

- Recibir peticiones de orquestacion.
- Resolver el agente correspondiente.
- Construir la solicitud de chat.
- Ejecutar el flujo del agente.
- Devolver el resultado de forma trazable.

Tecnologias:

- Python
- Litestar
- LangGraph
- MongoDB
- Redis
- OpenTelemetry
- Docker

### `bkt-cortex-proxy-llm`

Proxy para centralizar el acceso a modelos LLM y desacoplar los servicios internos del proveedor final.

Responsabilidades:

- Exponer una interfaz compatible con chat completions.
- Encapsular configuracion de proveedor.
- Centralizar trazas y observabilidad.
- Facilitar el control de llamadas a modelos.

Tecnologias:

- Python
- FastAPI
- OpenTelemetry
- Phoenix
- Docker

### `observability`

Stack auxiliar para observabilidad local.

Incluye:

- Docker Compose de observabilidad.
- Configuracion de Filebeat.
- Documentacion de soporte para levantar piezas de monitoreo.

## Flujo funcional

1. Se crea o envia un ticket desde Jira.
2. Forge captura el evento o accion manual.
3. Se construye un payload normalizado.
4. El servicio de integracion valida autenticacion y estructura.
5. Se guarda el ticket original.
6. Se aplican mappings y transformaciones.
7. Se procesan adjuntos soportados.
8. Se registra una ejecucion.
9. Se despacha el caso al runtime de agentes.
10. El runtime invoca el modelo mediante el proxy LLM.
11. La ejecucion queda trazada mediante identificadores de correlacion.

## Procesamiento de adjuntos

El servicio de integracion incluye soporte para convertir adjuntos a Markdown y hacerlos consumibles por los agentes.

Formatos contemplados:

- PDF
- Excel `xlsx`
- PowerPoint `pptx`
- Word `docx`
- JSON
- Markdown
- Texto plano

El procesamiento aplica controles de seguridad como validacion de tipo real, limites de tamano, timeouts y aislamiento de conversiones pesadas para evitar bloqueos del servicio.

## Seguridad y configuracion

El proyecto esta preparado para trabajar con configuracion externa y no requiere hardcodear secretos en codigo.

Buenas practicas aplicadas:

- API key configurable para el servicio de integracion.
- Variables de entorno para URLs, credenciales y proveedores.
- Ejemplos de entorno mediante `.env.example`.
- Separacion entre configuracion de Forge y backend.
- Evitar exponer secretos reales en el repositorio.
- Trazas con informacion operacional y sin necesidad de incluir credenciales.

## Ejecucion local

Cada subproyecto mantiene su propia forma de arranque. A nivel general:

```powershell
# Servicio de integracion
cd bkt-integration-service
docker compose up -d --build
```

```powershell
# Trigger Forge
cd bkt-jira-triggers
npm install
npm run typecheck
npm run lint
npm test -- --runInBand
```

```powershell
# Panel Forge
cd bkt-jira-forge
npm install
npm run build
```

```powershell
# Runtime de agentes
cd agent-runtime
make up
```

```powershell
# Proxy LLM
cd bkt-cortex-proxy-llm
docker compose up -d --build
```

## Pruebas

El proyecto combina varios niveles de validacion:

- Pruebas unitarias.
- Pruebas de contrato.
- Pruebas de integracion con MongoDB.
- Pruebas E2E locales.
- Pruebas manuales documentadas.
- Validaciones con Jira y Forge en entorno de desarrollo.

Documentacion util:

- `contexto_para_proyectos/pruebas_manuales/`
- `bkt-integration-service/e2e/`
- `bkt-integration-service/documentacion_servicio_integracion_tests/`
- `contexto_para_proyectos/explicaciones/`

## Observabilidad

El flujo esta pensado para facilitar diagnostico mediante:

- Logs estructurados.
- Identificadores de correlacion.
- Registro de ejecuciones.
- Trazas de servicios.
- Separacion entre evento de entrada, persistencia, dispatch y ejecucion de agentes.

## Estructura del repositorio

```text
.
|-- agent-runtime/
|-- bkt-cortex-proxy-llm/
|-- bkt-integration-service/
|-- bkt-integration-service-python/
|-- bkt-jira-forge/
|-- bkt-jira-triggers/
|-- contexto_para_proyectos/
|-- observability/
|-- graphify-out/
|-- CHANGELOG.md
|-- README.md
```

## Estado actual

El repositorio contiene el flujo completo de trabajo local y documentacion de soporte. Las piezas principales permiten demostrar el recorrido de un ticket desde Jira hasta el procesamiento por agentes, incluyendo persistencia, transformacion, adjuntos, dispatch y consumo de LLM.

El proyecto sigue evolucionando por bloques funcionales: configuracion segura de Forge, politica de reintentos, homogeneizacion visual, analisis de triggers de modificacion, pruebas E2E y observabilidad.

## Notas importantes

- No se deben subir credenciales reales al repositorio.
- Los archivos `.env.example` son plantillas de configuracion, no secretos.
- Los servicios pueden requerir variables externas para ejecutarse contra proveedores reales.
- Algunas pruebas dependen de Docker, MongoDB, Forge CLI o tuneles locales como ngrok.
- La carpeta `contexto_para_proyectos` contiene documentacion de trabajo, pruebas manuales y resumenes tecnicos del avance del proyecto.
