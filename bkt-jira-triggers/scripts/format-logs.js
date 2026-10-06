#!/usr/bin/env node
/**
 * Convierte la salida cruda de `forge logs` en algo legible por una persona.
 *
 * La traza del trigger es JSON de una linea por evento: correcta para una
 * maquina, ilegible para alguien que quiera entender que paso.
 *
 * Uso, de mas simple a mas explicito:
 *
 *   npm run logs                          llama a forge logs y lo formatea
 *   npm run logs -- --compact             una linea por invocacion
 *   npm run logs -- --since 120m          otra ventana de tiempo
 *   npm run logs -- traza.log             formatea un fichero guardado
 *
 *   forge logs -e development --since 60m | node scripts/format-logs.js
 *
 * Opciones:
 *   --json     imprime el resumen como JSON, para encadenar con otra cosa
 *   --compact  una linea por invocacion
 *   --since    ventana de tiempo (por defecto 60m). Solo si invoca a forge
 *   --env      entorno de Forge (por defecto development)
 */

'use strict';

const fs = require('node:fs');
const { execSync } = require('node:child_process');

// ------------------------------------------------------------------ salida --

const W = 76;
const LINE = '='.repeat(W);
const THIN = '-'.repeat(W);

function pad(label, width = 14) {
  return label + ' '.repeat(Math.max(0, width - label.length));
}

