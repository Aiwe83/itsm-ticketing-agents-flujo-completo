# 02 - Pruebas del flujo completo del servicio de integracion

## Objetivo

Este documento deja ordenadas las pruebas que demuestran que `bkt-integration-service` funciona como servicio completo:

```text
entrada HTTP -> validacion -> mappings -> persistencia -> adjuntos -> ejecucion -> orquestador
```

La idea no es probar solo adjuntos. Los adjuntos forman parte de la validacion, pero tambien se comprueba contrato HTTP, seguridad, persistencia, MongoDB, Docker y flujo real con Jira/Forge.

## Antes de empezar

Desde PowerShell, define la raiz del workspace:

```powershell
$RAIZ = "C:\Users\0021260\OneDrive - ViewNext\Escritorio\VisualStudio\Bankinter\proyectos\Sistema_de _agentes_para_resolucion_de_incidencias\itsm-ticketing-agents-flujo-completo"
cd "$RAIZ\bkt-integration-service"
```

Si `pnpm` no esta disponible en la maquina, usa `npm run <script>` para los scripts del `package.json`.

Ejemplos equivalentes:

```powershell
pnpm test
npm run test

pnpm test:e2e
npm run test:e2e
```

Para esta maquina, si PowerShell muestra `pnpm : El termino 'pnpm' no se reconoce`, usar directamente `npm run ...`.

## Nivel 1 - Unitarios y componentes

### Que valida

- Validacion del contrato de entrada.
- Middleware de API key.
- Manejo de errores sin exponer `stack`.
- Transformacion mediante mappings.
- Servicio principal de issues.
- Repositorios y modelos.
- Orquestador.
- Conversores de adjuntos.
- Limites de seguridad.
- Contrato OpenAPI sincronizado con rutas y schemas.

### Comando

Opcion recomendada si `pnpm` funciona:

```powershell
cd "$RAIZ\bkt-integration-service"
pnpm test
```

Alternativa si `pnpm` no funciona:

```powershell
cd "$RAIZ\bkt-integration-service"
npm run test
```

### Resultado esperado

La salida debe terminar sin errores y con las suites en verde. El formato exacto puede variar, pero debe verse algo de este estilo:

```text
Test Suites: ... passed, ... total
Tests:       ... passed, ... total
```

### Como interpretarlo

Esta prueba demuestra que las piezas internas del servicio funcionan de forma aislada. Si falla aqui, no tiene sentido seguir con E2E porque hay una pieza base rota.

## Nivel 2 - Integracion con persistencia

### Que valida

- `POST /api/v1/issues`.
- Insercion del ticket bruto en `itsm_tickets`.
- Generacion del ticket normalizado en `tickets`.
- Trazabilidad en `executions`.
- Reintentos de Jira sin duplicar documentos.
- Fallo de mapping registrado sin perder el ticket bruto.
- Fallo del orquestador registrado sin romper la respuesta HTTP.
- Adjuntos integrados en `content.attachedDocuments` cuando aplican.

### Comando

```powershell
cd "$RAIZ\bkt-integration-service"
npx jest src/__tests__/issues.integration.test.ts --runInBand
```

### Resultado esperado

Debe aparecer la suite de integracion en verde:

```text
PASS src/__tests__/issues.integration.test.ts
Test Suites: 1 passed, 1 total
Tests:       ... passed, ... total
```

### Como interpretarlo

Esta prueba demuestra que el servicio no solo transforma datos en memoria. Tambien persiste documentos, relaciona ticket bruto y ticket normalizado, registra ejecuciones y controla fallos sin perder trazabilidad.

## Nivel 3 - E2E local del servicio con adjuntos

### Que valida

Este nivel usa un Jira falso local y Mongo de test para validar el camino completo dentro del servicio.

Valida:

- ticket con 10 adjuntos;
- descarga autenticada desde un Jira simulado;
- redireccion de descarga;
- conversion de formatos soportados;
- omision controlada de formatos no soportados o corruptos;
- persistencia del resultado en Mongo;
- continuidad del ticket aunque un adjunto falle.

### Comando

Opcion recomendada si `pnpm` funciona:

```powershell
cd "$RAIZ\bkt-integration-service"
pnpm test:e2e
```

Alternativa si `pnpm` no funciona:

```powershell
cd "$RAIZ\bkt-integration-service"
npm run test:e2e
```

### Resultado esperado

Debe verse la suite E2E en verde:

```text
PASS src/__tests__/e2e/attachments.e2e.test.ts
Test Suites: 1 passed, 1 total
Tests:       2 passed, 1 skipped, 3 total
```

Es normal que aparezca `1 skipped` si no se activa el caso hostil. Ese caso solo se ejecuta cuando se define `E2E_HOSTILE=1`.

### Caso hostil opcional

Este caso valida que un Excel pesado o malicioso no bloquee el hilo principal.

Con `pnpm`:

```powershell
cd "$RAIZ\bkt-integration-service"
$env:E2E_HOSTILE = "1"
pnpm test:e2e
Remove-Item Env:E2E_HOSTILE
```

Con `npm`:

```powershell
cd "$RAIZ\bkt-integration-service"
$env:E2E_HOSTILE = "1"
npm run test:e2e
Remove-Item Env:E2E_HOSTILE
```

