#!/usr/bin/env node
/**
 * Demo local del trigger de Jira Forge.
 *
 * Ejecuta el codigo real compilado en dist/ sin necesidad de:
 *   - sesion autenticada de Forge
 *   - un sitio de Jira
 *   - el servicio integration-service
 *
 * Uso:  node scripts/demo-local.js <escenario>
 *       npm run demo -- <escenario>
 *
 * Escenarios: created | updated | pii | invalid | errors | wire | all
 *
 * Ademas, para la demo en vivo (no forman parte de 'all'):
 *   listen [puerto]   deja el receptor HTTP levantado hasta Ctrl+C
 *   send   [puerto]   envia una peticion real contra ese receptor
 */

'use strict';

const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

const DIST = path.join(__dirname, '..', 'dist');

if (!fs.existsSync(path.join(DIST, 'handler.js'))) {
  console.error('\nNo existe dist/. Ejecuta primero:\n\n    npm run build\n');
  process.exit(1);
}

const { handleJiraIssueEvent } = require(path.join(DIST, 'handler.js'));
const { sendIssueToIntegrationService } = require(path.join(DIST, 'integration-client.js'));
const { canaries, createdEvent, updatedEvent } = require(
  path.join(DIST, '__tests__', 'fixtures', 'events.js')
);

// ------------------------------------------------------------------ salida --

const LINE = '='.repeat(78);
const THIN = '-'.repeat(78);

function title(text) {
  console.log('\n' + LINE);
  console.log('  ' + text);
  console.log(LINE);
}

function step(text) {
  console.log('\n' + THIN);
  console.log('  ' + text);
  console.log(THIN);
}

function note(text) {
  console.log('\n  > ' + text);
}

/** Imprime una linea de traza del handler: cabecera + JSON legible. */
function printTrace(line) {
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    console.log(line);
    return;
  }
  console.log('\n  [' + parsed.eventName + ']');
  console.log(
    JSON.stringify(parsed, null, 2)
      .split('\n')
      .map((l) => '  ' + l)
      .join('\n')
  );
}

/** Recolector de trazas: las guarda y las imprime. */
function makeCollector({ print = true } = {}) {
  const lines = [];
  return {
    lines,
    log(line) {
      lines.push(line);
      if (print) printTrace(line);
    },
    text() {
      return lines.join('\n');
    },
    names() {
      return lines.map((l) => {
        try {
          return JSON.parse(l).eventName;
        } catch {
          return '<no-json>';
        }
      });
    }
  };
}

// ------------------------------------------------------- eventos de demo ----
// Datos ficticios con texto realista. Ningun dato real de cliente.

function demoCreatedEvent() {
  return {
    eventType: 'avi:jira:created:issue',
    selfGenerated: false,
    issue: {
      id: '10412',
      key: 'BFC-3',
      fields: {
        summary: 'El cliente no puede completar una transferencia desde la app movil',
        description: { content: [{ text: 'Reportado por el canal de soporte telefonico.' }] },
        project: { key: 'BFC' },
        issuetype: { name: 'Incidencia' },
        status: { name: 'Abierta' },
        priority: { name: 'Alta' },
        created: '2026-08-17T08:14:00.000+0000',
        updated: '2026-08-17T08:14:00.000+0000',
        resolutiondate: null
      }
    }
  };
}

function demoUpdatedEvent() {
  const base = demoCreatedEvent();
  return {
    ...base,
    eventType: 'avi:jira:updated:issue',
    jiraEventTypeName: 'issue_generic',
    issue: {
      ...base.issue,
      fields: {
        ...base.issue.fields,
        status: { name: 'En curso' },
        priority: { name: 'Critica' },
        updated: '2026-08-17T09:02:00.000+0000'
      }
    },
    changelog: {
      items: [
        {
          field: 'status',
          fieldId: 'status',
          fieldtype: 'jira',
          fromString: 'Abierta',
          toString: 'En curso'
        },
        {
          field: 'priority',
          fieldId: 'priority',
          fieldtype: 'jira',
          fromString: 'Alta',
          toString: 'Critica'
        }
      ]
    }
  };
}