/** Parte un texto largo en lineas, respetando un margen izquierdo. */
function wrap(text, indent, width = W) {
  const words = String(text).split(/[,\s]+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const w of words) {
    const candidate = current ? current + ', ' + w : w;
    if (candidate.length + indent.length > width) {
      lines.push(current);
      current = w;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  // La coma se queda al final de la linea partida, para que no se pierda.
  return lines.map((l, i) => (i < lines.length - 1 ? l + ',' : l));
}

// ------------------------------------------------------------------ lectura --

/** Extrae los objetos JSON de la salida cruda, ignorando avisos del CLI. */
function parseLines(raw) {
  const out = [];
  for (const line of raw.split(/\r?\n/)) {
    const start = line.indexOf('{');
    if (start === -1) continue;
    try {
      out.push(JSON.parse(line.slice(start)));
    } catch {
      // Linea que no es traza nuestra: se ignora en silencio.
    }
  }
  return out;
}

/** Agrupa las cuatro lineas de cada invocacion por su correlationId. */
function groupByInvocation(entries) {
  const map = new Map();
  for (const e of entries) {
    const id = e.correlationId;
    if (!id) continue;
    if (!map.has(id)) map.set(id, { correlationId: id, lines: {} });
    map.get(id).lines[e.eventName] = e;
  }
  return [...map.values()].sort((a, b) => {
    const ta = Object.values(a.lines)[0]?.receivedAt || '';
    const tb = Object.values(b.lines)[0]?.receivedAt || '';
    return ta.localeCompare(tb);
  });
}

/**
 * Obtiene la traza. Si no hay fichero ni entrada por tuberia, llama a
 * `forge logs` directamente: un solo comando en vez de dos encadenados,
 * que es donde se olvidaba el formateo.
 */
function obtenerTraza({ file, since, env }) {
  if (file) {
    if (!fs.existsSync(file)) {
      console.error(`
  No existe el fichero "${file}".
`);
      process.exit(1);
    }
    return fs.readFileSync(file, 'utf8');
  }

  // Solo se lee de la entrada estandar si de verdad viene por tuberia o
  // redireccion. Comprobar `isTTY` no basta: en muchos entornos la entrada
  // no es un terminal pero tampoco tiene datos, y el proceso se quedaria
  // esperando indefinidamente.
  let hayTuberia = false;
  try {
    const st = fs.fstatSync(0);
    // En Windows una tuberia no aparece como FIFO: lo que la distingue de un
    // terminal es que deja de ser dispositivo de caracteres.
    hayTuberia = st.isFIFO() || st.isFile() || (!st.isCharacterDevice() && !process.stdin.isTTY);
  } catch {
    hayTuberia = false;
  }
  if (hayTuberia) return fs.readFileSync(0, 'utf8');

  // Windows necesita shell para resolver `forge.cmd`, y con shell los
  // argumentos se concatenan sin escapar. Se validan antes de construir el
  // comando para que no puedan colar nada.
  if (!/^[0-9]+[smhd]$/.test(since)) {
    console.error(`
  Ventana de tiempo invalida: "${since}". Usa por ejemplo 60m, 2h o 1d.
`);
    process.exit(1);
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(env)) {
    console.error(`
  Entorno invalido: "${env}".
`);
    process.exit(1);
  }

  try {
    return execSync(`forge logs -e ${env} --since ${since}`, {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore']
    });
  } catch (error) {
    // forge devuelve codigo != 0 en algunos avisos aunque haya escrito la traza
    if (error.stdout) return error.stdout;
    console.error('');
    console.error('  No se pudo ejecutar `forge logs`.');
    console.error('  Comprueba la sesion con `forge whoami`, o pasa un fichero:');
    console.error('      npm run logs -- traza.log');
    console.error('');
    process.exit(1);
  }
}

// ---------------------------------------------------------------- traduccion --

const TIPO_EVENTO = {
  'avi:jira:created:issue': 'se creo el ticket',
  'avi:jira:updated:issue': 'se modifico el ticket'
};

function tipoTicketLegible(tipo) {
  if (tipo === 'Error') return 'Incidencia';
  return tipo || '';
}

const MOTIVO = {
  MISSING_RUNTIME_CONFIG:
    'No hay destino configurado. Es el estado correcto de esta fase:\nel trigger se detiene antes de intentar ningun envio.',
  FETCH_FAILED: 'No se pudo alcanzar el destino: el dominio no responde.',
  REQUEST_TIMEOUT: 'El destino no contesto a tiempo.',
  INTEGRATION_REPORTED_FAILURE:
    'El destino respondio correctamente pero informo de que no guardo el ticket.'
};

function motivoDe(d) {
  if (MOTIVO[d.errorCode]) return MOTIVO[d.errorCode];
  if (d.errorKind === 'HTTP') {
    return `El destino respondio, pero con error HTTP ${d.status}.\nLlego la peticion; el problema esta al otro lado.`;
  }
  return d.errorCode || 'sin detalle';
}

function fechaLegible(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ------------------------------------------------------------------ informe --

function invocacionCompacta(inv) {
  const r = inv.lines['jira.event.received'] || {};
  const resp = inv.lines['jira.integration.response'] || {};
  const estado = resp.success ? 'ENVIADO ' : resp.sent ? 'FALLO   ' : 'NO ENV. ';
  return `  ${fechaLegible(r.receivedAt)}  ${pad(r.issueKey || '?', 9)}${pad(r.statusName || '', 14)}${estado}  ${resp.errorCode || 'OK'}`;
}

function invocacion(inv, n, total) {
  const recibido = inv.lines['jira.event.received'] || {};
  const forma = inv.lines['jira.event.shape'] || {};
  const contrato = inv.lines['jira.contract.payload.built'] || {};
  const resp = inv.lines['jira.integration.response'] || {};
  const s = recibido.sanitized || {};
  const tipo = tipoTicketLegible(recibido.issueTypeName);

  const out = [];
  out.push('');
  out.push(LINE);
  out.push(`  ${recibido.issueKey || '?'}  -  ${tipo}  -  "${recibido.statusName || ''}"`);
  out.push(`  ${fechaLegible(recibido.receivedAt)}  -  ${TIPO_EVENTO[recibido.eventType] || recibido.eventType || ''}`);
  out.push(`  Invocacion ${n} de ${total}`);
  out.push(LINE);

  // 1
  out.push('');
  out.push('  1 - LLEGA EL EVENTO            Jira aviso a la app por su cuenta');
  out.push(`      ${pad('Proyecto')}${recibido.projectKey || ''}`);
  if (recibido.changedFieldNames?.length) {
    out.push(`      ${pad('Cambio')}${recibido.changedFieldNames.join(', ')}  (solo el nombre del campo,`);
    out.push(`      ${pad('')}nunca su valor anterior)`);
  }
  if (s.actorSha256Prefix) {
    out.push(`      ${pad('Quien')}identificado por huella ${s.actorSha256Prefix}, nunca por nombre`);
  }

  // 2
  const campos = forma.shape?.issueFieldKeys || [];
  out.push('');
  out.push('  2 - QUE TRAJO EL EVENTO        los campos que Jira entrega de verdad');
  if (campos.length) {
    const lineas = wrap(campos.join(', '), '      ' + pad(''), W - 6);
    out.push(`      ${pad('Campos')}${lineas[0]}`);
    for (const l of lineas.slice(1)) out.push(`      ${pad('')}${l}`);
  }
  out.push(`      ${pad('Descripcion')}${s.descriptionPresent ? 'presente' : 'no viaja en el evento del trigger'}`);

  // 3
  out.push('');
  out.push(`  3 - MENSAJE CONSTRUIDO         ${contrato.contractValid ? 'valido' : 'RECHAZADO: ' + (contrato.reason || '')}`);
  const resumen = contrato.payload?.issues?.[0]?.fields?.summary;
  if (resumen) {
    const m = /\[redacted:(\d+)\]/.exec(resumen);
    out.push(`      ${pad('Titulo')}${m ? `oculto (${m[1]} caracteres)` : resumen}`);
  }

  // 4
  out.push('');
  if (resp.success) {
    out.push('  4 - RESULTADO DEL ENVIO        aceptado por el destino');
    out.push(`      ${pad('Codigo HTTP')}${resp.status}`);
    if (resp.storedTicketId) out.push(`      ${pad('Guardado como')}${resp.storedTicketId}`);
    if (resp.requestIdEcho === inv.correlationId) {
      out.push(`      ${pad('Correlacion')}ida y vuelta identicas`);
    }
  } else {
    out.push(`  4 - RESULTADO DEL ENVIO        ${resp.sent ? 'salio, pero fallo' : 'no se intento'}`);
    motivoDe(resp)
      .split('\n')
      .forEach((l, i) => out.push(`      ${pad(i === 0 ? 'Motivo' : '')}${l}`));
  }

  out.push('');
  out.push(`  Correlacion: ${inv.correlationId}`);
  return out.join('\n');
}

function resumen(invs) {
  const enviados = invs.filter((i) => i.lines['jira.integration.response']?.success).length;
  const fallidos = invs.filter(
    (i) => i.lines['jira.integration.response']?.sent && !i.lines['jira.integration.response']?.success
  ).length;
  const noEnviados = invs.length - enviados - fallidos;

  const tickets = [...new Set(invs.map((i) => i.lines['jira.event.received']?.issueKey).filter(Boolean))];
  const proyectos = [...new Set(invs.map((i) => i.lines['jira.event.received']?.projectKey).filter(Boolean))];
  const titulosEnClaro = invs.filter((i) => {
    const su = i.lines['jira.contract.payload.built']?.payload?.issues?.[0]?.fields?.summary;
    return su && !/^\[redacted:\d+\]$/.test(su);
  }).length;

  const out = [];
  out.push('');
  out.push(LINE);
  out.push('  RESUMEN');
  out.push(LINE);
  out.push(`  ${pad('Invocaciones', 24)}${invs.length}`);
  out.push(`  ${pad('Tickets', 24)}${tickets.join(', ') || '-'}`);
  out.push(`  ${pad('Proyectos', 24)}${proyectos.join(', ') || '-'}`);
  out.push('');
  out.push(`  ${pad('Enviados y aceptados', 24)}${enviados}`);
  out.push(`  ${pad('Enviados con fallo', 24)}${fallidos}`);
  out.push(`  ${pad('No enviados', 24)}${noEnviados}`);
  out.push('');
  out.push(`  ${pad('Titulos en claro', 24)}${titulosEnClaro}   ${titulosEnClaro === 0 ? '(correcto: ninguno)' : '*** REVISAR ***'}`);
  out.push(THIN);
  return out.join('\n');
}

// --------------------------------------------------------------------- main --

function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const compact = args.includes('--compact');

  // Se aceptan los mismos alias cortos que usa `forge logs`, para que quien
  // ya conozca ese comando no tenga que aprender otros.
  const indices = new Set();
  const valorDe = (nombres, porDefecto) => {
    for (const nombre of nombres) {
      const i = args.indexOf(nombre);
      if (i !== -1 && args[i + 1] !== undefined) {
        indices.add(i);
        indices.add(i + 1);
        return args[i + 1];
      }
    }
    return porDefecto;
  };
  const since = valorDe(['--since', '-s'], '60m');
  const env = valorDe(['--env', '-e'], 'development');

  // Lo que quede sin consumir y no sea una opcion es el fichero.
  const file = args.find((a, i) => !indices.has(i) && !a.startsWith('-'));

  const raw = obtenerTraza({ file, since, env });
  const invs = groupByInvocation(parseLines(raw));

  if (invs.length === 0) {
    console.log('\n  No hay trazas del trigger en esa salida.');
    console.log('  Si acabas de tocar un ticket, amplia la ventana: --since 120m');
    console.log('  Los registros de Forge tardan en servirse.\n');
    process.exit(0);
  }

  if (json) {
    console.log(JSON.stringify(invs, null, 2));
    return;
  }

  if (compact) {
    console.log('');
    console.log(`  ${pad('Fecha', 21)}${pad('Ticket', 9)}${pad('Estado', 14)}Envio     Detalle`);
    console.log('  ' + THIN);
    invs.forEach((i) => console.log(invocacionCompacta(i)));
    console.log(resumen(invs));
    return;
  }

  invs.forEach((inv, i) => console.log(invocacion(inv, i + 1, invs.length)));
  console.log(resumen(invs));
}

main();
