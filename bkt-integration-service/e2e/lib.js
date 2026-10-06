'use strict'

// Funciones puras del preflight (sin red ni procesos), para poder probarlas con salidas de ejemplo.

const TRIGGER_VARS = {
  baseUrl: 'INTEGRATION_SERVICE_BASE_URL',
  apiKey: 'INTEGRATION_SERVICE_API_KEY',
  header: 'INTEGRATION_SERVICE_API_KEY_HEADER'
}

/** Filas `│ a │ b │ c │` de las tablas de la CLI de Forge, ya sin bordes ni espacios. */
function tableRows(text) {
  return String(text)
    .split(/\r?\n/)
    .filter(line => line.includes('│'))
    .map(line => line.split('│').slice(1, -1).map(cell => cell.trim()))
}

/** `forge variables list` -> [{ encrypted, key, value }] */
function parseForgeVariables(text) {
  return tableRows(text)
    .filter(row => row.length >= 3 && row[1] !== 'Key')
    .map(row => ({ encrypted: row[0] !== '', key: row[1], value: row[2] }))
}

/** `forge install list` -> [{ environment, site, version, status }] */
function parseForgeInstalls(text) {
  return tableRows(text)
    .filter(row => row.length >= 6 && row[0] !== 'Installation ID')
    .map(row => ({ environment: row[1], site: row[2], version: row[4], status: row[5] }))
}

/** Respuesta JSON de `http://127.0.0.1:4040/api/tunnels` -> [{ publicUrl, addr }] */
function parseNgrokTunnels(json) {
  const tunnels = Array.isArray(json && json.tunnels) ? json.tunnels : []
  return tunnels.map(tunnel => ({
    publicUrl: tunnel.public_url,
    addr: tunnel.config && tunnel.config.addr
  }))
}

function hostOf(url) {
  try {
    return new URL(url).host
  } catch {
    return undefined
  }
}

function portOf(addr) {
  const match = /:(\d+)\/?$/.exec(String(addr || ''))
  return match ? Number(match[1]) : undefined
}

function result(name, ok, detail, hint) {
  return { name, ok, detail, hint: ok ? undefined : hint }
}

/** La URL guardada en Forge: un solo `https://`, sin espacios y sin barra final. */
function checkForgeBaseUrl(value) {
  const name = 'Variable de Forge: URL del servicio'
  if (!value) {
    return result(name, false, 'INTEGRATION_SERVICE_BASE_URL no existe', 'forge variables set INTEGRATION_SERVICE_BASE_URL <https://dominio> y despues forge deploy')
  }
  if (/^https?:\/\/https?:\/\//i.test(value)) {
    return result(name, false, 'la URL lleva el esquema repetido (https://https://...)', 'Forge lee "https" como host y devuelve un 403 sin salir a la red; corregir la variable y volver a desplegar')
  }
  if (!/^https:\/\//i.test(value)) {
    return result(name, false, 'la URL no empieza por https://', 'Forge solo permite https; usar la URL https de ngrok')
  }
  if (/\s/.test(value) || /\/$/.test(value)) {
    return result(name, false, 'la URL tiene espacios o termina en "/"', 'dejar solo https://dominio, sin barra final')
  }
  return result(name, true, hostOf(value))
}

/** Compara el dominio de Forge con el de ngrok y el puerto al que reenvia con el del servicio. */
function checkNgrok(tunnels, forgeBaseUrl, servicePort) {
  const name = 'Tunel ngrok'
  const https = tunnels.filter(tunnel => String(tunnel.publicUrl).startsWith('https://'))
  if (https.length === 0) {
    return result(name, false, 'ngrok no tiene ningun tunel https abierto', 'arrancar ngrok: ngrok http <puerto> --url=<dominio-fijo>')
  }
  const forgeHost = hostOf(forgeBaseUrl)
  const match = https.find(tunnel => hostOf(tunnel.publicUrl) === forgeHost)
  if (!match) {
    return result(
      name,
      false,
      `ningun tunel coincide con el dominio de Forge (${forgeHost || 'sin URL'}); tuneles: ${https.map(t => hostOf(t.publicUrl)).join(', ')}`,
      'usar el dominio fijo de ngrok o actualizar la variable de Forge y volver a desplegar'
    )
  }
  const port = portOf(match.addr)
  if (servicePort && port !== servicePort) {
    return result(name, false, `el tunel reenvia a ${match.addr}, no al puerto ${servicePort} del servicio`, 'arrancar ngrok apuntando al puerto del servicio')
  }
  return result(name, true, `${hostOf(match.publicUrl)} -> ${match.addr}`)
}

function checkForgeHeaderAndKey(variables) {
  const name = 'Variables de Forge: clave y cabecera'
  const missing = [TRIGGER_VARS.apiKey, TRIGGER_VARS.header].filter(key => !variables.some(v => v.key === key))
  if (missing.length > 0) {
    return result(name, false, `faltan: ${missing.join(', ')}`, 'forge variables set --encrypt INTEGRATION_SERVICE_API_KEY (y la cabecera) y forge deploy')
  }
  return result(name, true, 'presentes (solo se comprueban los nombres)')
}

function checkInstall(installs, environment) {
  const name = 'Trigger instalado'
  const found = installs.filter(install => install.environment === environment)
  if (found.length === 0) {
    return result(name, false, `no hay instalacion en ${environment}`, 'forge install (requiere autorizacion): no se hace desde el preflight')
  }
  return result(name, true, found.map(i => `${i.site} v${i.version} (${i.status})`).join(', '))
}

function checkServiceHealth(status, body) {
  const name = 'Servicio y Mongo'
  const connected = body && body.database === 'connected'
  if (status !== 200 || !connected) {
    return result(name, false, `/health -> ${status}, base de datos ${body && body.database}`, 'levantar el contenedor del servicio y su Mongo (docker compose up -d)')
  }
  return result(name, true, '/health 200, base de datos conectada')
}

function checkJiraToken(status) {
  const name = 'Token de Jira'
  if (status === 200) return result(name, true, 'GET /rest/api/3/myself -> 200')
  return result(name, false, `GET /rest/api/3/myself -> ${status}`, status === 401 ? 'el token caduco o es de otra cuenta: regenerarlo y actualizar el .env del servicio' : 'revisar JIRA_BASE_URL y la red')
}

module.exports = {
  TRIGGER_VARS,
  parseForgeVariables,
  parseForgeInstalls,
  parseNgrokTunnels,
  hostOf,
  portOf,
  checkForgeBaseUrl,
  checkNgrok,
  checkForgeHeaderAndKey,
  checkInstall,
  checkServiceHealth,
  checkJiraToken
}
