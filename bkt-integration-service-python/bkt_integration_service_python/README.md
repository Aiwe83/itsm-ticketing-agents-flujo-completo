# bkt_integration_service_python

Paquete principal del servicio Python `bkt-integration-service`. Contiene la
implementacion Litestar + Dishka encargada de recibir tickets ITSM/Jira,
validarlos, persistirlos en MongoDB, aplicar mappings de transformacion y lanzar
el dispatch hacia `agent-runtime`.

Este README documenta la estructura interna del paquete. Para instrucciones de
arranque, Docker, variables de entorno y pruebas, ver el `README.md` de la raiz
del repositorio.

## Responsabilidad del paquete

El paquete implementa el camino principal de integracion:

```text
POST /api/v1/issues
  -> validacion de contrato
  -> persistencia del ticket bruto
  -> carga y aplicacion de mappings
  -> persistencia del ticket transformado
  -> registro de ejecucion
  -> dispatch hacia agent-runtime
```

La respuesta HTTP confirma que la integracion acepto y proceso el ticket. El
dispatch al orquestador se lanza de forma desacoplada para no bloquear la
respuesta de la API.

## Estructura

```text
bkt_integration_service_python/
  api/
    routes/        Endpoints HTTP.
    schemas/       Contratos de entrada y salida.
  clients/         Cliente HTTP hacia agent-runtime.
  core/            Configuracion, seguridad, logging, errores y contenedor DI.
  domain/          Modelos de dominio y motor de mappings.
  repositories/    Persistencia MongoDB.
  services/        Casos de uso y orquestacion de la ingesta.
  main.py          Construccion de la aplicacion Litestar.
```

## Flujo funcional

1. `api/routes/issues.py` recibe `POST /api/v1/issues`.
2. `api/schemas/issue.py` valida la forma minima del payload.
3. `core/security.py` comprueba la API key usando comparacion segura.
4. `services/issue_ingestion.py` coordina el proceso completo.
5. `repositories/` guarda ticket bruto, ticket transformado y ejecucion.
6. `domain/mappings.py` aplica los mappings activos para el `MESH_ID`.
7. `clients/orchestrator.py` invoca `agent-runtime`.

## Componentes clave

### API

La API expone:

- `GET /health`: sonda tecnica del servicio y MongoDB.
- `POST /api/v1/issues`: entrada principal de tickets.

El contrato de `POST /api/v1/issues` espera una lista `issues` con un unico
ticket. Esta restriccion replica el comportamiento validado para el flujo actual
con `bkt-jira-triggers`.

### Seguridad

La autenticacion se realiza mediante cabecera `X-API-KEY`. La comparacion se
hace con hash SHA-256 y `hmac.compare_digest` para evitar comparaciones directas
de texto plano en el flujo de validacion.

Los errores de autenticacion mantienen una respuesta uniforme para no revelar
detalles internos del mecanismo de validacion.

### Mappings

El motor de mappings esta en `domain/mappings.py`. Soporta:

- rutas anidadas;
- acceso a arrays con `[*]` y `[n]`;
- campos obligatorios;
- transformadores definidos por configuracion;
- salida normalizada en `transformedIssue.content`.

El servicio solo aplica mappings cuyo `meshId` coincide con la variable
`MESH_ID`. Si no hay coincidencia, el ticket puede persistirse, pero la salida
transformada quedara incompleta.

### Persistencia

El paquete usa MongoDB para cuatro colecciones principales:

- `itsm_tickets`: payload bruto recibido.
- `tickets`: ticket transformado.
- `executions`: estado de la ejecucion.
- `mappings`: reglas de transformacion.

Los identificadores internos se tratan como strings para mantener consistencia
con el contrato de integracion y evitar diferencias no deseadas con `ObjectId`.

### Dispatch

El dispatch hacia `agent-runtime` se lanza despues de persistir la informacion
necesaria. Si el orquestador responde correctamente, la ejecucion registra el
resultado como satisfactorio. Si falla, el error queda registrado sin impedir
que el servicio mantenga trazabilidad del ticket procesado.

## Decisiones tecnicas

- Litestar se usa como framework HTTP por su integracion limpia con DI y tipos.
- Dishka centraliza la construccion de dependencias.
- La configuracion se concentra en `core/config.py`.
- El motor de mappings se mantiene aislado en dominio porque es la pieza de
  mayor riesgo funcional de la migracion.
- Los clientes externos viven fuera de servicios para separar infraestructura y
  caso de uso.

## Pruebas relacionadas

Los tests unitarios viven fuera del paquete, en `tests/unit`. Cubren
principalmente:

- seguridad de API key;
- validacion de payload;
- transformacion por mappings;
- comportamiento con campos opcionales, obligatorios, arrays y rutas anidadas.

Comando habitual:

```powershell
uv run python -m pytest tests -v
```

Resultado esperado en la version validada:

```text
30 passed
```

## Limitaciones actuales

- El enriquecimiento de adjuntos de Jira no forma parte de esta primera version.
- La cobertura automatizada actual se concentra en unitarios; las carpetas de
  contrato e integracion quedan preparadas para ampliar validacion.
- La comparacion formal contra TypeScript debe ejecutarse con los mismos
  mappings, `MESH_ID` y payloads de referencia.
