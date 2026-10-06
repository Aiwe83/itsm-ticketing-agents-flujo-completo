import http from 'node:http'
import type { AddressInfo } from 'node:net'

export interface FakeJiraRequest {
  url: string
  authorization: string | undefined
}

export interface FakeJira {
  baseUrl: string
  requests: FakeJiraRequest[]
  // `redirect` reproduce Jira Cloud real: la URL de descarga responde 302 a otra URL.
  addFile(id: string, buffer: Buffer, options?: { redirect?: boolean }): void
  close(): Promise<void>
}

// `got` (que usa el fetcher en produccion) es solo ESM y no carga bajo Jest. Este cliente de prueba
// usa el `fetch` de Node y respeta las mismas opciones; en particular, con `followRedirect: false`
// devuelve el cuerpo vacio de la 302, igual que got (el fallo real que ya tuvimos con Jira).
export const nodeFetchClient = {
  async get(
    url: string,
    options: { followRedirect: boolean; headers: { authorization: string } }
  ): Promise<{ body: Buffer }> {
    const response = await fetch(url, {
      headers: options.headers,
      redirect: options.followRedirect ? 'follow' : 'manual'
    })
    const isRedirect = response.status >= 300 && response.status < 400
    if (!response.ok && !isRedirect) throw new Error(`HTTP ${response.status}`)
    return { body: Buffer.from(await response.arrayBuffer()) }
  }
}

// Jira falso para las pruebas E2E: sirve adjuntos con autenticacion Basic y, si se
// pide, tras una redireccion 302.
export async function startFakeJira(credentials: { user: string; password: string }): Promise<FakeJira> {
  const expectedAuthorization = `Basic ${Buffer.from(`${credentials.user}:${credentials.password}`).toString('base64')}`
  const files = new Map<string, { buffer: Buffer; redirect: boolean }>()
  const requests: FakeJiraRequest[] = []

  const server = http.createServer((req, res) => {
    const url = req.url ?? ''
    requests.push({ url, authorization: req.headers.authorization })

    const content = /^\/rest\/api\/3\/attachment\/content\/([^/?]+)/.exec(url)
    const media = /^\/media\/([^/?]+)/.exec(url)

    if (content) {
      if (req.headers.authorization !== expectedAuthorization) {
        res.writeHead(401).end('unauthorized')
        return
      }
      const file = files.get(content[1] ?? '')
      if (!file) {
        res.writeHead(404).end('not found')
        return
      }
      if (file.redirect) {
        res.writeHead(302, { location: `/media/${content[1]}` }).end()
        return
      }
      res.writeHead(200, { 'content-type': 'application/octet-stream' }).end(file.buffer)
      return
    }

    if (media) {
      const file = files.get(media[1] ?? '')
      if (!file) {
        res.writeHead(404).end('not found')
        return
      }
      res.writeHead(200, { 'content-type': 'application/octet-stream' }).end(file.buffer)
      return
    }

    res.writeHead(404).end('not found')
  })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    addFile: (id, buffer, options) => {
      files.set(id, { buffer, redirect: options?.redirect ?? false })
    },
    close: () => new Promise<void>(resolve => server.close(() => resolve()))
  }
}