/** Dispatcher falso: registra la llamada y devuelve una respuesta correcta. */
function makeRecordingSender() {
  const calls = [];
  const send = async (payload, correlationId) => {
    calls.push({ payload, correlationId });
    return {
      sent: true,
      success: true,
      status: 201,
      requestIdEcho: correlationId,
      executionId: '3f7c1e88-0b2a-4d51-9a6e-11c4b0d9a742',
      storedTicketId: 'MESH-DEMO:' + payload.issues[0].key,
      ticketsSucceeded: 1,
      ticketsFailed: 0,
      orchestratorDispatched: false
    };
  };
  return { calls, send };
}

// ---------------------------------------------------------------- respuesta --

/** Construye un objeto tipo Response minimo, suficiente para el cliente. */
function fakeResponse({ ok, status, body, requestId }) {
  return {
    ok,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'x-request-id' ? requestId : null) },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body))
  };
}

const VALID_ENV = {
  INTEGRATION_SERVICE_BASE_URL: 'https://servicio-de-ejemplo.invalid',
  INTEGRATION_SERVICE_API_KEY: 'clave-ficticia-solo-para-demo',
  INTEGRATION_SERVICE_API_KEY_HEADER: 'X-API-KEY'
};

// ================================================================ ESCENARIOS ==

async function scenarioCreated() {
  title('P2 - Se crea una incidencia en Jira');
  note('Evento de creacion simulado. Sin Forge, sin Jira, sin integration-service.');
  note('El envio se sustituye por un registrador local, para no depender de red.');

  const collector = makeCollector();
  const sender = makeRecordingSender();

  await handleJiraIssueEvent(demoCreatedEvent(), {}, { log: collector.log, send: sender.send });

  step('Resultado');
  const names = collector.names();
  console.log('  Lineas de traza emitidas: ' + names.length);
  names.forEach((n, i) => console.log('    ' + (i + 1) + '. ' + n));

  const built = JSON.parse(collector.lines[2]);
  const sent = sender.calls[0];

  console.log('\n  Contrato valido            : ' + built.contractValid);
  console.log('  Titulo en la traza         : ' + built.payload.issues[0].fields.summary);
  console.log('  Titulo realmente enviado   : "' + sent.payload.issues[0].fields.summary + '"');
  console.log('  Identificador de correlacion: ' + sent.correlationId);

  const ok = built.contractValid === true && sender.calls.length === 1;
  console.log('\n  ' + (ok ? 'CORRECTO' : 'FALLO') + ': el trigger construyo y entrego el payload.');
  return ok;
}

async function scenarioUpdated() {
  title('P3 - Se actualiza la incidencia en Jira');
  note('Evento de actualizacion con historial de cambios (status y priority).');
  note('Para la primera prueba E2E, el handler lo registra y lo ignora para evitar duplicados.');

  const collector = makeCollector();
  const sender = makeRecordingSender();

  await handleJiraIssueEvent(demoUpdatedEvent(), {}, { log: collector.log, send: sender.send });

  step('Resultado');
  const received = JSON.parse(collector.lines[0]);
  const skipped = JSON.parse(collector.lines[2]);

  console.log('  Tipo de evento          : ' + received.eventType);
  console.log('  Campos modificados      : ' + JSON.stringify(received.changedFieldNames));
  console.log('  Decision del handler    : ' + skipped.reason);
  console.log('  Intentos de envio       : ' + sender.calls.length);

  // Valores que SOLO existen en el historial de cambios: son los antiguos.
  // Los nuevos ("En curso", "Critica") si aparecen en la traza, y con razon:
  // son el estado y la prioridad actuales del ticket, que estan autorizados.
  const soloEnHistorial = { 'estado anterior': 'Abierta', 'prioridad anterior': 'Alta' };
  const raw = collector.text();

  console.log('\n  El historial de Jira guarda el valor anterior y el nuevo de cada campo.');
  console.log('  La traza conserva el NOMBRE del campo y el valor ACTUAL, nunca el anterior.\n');

  console.log('  Valor actual, autorizado     estado="' + received.statusName + '"');
  const filtrados = Object.entries(soloEnHistorial).filter(([, v]) =>
    raw.includes('"' + v + '"')
  );
  Object.entries(soloEnHistorial).forEach(([etiqueta, valor]) => {
    const leaked = raw.includes('"' + valor + '"');
    console.log(
      '  ' +
        (leaked ? 'FILTRADO' : 'descartado') +
        '                   ' +
        etiqueta +
        '="' +
        valor +
        '"'
    );
  });

  const ok =
    received.changedFieldNames.length === 2 &&
    skipped.eventName === 'jira.event.skipped' &&
    skipped.reason === 'UNSUPPORTED_EVENT_TYPE' &&
    sender.calls.length === 0 &&
    filtrados.length === 0;
  console.log(
    '\n  ' + (ok ? 'CORRECTO' : 'FALLO') + ': el updated queda saneado e ignorado.'
  );
  return ok;
}