Resultado esperado con el caso hostil activo:

```text
PASS src/__tests__/e2e/attachments.e2e.test.ts
Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
```

### Como interpretarlo

Esta prueba demuestra que el servicio procesa el ticket completo en local: recibe el payload, simula Jira, descarga adjuntos, convierte lo soportado, omite lo invalido y guarda el resultado esperado.

## Nivel 4 - Docker y Mongo reales

### Que valida

Comprueba que las piezas necesarias levantan correctamente en contenedores, especialmente MongoDB.

### Comandos

Arrancar servicio y Mongo:

```powershell
cd "$RAIZ\bkt-integration-service"
docker compose up -d --build
```

Ver contenedores:

```powershell
docker ps --format "table {{.Names}}\t{{.Ports}}\t{{.Status}}" | Select-String -Pattern "bkt-integration-service|mongo"
```

Comprobar health del servicio:

```powershell
Invoke-RestMethod http://localhost:8000/health | ConvertTo-Json -Depth 5
```

### Resultado esperado

En Docker deben verse los contenedores levantados:

```text
bkt-integration-service          Up
bkt-integration-service-mongo-1  Up ... healthy
```

El endpoint `/health` debe devolver Mongo conectado:

```json
{
  "message": "OK",
  "environment": "local",
  "database": "connected"
}
```

### Como interpretarlo

Esta prueba demuestra que el entorno local real esta sano: la app arranca, Mongo arranca y el servicio puede conectarse a la base de datos.

## Nivel 5 - Flujo real con Jira, Forge, servicio y Mongo

### Que valida

Valida el flujo mas parecido al uso real:

```text
Jira -> Forge trigger -> ngrok -> bkt-integration-service -> Mongo
```

### Preflight antes de crear el ticket

```powershell
cd "$RAIZ\bkt-integration-service\e2e"
node preflight.js
```

Resultado esperado:

```text
PASS  Servicio y Mongo
PASS  Variable de Forge: URL del servicio
PASS  Variables de Forge: clave y cabecera
PASS  Tunel ngrok
PASS  Trigger instalado
PASS  Token de Jira
Todo en orden: se puede crear el ticket de prueba.
```

Si algun punto sale `FAIL`, no crear el ticket todavia. Primero corregir lo que indique el propio preflight.

### Crear el ticket en Jira

Crear un ticket real en Jira y adjuntar los documentos de prueba desde:

```text
contexto_para_proyectos\pruebas_manuales\documentos_prueba
```

Documentos esperados:

```text
01_incidencia_pdf.pdf
02_incidencias_excel.xlsx
03_revision_powerpoint.pptx
04_configuracion.json
05_notas.md
06_notas_sin_extension
07_excel_corrupto.xlsx
08_captura.png
09_pdf_renombrado.pdf
10_Detalle_incidencia_informe_mensual.docx
```

### Verificar en Mongo

Sustituir `BFC-XX` por la clave del ticket creado:

```powershell
cd "$RAIZ\bkt-integration-service\e2e"
node verify.js BFC-XX --timeout 600
```

Resultado esperado:

```text
PASS  01_incidencia_pdf.pdf - convertido (...)
PASS  02_incidencias_excel.xlsx - convertido (...)
PASS  03_revision_powerpoint.pptx - convertido (...)
PASS  04_configuracion.json - convertido (...)
PASS  05_notas.md - convertido (...)
PASS  06_notas_sin_extension - unsupported
PASS  07_excel_corrupto.xlsx - unsupported
PASS  08_captura.png - unsupported
PASS  09_pdf_renombrado.pdf - unsupported
PASS  10_Detalle_incidencia_informe_mensual.docx - convertido (...)

Todo coincide con expected.json (10 adjuntos).
```

Nota: el timeout de 600 segundos evita falsos fallos cuando Forge tarda varios minutos en entregar el evento real.

### Revisar logs del trigger

```powershell
cd "$RAIZ\bkt-jira-triggers"
npm run logs
```

Resultado esperado:

```text
Invocaciones            1
Enviados y aceptados    1
Enviados con fallo      0
```

### Como interpretarlo

Esta es la prueba mas importante para demostrar el flujo real: Jira crea el ticket, Forge dispara el trigger, el servicio recibe la peticion, Mongo guarda el resultado y los adjuntos quedan verificados contra `expected.json`.

## Resumen de cobertura

- **Unitarios**: validan piezas pequenas y reglas de negocio.
- **Integracion**: valida HTTP, persistencia, mappings y ejecuciones.
- **E2E local**: valida el servicio completo con Jira simulado y adjuntos.
- **Docker/Mongo**: valida infraestructura local real.
- **E2E real**: valida Jira, Forge, ngrok, servicio y Mongo trabajando juntos.

## Criterio de cierre

La tarea se puede considerar cubierta cuando:

- `pnpm test` o `npm run test` esta en verde;
- `npx jest src/__tests__/issues.integration.test.ts --runInBand` esta en verde;
- `pnpm test:e2e` o `npm run test:e2e` esta en verde;
- Docker levanta app y Mongo;
- `/health` devuelve base de datos conectada;
- `node preflight.js` sale en `PASS`;
- un ticket real se verifica con `node verify.js BFC-XX --timeout 600`;
- los resultados se pueden explicar sin depender de capturas ni datos sensibles.
