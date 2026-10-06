#!/usr/bin/env node
'use strict'

/**
 * Comprobaciones previas a una prueba real del flujo Jira -> trigger -> servicio.
 * SOLO LECTURA: no despliega, no cambia variables de Forge, no escribe en Jira y no imprime secretos.
 *
 * Uso (desde esta carpeta):   node preflight.js
 * Variables opcionales:
 *   E2E_SERVICE_URL        URL del servicio            (por defecto http://127.0.0.1:8000)
 *   E2E_SERVICE_CONTAINER  contenedor del servicio     (por defecto bkt-integration-service)
 *   E2E_TRIGGERS_DIR       carpeta de bkt-jira-triggers (por defecto ../../bkt-jira-triggers)
 *   E2E_FORGE_ENV          entorno de Forge            (por defecto development)
 */

const path = require('node:path')
const { execFileSync, execSync } = require('node:child_process')
const lib = require('./lib')

const SERVICE_URL = (process.env.E2E_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
const CONTAINER = process.env.E2E_SERVICE_CONTAINER || 'bkt-integration-service'
const TRIGGERS_DIR = path.resolve(__dirname, process.env.E2E_TRIGGERS_DIR || '../../bkt-jira-triggers')
const FORGE_ENV = process.env.E2E_FORGE_ENV || 'development'
const NGROK_API = 'http://127.0.0.1:4040/api/tunnels'

// Se ejecuta DENTRO del contenedor con sus propias variables: el token nunca sale de alli.
const JIRA_CHECK_SCRIPT = [
  'const b=process.env.JIRA_BASE_URL,u=process.env.JIRA_USER,p=process.env.JIRA_PASSWORD;',
  "if(!b||!u||!p){console.log('MISSING');process.exit(0)}",
  "fetch(b.replace(/\\/$/,'')+'/rest/api/3/myself',{headers:{authorization:'Basic '+Buffer.from(u+':'+p).toString('base64')},signal:AbortSignal.timeout(10000)})",
  ".then(r=>console.log(r.status)).catch(()=>console.log('ERR'))"
].join('')

function forge(args) {
  // Cadena fija validada (sin interpolar texto libre): la CLI de Forge es un .cmd y necesita shell en Windows.
  if (!args.every(arg => /^[A-Za-z0-9-]+$/.test(arg))) throw new Error('argumento de forge no valido')
  return execSync(`forge ${args.join(' ')}`, {
    cwd: TRIGGERS_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 90_000
  })
}

async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
  let body
  try {
    body = await response.json()
  } catch {
    body = undefined
  }
  return { status: response.status, body }
}

async function guarded(name, hint, fn) {
  try {
    return await fn()
  } catch (error) {
    let reason = (error && (error.cause && error.cause.code ? error.cause.code : error.message)) || 'error'
    if (/^Command failed/.test(String(reason))) {
      const stderr = String((error && error.stderr) || '').trim().split('\n')[0]
      reason = `el comando fallo${stderr ? ': ' + stderr : ''}`
    }
    return { name, ok: false, detail: String(reason).split('\n')[0].slice(0, 120), hint }
  }
}

async function main() {
  const results = []
  let variables = []
  let forgeBaseUrl

  results.push(
    await guarded('Servicio y Mongo', 'levantar el contenedor del servicio y su Mongo', async () => {
      const { status, body } = await getJson(`${SERVICE_URL}/health`)
      return lib.checkServiceHealth(status, body)
    })
  )

  results.push(
    await guarded('Variables de Forge', 'iniciar sesion con la CLI de Forge (forge login) y revisar la carpeta de bkt-jira-triggers', async () => {
      variables = lib.parseForgeVariables(forge(['variables', 'list', '--environment', FORGE_ENV]))
      const found = variables.find(v => v.key === lib.TRIGGER_VARS.baseUrl)
      forgeBaseUrl = found && found.value
      return lib.checkForgeBaseUrl(forgeBaseUrl)
    })
  )
  results.push(lib.checkForgeHeaderAndKey(variables))

  results.push(
    await guarded('Tunel ngrok', 'arrancar ngrok: ngrok http 8000 --url=<dominio-fijo>', async () => {
      const { body } = await getJson(NGROK_API)
      const port = Number(new URL(SERVICE_URL).port) || undefined
      return lib.checkNgrok(lib.parseNgrokTunnels(body), forgeBaseUrl, port)
    })
  )

  results.push(
    await guarded('Trigger instalado', 'revisar la sesion de Forge', async () =>
      lib.checkInstall(lib.parseForgeInstalls(forge(['install', 'list'])), FORGE_ENV)
    )
  )

  results.push(
    await guarded('Token de Jira', `comprobar que el contenedor ${CONTAINER} esta en marcha`, async () => {
      const output = execFileSync('docker', ['exec', CONTAINER, 'node', '-e', JIRA_CHECK_SCRIPT], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30_000
      }).trim()
      if (output === 'MISSING') {
        return { name: 'Token de Jira', ok: false, detail: 'faltan JIRA_BASE_URL/JIRA_USER/JIRA_PASSWORD en el contenedor', hint: 'completar el .env del servicio y recrear el contenedor' }
      }
      return lib.checkJiraToken(Number(output) || output)
    })
  )

  console.log('\nPreflight del flujo Jira -> trigger -> servicio (solo lectura)\n')
  for (const r of results) {
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ' - ' + r.detail : ''}`)
    if (!r.ok && r.hint) console.log(`        -> ${r.hint}`)
  }

  const failed = results.filter(r => !r.ok).length
  if (failed === 0) {
    console.log('\nTodo en orden: se puede crear el ticket de prueba.')
    console.log('SIGUIENTE PASO (manual): en Jira (proyecto BFC) pulsar Crear y adjuntar los 10 ficheros de')
    console.log('contexto_para_proyectos/pruebas_manuales/documentos_prueba/ EN EL MISMO FORMULARIO, antes de pulsar Crear.')
    console.log('Despues: node verify.js BFC-NN --timeout 600  (cambiando BFC-NN por la clave del ticket). Guia: e2e/LEEME.md, paso B2.')
  } else {
    console.log(`\n${failed} comprobacion(es) fallida(s): corregir antes de crear el ticket.`)
  }
  console.log(
    'Nota: Forge solo aplica las variables al desplegar y la CLI no indica que URL usa el despliegue activo.\n' +
      'Si todo esta bien y aun asi el trigger devuelve 403, revisar con "forge logs" y valorar un forge deploy (requiere autorizacion).\n'
  )
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(error => {
  console.error('Error inesperado del preflight:', error && error.message)
  process.exit(2)
})