async function scenarioPii() {
  title('P4 - No se filtran datos sensibles');
  note('Se usa el evento envenenado de las pruebas automaticas.');
  note('Contiene 9 marcadores trampa: correo, nombre, host, adjunto, campos a medida...');

  const collector = makeCollector({ print: false });
  const sender = makeRecordingSender();

  await handleJiraIssueEvent(createdEvent, {}, { log: collector.log, send: sender.send });
  await handleJiraIssueEvent(updatedEvent, {}, { log: collector.log, send: sender.send });

  const raw = collector.text();
  const marcadores = Object.entries(canaries);
  const filtrados = marcadores.filter(([, value]) => raw.includes(value));

  step('Marcadores buscados en la traza');
  marcadores.forEach(([name, value]) => {
    const leaked = raw.includes(value);
    console.log('  ' + (leaked ? 'FILTRADO ' : 'limpio   ') + name.padEnd(14) + value);
  });

  const built = JSON.parse(collector.lines[2]);
  console.log('\n  Titulo en la traza: ' + built.payload.issues[0].fields.summary);
  note('El numero indica la longitud del titulo, no su contenido.');

  const ok = filtrados.length === 0;
  console.log(
    '\n  ' +
      (ok ? 'CORRECTO' : 'FALLO') +
      ': ' +
      filtrados.length +
      ' de ' +
      marcadores.length +
      ' marcadores aparecen en la traza.'
  );
  return ok;
}

async function scenarioInvalid() {
  title('P5 - Se rechaza una incidencia incompleta');
  note('Evento sin titulo. El trigger debe negarse a enviar, no mandar algo a medias.');

  const event = demoCreatedEvent();
  delete event.issue.fields.summary;

  const collector = makeCollector();
  const sender = makeRecordingSender();

  await handleJiraIssueEvent(event, {}, { log: collector.log, send: sender.send });

  step('Resultado');
  const built = JSON.parse(collector.lines[2]);
  const names = collector.names();

  console.log('  Contrato valido      : ' + built.contractValid);
  console.log('  Motivo del rechazo   : ' + built.reason);
  console.log('  Lineas emitidas      : ' + names.join(', '));
  console.log('  Intentos de envio    : ' + sender.calls.length);

  const ok =
    built.contractValid === false &&
    built.reason === 'MISSING_SUMMARY' &&
    sender.calls.length === 0 &&
    !names.includes('jira.integration.response');

  console.log(
    '\n  ' +
      (ok ? 'CORRECTO' : 'FALLO') +
      ': no hay linea de envio porque no se llego a enviar nada.'
  );
  return ok;
}

