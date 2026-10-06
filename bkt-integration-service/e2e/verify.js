#!/usr/bin/env node
'use strict'

/**
 * Comprueba en Mongo lo que el servicio guardo para un ticket real y lo compara con expected.json.
 * SOLO LECTURA. No imprime secretos: se autentica con las variables del propio contenedor de Mongo.
 *
 * Uso:  node verify.js BFC-29 [--timeout 600]
 * Variables opcionales: E2E_MONGO_CONTAINER (por defecto bkt-integration-service-mongo-1),
 *                       E2E_SERVICE_DIR (por defecto ..; se lee MONGODB_DATABASE del .env del servicio)
 */

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const key = process.argv[2]
const timeoutIndex = process.argv.indexOf('--timeout')
const timeoutSeconds = timeoutIndex > 0 ? Number(process.argv[timeoutIndex + 1]) : 600
if (!key || !/^[A-Z][A-Z0-9]+-\d+$/.test(key)) {
  console.error('Uso: node verify.js <KEY-123> [--timeout 600]')
  process.exit(2)
}

const CONTAINER = process.env.E2E_MONGO_CONTAINER || 'bkt-integration-service-mongo-1'
const SERVICE_DIR = path.resolve(__dirname, process.env.E2E_SERVICE_DIR || '..')
const expected = JSON.parse(fs.readFileSync(path.join(__dirname, 'expected.json'), 'utf8')).files

function envValue(name) {
  const line = fs.readFileSync(path.join(SERVICE_DIR, '.env'), 'utf8').split(/\r?\n/).find(l => l.startsWith(`${name}=`))
  return line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, '') : undefined
}

const database = envValue('MONGODB_DATABASE')
const collection = envValue('PROCESSED_TICKET_COLLECTION_NAME') || 'tickets'
if (!database || !/^[\w-]+$/.test(database) || !/^[\w-]+$/.test(collection)) {
  console.error('No se pudo leer MONGODB_DATABASE / PROCESSED_TICKET_COLLECTION_NAME del .env del servicio')
  process.exit(2)
}

function readAttachedDocuments() {
  const query = `JSON.stringify((db.getSiblingDB('${database}').getCollection('${collection}').find({key:'${key}'}).toArray().sort((a,b)=>(((b.content||{}).attachedDocuments||[]).length)-(((a.content||{}).attachedDocuments||[]).length))[0]||{content:{}}).content.attachedDocuments||null)`
  const script = `mongosh --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --eval "${query.replace(/"/g, '\\"')}"`
  const output = execFileSync('docker', ['exec', CONTAINER, 'sh', '-c', script], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000
  })
  return JSON.parse(output.trim().split('\n').pop())
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function main() {
  const wanted = Object.keys(expected).length
  const started = Date.now()
  let documents = null
  while (Date.now() - started < timeoutSeconds * 1000) {
    documents = readAttachedDocuments()
    if (Array.isArray(documents) && documents.length >= wanted) break
    await sleep(3000)
  }

  console.log(`\nVerificacion en Mongo del ticket ${key} (${Math.round((Date.now() - started) / 1000)} s)\n`)
  if (!Array.isArray(documents)) {
    console.log(`  FAIL  el ticket ${key} no tiene attachedDocuments en la coleccion consultada`)
    console.log('        -> revisar forge logs, traza del servicio y que el contenedor/BD coincidan con el servicio arrancado\n')
    process.exit(1)
  }

  const byName = new Map(documents.map(document => [document.filename, document]))
  const expectedNames = new Set(
    Object.entries(expected).flatMap(([filename, rule]) => [filename, ...((rule.aliases && Array.isArray(rule.aliases)) ? rule.aliases : [])])
  )
  let failed = 0
  for (const [filename, rule] of Object.entries(expected)) {
    const aliases = (rule.aliases && Array.isArray(rule.aliases)) ? rule.aliases : []
    const matchedName = [filename, ...aliases].find(name => byName.has(name))
    const stored = matchedName ? byName.get(matchedName) : undefined
    let problem
    if (!stored) problem = 'no aparece en attachedDocuments'
    else if (rule.ok) {
      if (stored.skippedReason) problem = `se omitio (${stored.skippedReason})`
      else {
        const missing = rule.includes.filter(fragment => !stored.markdown.includes(fragment))
        if (missing.length) problem = `faltan fragmentos: ${missing.join(' | ')}`
      }
    } else if (stored.skippedReason !== rule.skippedReason) {
      problem = `esperado ${rule.skippedReason}, llego ${stored.skippedReason || 'convertido'}`
    }
    if (problem) failed++
    const visibleName = matchedName && matchedName !== filename ? `${filename} (${matchedName})` : filename
    console.log(`  ${problem ? 'FAIL' : 'PASS'}  ${visibleName} - ${problem || (rule.ok ? `convertido (${stored.markdown.length} caracteres)` : rule.skippedReason)}`)
  }
  const extra = documents.filter(document => !expectedNames.has(document.filename)).map(document => document.filename)
  if (extra.length) console.log(`\n  Aviso: adjuntos no esperados: ${extra.join(', ')}`)

  console.log(failed === 0 ? `\nTodo coincide con expected.json (${wanted} adjuntos).\n` : `\n${failed} adjunto(s) no coinciden.\n`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(error => {
  console.error('Error inesperado:', (error && error.message ? error.message : String(error)).split('\n')[0])
  process.exit(2)
})
