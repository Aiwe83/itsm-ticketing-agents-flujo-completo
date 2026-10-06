import { env } from '../config/environment'
import type { AttachmentFetcher, RawAttachment } from './attachment.service'

// `got` resuelve con un objeto `Response`, no con el buffer directo — el
// contenido real esta en `.body` (confirmado contra una descarga real: pasar
// el objeto entero a mammoth/JSZip da "JSZip can't accept a stream when
// loading a zip file", porque JSZip ve un objeto stream-like, no un Buffer).
type GotClient = {
  get(url: string, options: AttachmentFetchOptions): Promise<{ body: Buffer }>
}

interface AttachmentFetchOptions {
  followRedirect: boolean
  headers: {
    authorization: string
  }
  retry: {
    limit: number
  }
  responseType: 'buffer'
  timeout: {
    request: number
  }
}

const DEFAULT_TIMEOUT_MS = 30_000

// Gateway propio de Atlassian para contenido de adjuntos de Jira Cloud via
// API REST (`https://api.atlassian.com/ex/jira/<cloudId>/...`). No es un
// valor configurable por el usuario ni depende del dominio del site: Jira
// Cloud siempre sirve el `content` de un adjunto por ahi, incluso cuando
// `JIRA_BASE_URL` apunta al dominio propio del site (confirmado contra un
// adjunto real).
const ATLASSIAN_ATTACHMENT_GATEWAY_ORIGIN = 'https://api.atlassian.com'

export class JiraAttachmentFetcher implements AttachmentFetcher {
  private readonly allowedOrigins: Set<string>

  constructor(
    private readonly config: {
      baseUrl: string
      user: string
      password: string
      bytesLimit?: number
      timeoutMs?: number
    },
    private readonly httpClient?: GotClient
  ) {
    this.allowedOrigins = new Set([new URL(config.baseUrl).origin, ATLASSIAN_ATTACHMENT_GATEWAY_ORIGIN])
  }

  async fetch(attachment: RawAttachment): Promise<Buffer> {
    if (typeof attachment.content !== 'string') {
      throw new Error('Attachment content URL is required')
    }

    const attachmentUrl = new URL(attachment.content)
    if (!this.allowedOrigins.has(attachmentUrl.origin)) {
      throw new Error('Attachment host is not allowed')
    }

    const options: AttachmentFetchOptions = {
      // Jira Cloud redirige la descarga real del contenido a una URL firmada
      // (su plataforma de media, origen distinto de `allowedOrigins`) — con
      // los redirects desactivados el body llega vacio (confirmado: "data
      // length = 0" al intentar descomprimir). El origen del redirect sigue
      // siendo Atlassian, no uno arbitrario: ya se valido el origen de la
      // URL de partida arriba.
      followRedirect: true,
      headers: {
        authorization: `Basic ${Buffer.from(`${this.config.user}:${this.config.password}`).toString('base64')}`,
      },
      retry: { limit: 2 },
      responseType: 'buffer',
      timeout: { request: this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS },
    }

    const httpClient = this.httpClient ?? (await this.loadDefaultHttpClient())
    const response = await httpClient.get(attachmentUrl.toString(), options)
    const buffer = response.body

    // `got` (desde la v12, ESM) ya no tiene una opcion nativa para cortar la
    // descarga por tamano a mitad de stream (`maxResponseSize` no existe en
    // su API real, un intento anterior de usarla rompia toda descarga real
    // con un error de validacion de opciones). Se comprueba el tamano ya
    // descargado en su lugar: igual de defensivo, solo que despues en vez de
    // durante.
    const bytesLimit = this.config.bytesLimit ?? env.ATTACHMENT_BYTES_LIMIT
    if (buffer.byteLength > bytesLimit) {
      throw new Error('Attachment exceeds the configured byte limit')
    }

    return buffer
  }

  private async loadDefaultHttpClient(): Promise<GotClient> {
    const gotModule = await import('got')
    return gotModule.default as unknown as GotClient
  }
}

export const createJiraAttachmentFetcher = (): JiraAttachmentFetcher | undefined => {
  if (!env.JIRA_BASE_URL || !env.JIRA_USER || !env.JIRA_PASSWORD) return undefined

  return new JiraAttachmentFetcher({
    baseUrl: env.JIRA_BASE_URL,
    user: env.JIRA_USER,
    password: env.JIRA_PASSWORD,
    bytesLimit: env.ATTACHMENT_BYTES_LIMIT,
  })
}