async function scenarioErrors() {
  title('P6 - Cuando algo falla, falla de forma controlada');
  note('Cinco averias distintas. Ninguna necesita el servicio levantado.');

  const payload = {
    initiatedBy: 'bkt-jira-triggers',
    issues: [{ id: '10412', key: 'BFC-3', fields: { summary: 'Incidencia de demostracion' } }]
  };

  const casos = [
    {
      nombre: 'Falta configuracion',
      detalle: 'No hay variables de entorno definidas',
      esperado: 'CONFIG',
      run: () => sendIssueToIntegrationService(payload, 'corr-config', { env: {} })
    },
    {
      nombre: 'Servicio inalcanzable',
      detalle: 'La conexion es rechazada',
      esperado: 'NETWORK',
      run: () =>
        sendIssueToIntegrationService(payload, 'corr-network', {
          env: VALID_ENV,
          fetchImpl: async () => {
            throw new Error('connect ECONNREFUSED 127.0.0.1:8000');
          }
        })
    },
    {
      nombre: 'El servicio no responde',
      detalle: 'Se agota el tiempo de espera',
      esperado: 'TIMEOUT',
      run: () =>
        sendIssueToIntegrationService(payload, 'corr-timeout', {
          env: VALID_ENV,
          timeoutMs: 60,
          fetchImpl: (_url, init) =>
            new Promise((_resolve, reject) => {
              init.signal.addEventListener('abort', () => {
                const err = new Error('The operation was aborted');
                err.name = 'AbortError';
                reject(err);
              });
            })
        })
    },
    {
      nombre: 'Error del servidor',
      detalle: 'El servicio devuelve 500',
      esperado: 'HTTP',
      run: () =>
        sendIssueToIntegrationService(payload, 'corr-http', {
          env: VALID_ENV,
          fetchImpl: async () =>
            fakeResponse({
              ok: false,
              status: 500,
              requestId: 'corr-http',
              body: { success: false, error: { code: 'INTERNAL', message: 'boom' } }
            })
        })
    },
    {
      nombre: 'Responde 201 pero no guardo',
      detalle: 'Codigo HTTP correcto, resultado interno incorrecto',
      esperado: 'APPLICATION',
      run: () =>
        sendIssueToIntegrationService(payload, 'corr-app', {
          env: VALID_ENV,
          fetchImpl: async () =>
            fakeResponse({
              ok: true,
              status: 201,
              requestId: 'corr-app',
              body: {
                success: true,
                data: {
                  executionId: '9a1f0c33-77bd-4e2f-8c05-5b1de6a0f9c1',
                  summary: {
                    ticketsSucceeded: 0,
                    ticketsFailed: 1,
                    successIntegration: false
                  },
                  tickets: [{ success: false, storedTicketId: 'MESH-DEMO:BFC-3' }]
                }
              }
            })
        })
    }
  ];

  const filas = [];
  let todoOk = true;

  for (const caso of casos) {
    const result = await caso.run();
    const acierta = result.errorKind === caso.esperado && result.success === false;
    if (!acierta) todoOk = false;
    filas.push({
      averia: caso.nombre,
      detalle: caso.detalle,
      clasificado: result.errorKind,
      codigo: result.errorCode,
      status: result.status === null ? '-' : String(result.status),
      acierta
    });
  }

  step('Resultado');
  console.log(
    '  ' +
      'Averia'.padEnd(30) +
      'Clasificado'.padEnd(14) +
      'Codigo'.padEnd(32) +
      'HTTP'
  );
  console.log('  ' + '-'.repeat(74));
  filas.forEach((f) => {
    console.log(
      '  ' +
        f.averia.padEnd(30) +
        f.clasificado.padEnd(14) +
        String(f.codigo).padEnd(32) +
        f.status
    );
  });

  note('En los cinco casos el codigo devuelve un resultado, no lanza una excepcion.');
  note('El trigger sigue vivo y deja constancia de que fallo y por que.');

  console.log(
    '\n  ' + (todoOk ? 'CORRECTO' : 'FALLO') + ': los 5 fallos quedan clasificados.'
  );
  return todoOk;
}

// ------------------------------------------------- receptor HTTP de demo ----
//
// Respuesta fija que devuelve el receptor. Imita la forma de integration-service
// para poder ejercitar el cliente, pero NO es integration-service.
const RESPUESTA_DEMO = {
  success: true,
  data: {
    executionId: '5c2e7a91-4d38-4f60-b7a2-0e9d3f1c8b44',
    summary: { ticketsSucceeded: 1, ticketsFailed: 0, successIntegration: true },
    tickets: [{ success: true, storedTicketId: 'MESH-DEMO:BFC-3' }]
  }
};

/** Incidencia de ejemplo usada por 'wire' y por 'send'. Datos inventados. */
const PAYLOAD_DEMO = {
  initiatedBy: 'bkt-jira-triggers',
  issues: [
    {
      id: '10412',
      key: 'BFC-3',
      fields: { summary: 'El cliente no puede completar una transferencia desde la app movil' }
    }
  ]
};

const PUERTO_FIJO_POR_DEFECTO = 4599;

/**
 * Lee el puerto de los argumentos. Devuelve el valor por defecto si no se indica.
 * Sale con error si el valor no es un puerto usable sin privilegios.
 */
