# Documentacion y pruebas del servicio de integracion

Fecha: 2026-10-05.

Este documento resume el funcionamiento completo de `bkt-integration-service` y las pruebas que demuestran que el servicio esta cubierto a nivel unitario, integracion, Docker/Mongo y flujo real. La idea es que pueda leerse como explicacion principal del servicio, sin depender de una conversacion previa ni de una tarea concreta.

## Resumen ejecutivo

`bkt-integration-service` es la capa de integracion entre Jira y el flujo interno de agentes. Recibe tickets, valida el contrato de entrada, guarda el payload original, lo transforma al modelo interno mediante mappings, procesa adjuntos cuando existen, registra la ejecucion y avisa al siguiente componente del flujo.

El flujo funcional es:

```text
Jira -> Forge trigger -> bkt-integration-service -> MongoDB -> agent-runtime
```

La responsabilidad del servicio no es resolver la incidencia. Su responsabilidad es preparar el ticket de forma fiable, trazable y segura para que el resto del sistema pueda trabajar con una version normalizada.

## Flujo del servicio

1. **Jira genera el evento**
   - Se crea un ticket en el proyecto configurado.
   - El ticket puede llegar con descripcion, prioridad, tipo, estado, componentes, responsable y adjuntos.

2. **Forge dispara el trigger**
   - `bkt-jira-triggers` escucha el evento de Jira.
   - Recupera la informacion necesaria del ticket.
   - Construye el payload esperado por el servicio.
   - Llama a `POST /api/v1/issues` usando la API key configurada.

3. **El servicio recibe el ticket**
   - Valida la API key.
   - Valida que el JSON cumpla el contrato.
   - Acepta exactamente un ticket por peticion.
   - Rechaza payloads vacios, multiples o mal formados.

4. **Se guarda el ticket bruto**
   - El documento original se persiste en `itsm_tickets`.
   - Esto permite auditar que llego desde Jira antes de cualquier transformacion.

5. **Se aplica la traduccion por mappings**
   - El servicio carga los mappings activos desde MongoDB.
   - Traduce campos Jira al modelo interno.
   - Genera un documento normalizado para el flujo de agentes.

6. **Se guarda el ticket normalizado**
   - El resultado se persiste en `tickets`.
   - La version normalizada conserva la relacion con el ticket bruto.
   - Si hay adjuntos procesables, se incorporan en `content.attachedDocuments`.

7. **Se registra la ejecucion**
   - La coleccion `executions` deja traza del procesamiento.
   - Se registra si el ticket se preparo correctamente.
   - Tambien se registran fallos controlados, por ejemplo errores del orquestador.

8. **Se avisa al orquestador**
   - El servicio notifica a `agent-runtime`.
   - La respuesta HTTP del servicio no debe depender de que el orquestador termine todo el trabajo.
   - Si el aviso falla, el fallo queda trazado sin perder el ticket.

## Componentes principales

El servicio esta organizado por responsabilidades:

```text
src/
  config/        Configuracion de entorno, MongoDB y logger
  controllers/   Entrada HTTP
  middlewares/   API key, validacion, logging y errores
  models/        Modelos Mongoose
  repositories/  Acceso a MongoDB
  routes/        Definicion de endpoints
  services/      Logica principal de negocio
  validators/    Validacion del contrato de entrada
  __tests__/     Pruebas unitarias, integracion y E2E local
```

Piezas clave:

- `issue.service.ts`: coordina recepcion, persistencia, mappings, adjuntos y ejecucion.
- `orchestrator.service.ts`: encapsula la llamada al siguiente componente.
- `attachment.service.ts`: procesa adjuntos y controla errores por fichero.
- `jira-attachment.fetcher.ts`: descarga adjuntos reales desde Jira.
- `issue.validator.ts`: valida el contrato de entrada.

## Contrato HTTP

Endpoint principal:

```text
POST /api/v1/issues
```

Forma general del payload:

```json
{
  "initiatedBy": "origen-del-evento",
  "issues": [
    {
      "id": "id-jira",
      "key": "BFC-XX",
      "fields": {
        "summary": "Resumen del ticket",
        "description": "Descripcion del ticket",
        "issuetype": { "name": "Consulta" },
        "status": { "name": "Recibida" },
        "priority": { "name": "Medium" },
        "attachment": []
      }
    }
  ]
}
```

Respuesta esperada cuando el ticket se acepta:

```text
HTTP 201
success: true
message: Issues accepted
```

El servicio tambien expone:

- `GET /health`: comprueba que la aplicacion esta viva y que MongoDB esta conectado.
- `GET /api/v1`: informacion basica del servicio, protegida por API key.

## Seguridad y control de errores

El servicio aplica varias medidas de seguridad basicas:

- API key obligatoria para los endpoints protegidos.
- Mismo mensaje de error para API key ausente o incorrecta.
- Variables obligatorias validadas al arrancar.
- Errores HTTP sin `stack trace`.
- Logs estructurados para trazabilidad tecnica.
- Procesamiento de adjuntos tratado como entrada no confiable.

Un fallo parcial no debe romper todo el flujo. Por ejemplo:

- si un adjunto no se puede convertir, se marca con `skippedReason`;
- si el orquestador falla, el ticket sigue persistido y el fallo queda registrado;
- si un mapping obligatorio falla, el ticket bruto queda conservado para analisis.

## Persistencia en MongoDB

