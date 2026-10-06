'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const lib = require('./lib')

// Salidas de ejemplo con el formato real de la CLI de Forge 13.5 (valores ficticios).
const VARIABLES_OK = `
Showing variables from the development environment:

┌────────────┬────────────────────────────────────┬────────────────────────────────────────────────┐
│ Encrypted? │ Key                                │ Value                                          │
├────────────┼────────────────────────────────────┼────────────────────────────────────────────────┤
│ ✔          │ INTEGRATION_SERVICE_API_KEY        │ ****************                               │
├────────────┼────────────────────────────────────┼────────────────────────────────────────────────┤
│            │ INTEGRATION_SERVICE_API_KEY_HEADER │ X-API-KEY                                      │
├────────────┼────────────────────────────────────┼────────────────────────────────────────────────┤
│            │ INTEGRATION_SERVICE_BASE_URL       │ https://ejemplo-fijo.ngrok-free.dev            │
└────────────┴────────────────────────────────────┴────────────────────────────────────────────────┘
`

const INSTALLS = `
┌──────────────────────────────────────┬─────────────┬──────────────────────────────┬────────────────┬─────────────┬────────────┐
│ Installation ID                      │ Environment │ Site                         │ Atlassian apps │ App version │ Status     │
├──────────────────────────────────────┼─────────────┼──────────────────────────────┼────────────────┼─────────────┼────────────┤
│ 00000000-0000-0000-0000-000000000000 │ development │ ejemplo.atlassian.net        │ Jira           │ 26          │ Up-to-date │
└──────────────────────────────────────┴─────────────┴──────────────────────────────┴────────────────┴─────────────┴────────────┘
`

test('parsea la tabla de variables de Forge', () => {
  const variables = lib.parseForgeVariables(VARIABLES_OK)
  assert.equal(variables.length, 3)
  assert.deepEqual(variables.find(v => v.key === lib.TRIGGER_VARS.baseUrl), {
    encrypted: false,
    key: 'INTEGRATION_SERVICE_BASE_URL',
    value: 'https://ejemplo-fijo.ngrok-free.dev'
  })
  assert.equal(variables.find(v => v.key === lib.TRIGGER_VARS.apiKey).encrypted, true)
})

test('parsea la tabla de instalaciones', () => {
  assert.deepEqual(lib.parseForgeInstalls(INSTALLS), [
    { environment: 'development', site: 'ejemplo.atlassian.net', version: '26', status: 'Up-to-date' }
  ])
  assert.equal(lib.checkInstall(lib.parseForgeInstalls(INSTALLS), 'development').ok, true)
  assert.equal(lib.checkInstall(lib.parseForgeInstalls(INSTALLS), 'production').ok, false)
})

test('detecta la URL con https:// repetido (el 403 de BFC-23/24/25)', () => {
  const doubled = lib.checkForgeBaseUrl('https://https://ejemplo-fijo.ngrok-free.dev')
  assert.equal(doubled.ok, false)
  assert.match(doubled.detail, /repetido/)
})

test('detecta URL ausente, sin https, con barra final o con espacios', () => {
  assert.equal(lib.checkForgeBaseUrl('').ok, false)
  assert.equal(lib.checkForgeBaseUrl('http://ejemplo.ngrok-free.dev').ok, false)
  assert.equal(lib.checkForgeBaseUrl('https://ejemplo.ngrok-free.dev/').ok, false)
  assert.equal(lib.checkForgeBaseUrl('https://ejemplo.ngrok-free.dev ').ok, false)
  assert.equal(lib.checkForgeBaseUrl('https://ejemplo.ngrok-free.dev').ok, true)
})

test('detecta la variable de la clave o de la cabecera ausente', () => {
  const sinClave = lib.parseForgeVariables(VARIABLES_OK).filter(v => v.key !== lib.TRIGGER_VARS.apiKey)
  const check = lib.checkForgeHeaderAndKey(sinClave)
  assert.equal(check.ok, false)
  assert.match(check.detail, /INTEGRATION_SERVICE_API_KEY/)
  assert.equal(lib.checkForgeHeaderAndKey(lib.parseForgeVariables(VARIABLES_OK)).ok, true)
})

test('compara el dominio de ngrok con el de Forge y el puerto con el del servicio', () => {
  const tunnels = lib.parseNgrokTunnels({
    tunnels: [{ public_url: 'https://ejemplo-fijo.ngrok-free.dev', config: { addr: 'http://localhost:8000' } }]
  })
  assert.equal(lib.checkNgrok(tunnels, 'https://ejemplo-fijo.ngrok-free.dev', 8000).ok, true)
  assert.equal(lib.checkNgrok(tunnels, 'https://otro.ngrok-free.dev', 8000).ok, false, 'dominio distinto')
  assert.equal(lib.checkNgrok(tunnels, 'https://ejemplo-fijo.ngrok-free.dev', 9000).ok, false, 'puerto distinto')
  assert.equal(lib.checkNgrok([], 'https://ejemplo-fijo.ngrok-free.dev', 8000).ok, false, 'ngrok sin tuneles')
})

test('valida la salud del servicio y el token de Jira', () => {
  assert.equal(lib.checkServiceHealth(200, { database: 'connected' }).ok, true)
  assert.equal(lib.checkServiceHealth(503, { database: 'disconnected' }).ok, false)
  assert.equal(lib.checkJiraToken(200).ok, true)
  const caducado = lib.checkJiraToken(401)
  assert.equal(caducado.ok, false)
  assert.match(caducado.hint, /regenerar/)
})