function leerPuerto(arg, porDefecto) {
  if (arg === undefined) return porDefecto;
  const n = Number(arg);
  if (!Number.isInteger(n) || n < 1024 || n > 65535) {
    console.error(
      '\nPuerto invalido: "' + arg + '". Tiene que ser un numero entero entre 1024 y 65535.\n'
    );
    process.exit(1);
  }
  return n;
}

async function scenarioWire() {
  title('P7 - La peticion HTTP sale bien formada');
  note('Se levanta un escuchador HTTP local y temporal, solo para esta prueba.');
  note('NO es integration-service. Es un receptor de 20 lineas que imprime lo que llega.');

  let recibido = null;

  const server = http.createServer((req, res) => {
    const trozos = [];
    req.on('data', (c) => trozos.push(c));
    req.on('end', () => {
      recibido = {
        metodo: req.method,
        ruta: req.url,
        cabeceras: req.headers,
        cuerpo: Buffer.concat(trozos).toString('utf8')
      };
      res.writeHead(201, { 'Content-Type': 'application/json', 'X-Request-Id': req.headers['x-request-id'] || '' });
      res.end(JSON.stringify(RESPUESTA_DEMO));
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  note('Escuchador levantado en http://127.0.0.1:' + port);

  const correlationId = 'demo-' + Date.now();

  const result = await sendIssueToIntegrationService(PAYLOAD_DEMO, correlationId, {
    env: {
      INTEGRATION_SERVICE_BASE_URL: 'http://127.0.0.1:' + port,
      INTEGRATION_SERVICE_API_KEY: 'clave-ficticia-solo-para-demo',
      INTEGRATION_SERVICE_API_KEY_HEADER: 'X-API-KEY'
    },
    fetchImpl: globalThis.fetch
  });

  await new Promise((resolve) => server.close(resolve));

  step('Lo que recibio el escuchador');
  console.log('  Metodo y ruta : ' + recibido.metodo + ' ' + recibido.ruta);
  console.log('  Content-Type  : ' + recibido.cabeceras['content-type']);
  console.log('  X-Request-Id  : ' + recibido.cabeceras['x-request-id']);
  console.log(
    '  X-API-KEY     : ' +
      (recibido.cabeceras['x-api-key'] ? '(presente, no se muestra el valor)' : '(ausente)')
  );
  console.log('  Cuerpo        : ' + recibido.cuerpo);

  step('Lo que devolvio el cliente');
  console.log('  Enviado          : ' + result.sent);
  console.log('  Exito real       : ' + result.success);
  console.log('  Codigo HTTP      : ' + result.status);
  console.log('  Correlacion ida  : ' + correlationId);
  console.log('  Correlacion vuelta: ' + result.requestIdEcho);
  console.log('  executionId      : ' + result.executionId);
  console.log('  storedTicketId   : ' + result.storedTicketId);

  const ok =
    recibido.metodo === 'POST' &&
    recibido.ruta === '/api/v1/issues' &&
    recibido.cabeceras['x-request-id'] === correlationId &&
    result.success === true &&
    result.requestIdEcho === correlationId;

  note('El identificador de correlacion viaja de ida y vuelta: se puede seguir la traza.');
  console.log(
    '\n  ' + (ok ? 'CORRECTO' : 'FALLO') + ': la peticion sale bien formada y correlacionada.'
  );
  return ok;
}

// ------------------------------------------- demo en vivo: listen / send ----

/** Pagina que ve una persona que abre el receptor con el navegador. */
function paginaInformativa(puerto) {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Receptor de demo</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;line-height:1.55;
       max-width:44rem;margin:3rem auto;padding:0 1.25rem;color:#1a1a1a;background:#fff}
  h1{font-size:1.35rem;margin:0 0 .35rem}
  p.sub{color:#666;margin:0 0 1.75rem}
  code,pre{font-family:ui-monospace,Consolas,monospace;font-size:.9rem}
  pre{background:#f4f4f5;border:1px solid #e4e4e7;border-radius:6px;
      padding:.85rem 1rem;overflow-x:auto}
  .aviso{border-left:3px solid #d97706;background:#fffbeb;padding:.75rem 1rem;
         border-radius:0 6px 6px 0;margin:1.5rem 0}
  table{border-collapse:collapse;width:100%;margin:1rem 0}
  td,th{border:1px solid #e4e4e7;padding:.45rem .7rem;text-align:left;font-size:.92rem}
  th{background:#f4f4f5}
</style></head><body>
<h1>Receptor HTTP de demo</h1>
<p class="sub">Escuchando en 127.0.0.1:${puerto}</p>

<div class="aviso">
  <strong>Esto no es integration-service.</strong> Es un receptor de unas veinte lineas
  que existe solo para ver la peticion que produce el trigger. No guarda nada, no valida
  nada y responde siempre lo mismo.
</div>

<p>Acabas de hacer un <code>GET /</code> desde el navegador, y por eso ves esta pagina.
El trigger no hace eso: envia un <code>POST /api/v1/issues</code> con cabeceras y cuerpo JSON.</p>

<p>Para verlo de verdad, deja esta ventana abierta y ejecuta en <strong>otra terminal</strong>:</p>

<pre>npm run demo -- send ${puerto}</pre>

<p>La peticion aparecera volcada en la terminal donde levantaste el receptor.</p>

<h2 style="font-size:1.05rem;margin-top:2rem">Que devuelve este receptor</h2>
<table>
  <tr><th>Codigo</th><td>201</td></tr>
  <tr><th>Cuerpo</th><td><code>success: true</code>, <code>successIntegration: true</code>,
      <code>storedTicketId: MESH-DEMO:BFC-3</code></td></tr>
  <tr><th>Cabecera</th><td><code>X-Request-Id</code>, devuelta tal cual llego</td></tr>
</table>
</body></html>`;
}

async function scenarioListen(puerto) {
  title('Receptor HTTP levantado (demo en vivo)');
  note('NO es integration-service. Es un receptor de 20 lineas que imprime lo que llega.');
  note('Se queda esperando hasta que pulses Ctrl+C.');

  let recibidas = 0;

  const server = http.createServer((req, res) => {
    const trozos = [];
    req.on('data', (c) => trozos.push(c));
    req.on('end', () => {
      // Un navegador hace GET: se le devuelve una pagina que explica que es esto.
      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(paginaInformativa(puerto));
        console.log('\n  [visita desde el navegador]  GET ' + req.url);
        return;
      }

      if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Solo GET (informacion) y POST (peticion del trigger).\n');
        return;
      }

      recibidas += 1;
      const cuerpo = Buffer.concat(trozos).toString('utf8');

      step('Peticion recibida #' + recibidas);
      console.log('  Metodo y ruta : ' + req.method + ' ' + req.url);
      console.log('  Content-Type  : ' + (req.headers['content-type'] || '(ausente)'));
      console.log('  X-Request-Id  : ' + (req.headers['x-request-id'] || '(ausente)'));
      console.log(
        '  X-API-KEY     : ' +
          (req.headers['x-api-key'] ? '(presente, no se muestra el valor)' : '(ausente)')
      );
      console.log('  Cuerpo        : ' + cuerpo);
      console.log('\n  Respondido 201. Esperando la siguiente. Ctrl+C para parar.');

      res.writeHead(201, {
        'Content-Type': 'application/json',
        'X-Request-Id': req.headers['x-request-id'] || ''
      });
      res.end(JSON.stringify(RESPUESTA_DEMO));
    });
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(
        '\n  El puerto ' +
          puerto +
          ' ya esta ocupado.\n\n  Prueba con otro:\n\n      npm run demo -- listen ' +
          (puerto + 1) +
          '\n'
      );
    } else {
      console.error('\n  No se pudo levantar el receptor:\n');
      console.error(error);
    }
    process.exit(1);
  });

  await new Promise((resolve) => server.listen(puerto, '127.0.0.1', resolve));

  step('Listo');
  console.log('  Abrir en el navegador : http://127.0.0.1:' + puerto);
  console.log('  Enviar una peticion   : npm run demo -- send ' + puerto);
  console.log('    (desde OTRA terminal, dejando esta abierta)');
  console.log('\n  Parar el receptor     : Ctrl+C');

  process.on('SIGINT', () => {
    console.log('\n\n  Receptor detenido. Peticiones POST recibidas: ' + recibidas + '\n');
    process.exit(0);
  });

  // Nunca se resuelve: el proceso vive hasta Ctrl+C.
  await new Promise(() => {});
}

async function scenarioSend(puerto) {
  title('Enviar una peticion real al receptor (demo en vivo)');
  note('Usa el mismo cliente que usaria el trigger en produccion.');

  const correlationId = 'demo-' + Date.now();

  const result = await sendIssueToIntegrationService(PAYLOAD_DEMO, correlationId, {
    env: {
      INTEGRATION_SERVICE_BASE_URL: 'http://127.0.0.1:' + puerto,
      INTEGRATION_SERVICE_API_KEY: 'clave-ficticia-solo-para-demo',
      INTEGRATION_SERVICE_API_KEY_HEADER: 'X-API-KEY'
    },
    fetchImpl: globalThis.fetch
  });

  step('Lo que devolvio el cliente');
  console.log('  Enviado          : ' + result.sent);
  console.log('  Exito real       : ' + result.success);
  console.log('  Codigo HTTP      : ' + (result.status === undefined ? '-' : result.status));
  console.log('  Correlacion ida  : ' + correlationId);
  console.log('  Correlacion vuelta: ' + (result.requestIdEcho || '-'));

  if (!result.success) {
    console.log('  Clasificacion    : ' + (result.errorKind || '-'));
    console.log('  Codigo           : ' + (result.errorCode || '-'));
    console.log(
      '\n  FALLO: no hubo respuesta correcta.\n' +
        '  Comprueba que el receptor sigue levantado en otra terminal:\n\n' +
        '      npm run demo -- listen ' +
        puerto +
        '\n'
    );
    return false;
  }

  console.log('  executionId      : ' + result.executionId);
  console.log('  storedTicketId   : ' + result.storedTicketId);
  note('Mira la otra terminal: ahi esta volcada la peticion tal y como llego.');
  console.log('\n  CORRECTO: la peticion salio y volvio correlacionada.');
  return true;
}

// ===================================================================== main ==

const ESCENARIOS = {
  created: scenarioCreated,
  updated: scenarioUpdated,
  pii: scenarioPii,
  invalid: scenarioInvalid,
  errors: scenarioErrors,
  wire: scenarioWire
};

async function main() {
  const arg = (process.argv[2] || '').toLowerCase();

  // 'listen' y 'send' se despachan aparte, a proposito: no estan en ESCENARIOS
  // para que 'all' no los ejecute. 'listen' no termina nunca por si solo.
  if (arg === 'listen') {
    await scenarioListen(leerPuerto(process.argv[3], PUERTO_FIJO_POR_DEFECTO));
    return;
  }

  if (arg === 'send') {
    const ok = await scenarioSend(leerPuerto(process.argv[3], PUERTO_FIJO_POR_DEFECTO));
    console.log('');
    process.exit(ok ? 0 : 1);
  }

  if (!arg || (arg !== 'all' && !ESCENARIOS[arg])) {
    console.log('\nUso: node scripts/demo-local.js <escenario>\n');
    console.log('Escenarios disponibles:');
    console.log('  created   Se crea una incidencia en Jira');
    console.log('  updated   Se actualiza la incidencia');
    console.log('  pii       No se filtran datos sensibles');
    console.log('  invalid   Se rechaza una incidencia incompleta');
    console.log('  errors    Cinco averias, todas controladas');
    console.log('  wire      La peticion HTTP sale bien formada');
    console.log('  all       Todos, en orden');
    console.log('\nDemo en vivo (no forman parte de "all"):');
    console.log('  listen [puerto]   Deja el receptor levantado hasta Ctrl+C');
    console.log('                    Por defecto ' + PUERTO_FIJO_POR_DEFECTO + '. Se puede abrir en el navegador.');
    console.log('  send   [puerto]   Envia una peticion real contra ese receptor\n');
    process.exit(arg ? 1 : 0);
  }

  const aEjecutar = arg === 'all' ? Object.keys(ESCENARIOS) : [arg];
  const resultados = [];

  for (const nombre of aEjecutar) {
    const ok = await ESCENARIOS[nombre]();
    resultados.push({ nombre, ok });
  }

  if (aEjecutar.length > 1) {
    title('Resumen');
    resultados.forEach((r) => console.log('  ' + (r.ok ? 'CORRECTO' : 'FALLO   ') + '  ' + r.nombre));
  }

  const fallos = resultados.filter((r) => !r.ok);
  console.log('');
  process.exit(fallos.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nLa demo se detuvo por un error inesperado:\n');
  console.error(error);
  process.exit(1);
});
