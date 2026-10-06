import type { AttachmentConverter } from './types'
import { fenceFor } from './utils'

function decodeText(buffer: Buffer): string {
  return buffer.toString('utf8').replace(/^﻿/, '').trim()
}

export const jsonConverter: AttachmentConverter = {
  id: 'json',
  extensions: ['json'],
  async convert(buffer) {
    try {
      const raw = decodeText(buffer)
      if (!raw) return { skipped: 'unsupported' }

      let content = raw
      try {
        content = JSON.stringify(JSON.parse(raw), null, 2) ?? raw
      } catch {
        // JSON invalido: se conserva el texto original tal cual
      }

      // La valla se calcula sobre el contenido para que no pueda cerrar el bloque
      const fence = fenceFor(content)
      return { markdown: `${fence}json\n${content}\n${fence}` }
    } catch {
      return { skipped: 'unsupported' }
    }
  }
}

export const markdownConverter: AttachmentConverter = {
  id: 'markdown',
  extensions: ['md', 'markdown'],
  async convert(buffer) {
    try {
      const text = decodeText(buffer)
      return text ? { markdown: text } : { skipped: 'unsupported' }
    } catch {
      return { skipped: 'unsupported' }
    }
  }
}