MongoDB es la pieza que permite comprobar la trazabilidad completa. Las colecciones principales son:

- `itsm_tickets`: ticket bruto recibido desde Jira.
- `tickets`: ticket normalizado que consume el flujo interno.
- `executions`: estado de la ejecucion y despacho.
- `mappings`: reglas de traduccion entre Jira y el modelo interno.

La prueba correcta no debe mirar solo si hubo `201`. Tambien debe verificar que Mongo contiene los documentos esperados y que el ticket normalizado tiene la informacion util para el siguiente componente.

## Mappings

Los mappings convierten campos de Jira en campos internos. Esto permite separar el contrato externo del modelo usado por los agentes.

Ejemplo conceptual:

```text
fields.summary -> content.title
fields.description -> content.issueDescription
fields.status.name -> content.status
```

La documentacion versionada del catalogo vive en:

```text
docs/mappings
```

El punto importante es que el servicio no copia el ticket sin control. Guarda el bruto y genera una version traducida y trazable.

## Adjuntos

Los adjuntos forman parte del flujo general. El servicio los trata como contenido no confiable, por lo que no basta con mirar la extension del fichero.

Formatos soportados:

- texto;
- Word;
- PDF;
- Excel;
- PowerPoint;
- JSON;
- Markdown.

Comportamiento esperado:

- los formatos soportados se convierten a Markdown;
- el resultado se guarda en `tickets.content.attachedDocuments`;
- los ficheros corruptos, falsos o no soportados se omiten de forma controlada;
- un adjunto fallido no rompe el ticket completo;
- los conversores de mayor riesgo se ejecutan aislados para evitar bloqueos.

Esto permite que el agente reciba informacion textual util sin depender del formato original del fichero.

## Pruebas que cubren el servicio

La cobertura se organiza por niveles.

### 1. Unitarias y componentes

Comando:

```powershell
cd "$RAIZ\bkt-integration-service"
pnpm test
```

Si `pnpm` no esta disponible:

```powershell
npm run test
```

Demuestra:

- validacion del contrato;
- seguridad por API key;
- errores sin exponer detalles internos;
- transformacion por mappings;
- comportamiento del servicio principal;
- conversores de adjuntos;
- reglas de limites y casos negativos.

### 2. Integracion con persistencia

Comando:

```powershell
cd "$RAIZ\bkt-integration-service"
npx jest src/__tests__/issues.integration.test.ts --runInBand
```

Demuestra:

- entrada HTTP realista;
- persistencia en `itsm_tickets`, `tickets` y `executions`;
- reintentos sin duplicados;
- fallos controlados;
- adjuntos integrados en el ticket normalizado.

### 3. E2E local del servicio

Comando:

```powershell
cd "$RAIZ\bkt-integration-service"
pnpm test:e2e
```

Si `pnpm` no esta disponible:

```powershell
npm run test:e2e
```

Demuestra:

- servicio completo con Jira simulado;
- descarga de adjuntos;
- conversion a Markdown;
- omision controlada de ficheros invalidos;
- persistencia final en Mongo de test.

### 4. Docker y Mongo reales

Comandos:

```powershell
cd "$RAIZ\bkt-integration-service"
docker compose up -d --build
Invoke-RestMethod http://localhost:8000/health | ConvertTo-Json -Depth 5
```

Demuestra:

- el servicio arranca en contenedor;
- MongoDB esta disponible;
- la aplicacion puede conectarse a la base de datos.

### 5. Flujo real Jira / Forge / servicio / Mongo

Comandos de apoyo:

```powershell
cd "$RAIZ\bkt-integration-service\e2e"
node preflight.js
node verify.js BFC-XX --timeout 600
```

Demuestra:

- Jira crea el ticket real;
- Forge dispara el trigger;
- el servicio recibe la llamada;
- Mongo guarda el resultado;
- los adjuntos esperados coinciden con `expected.json`;
- el flujo completo queda verificable sin revisar Mongo a mano.

## Como usar esta carpeta

Esta carpeta funciona como documento de cierre y explicacion tecnica:

- `README.md`: explicacion principal para revision.
- `01_documentacion_servicio_integracion.md`: detalle tecnico del servicio.
- `02_pruebas_flujo_completo.md`: guia de pruebas y criterios de aceptacion.

Las pruebas ejecutables se mantienen fuera de esta carpeta para no duplicar herramientas:

```text
bkt-integration-service\e2e
contexto_para_proyectos\pruebas_manuales\documentos_prueba
```

## Que demuestra la entrega

Esta documentacion permite explicar que el servicio esta cubierto en tres planos:

- **Funcional**: recibe, valida, transforma y persiste tickets.
- **Tecnico**: mantiene trazabilidad, seguridad de entrada y control de errores.
- **Operativo**: se puede probar con unitarios, integracion, Docker/Mongo y flujo real.

La parte de adjuntos queda incluida como una capacidad del servicio, pero no como unico foco de la validacion.

## Criterio de cierre

La entrega queda lista cuando se pueda demostrar:

- `pnpm test` en verde;
- prueba de integracion principal en verde;
- `pnpm test:e2e` en verde;
- Docker levanta servicio y MongoDB;
- `/health` devuelve Mongo conectado;
- `node preflight.js` valida el entorno real;
- `node verify.js BFC-XX --timeout 600` confirma los documentos esperados;
- los resultados pueden explicarse sin mostrar secretos ni depender de capturas sensibles.
