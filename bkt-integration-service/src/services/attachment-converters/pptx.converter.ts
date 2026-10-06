import JSZip from 'jszip'
import type { AttachmentConverter } from './types'
import { isZipTooLarge } from './utils'

const MAX_SLIDES = 200
const SLIDE_PATH = /^ppt\/slides\/slide(\d+)\.xml$/
// Patrones simples y no codiciosos, aplicados por diapositiva: sin anidar
// cuantificadores, asi no hay backtracking catastrofico con XML hostil.
const PARAGRAPH = /<a:p(?:\s[^>]*)?>([\s\S]*?)<\/a:p>/g
const RUN_OR_BREAK = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>|<a:br\s*\/?>/g

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'"
}

function decodeEntities(value: string): string {
  // Una sola pasada: decodificar en dos pasadas convertiria "&amp;lt;" en "<".
  return value.replace(
    /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|(amp|lt|gt|quot|apos));/g,
    (match: string, dec?: string, hex?: string, name?: string): string => {
      if (name) return NAMED_ENTITIES[name] ?? match
      const code = dec ? Number.parseInt(dec, 10) : Number.parseInt(hex ?? '', 16)
      if (!Number.isFinite(code) || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return match
      return String.fromCodePoint(code)
    }
  )
}

function extractSlideText(xml: string): string {
  const lines: string[] = []
  for (const paragraph of xml.matchAll(PARAGRAPH)) {
    let line = ''
    for (const token of (paragraph[1] ?? '').matchAll(RUN_OR_BREAK)) {
      line += token[1] === undefined ? '\n' : decodeEntities(token[1])
    }
    const trimmed = line.trim()
    if (trimmed) lines.push(trimmed)
  }
  return lines.join('\n')
}

export const pptxConverter: AttachmentConverter = {
  id: 'pptx',
  extensions: ['pptx'],
  requiredSniff: 'pptx',
  async convert(buffer, limits) {
    try {
      if (isZipTooLarge(buffer, limits)) return { skipped: 'too_large' }

      const zip = await JSZip.loadAsync(buffer)
      const slides = Object.keys(zip.files)
        .map(path => ({ path, number: Number(SLIDE_PATH.exec(path)?.[1]) }))
        .filter(slide => Number.isFinite(slide.number))
        .sort((a, b) => a.number - b.number)
        .slice(0, MAX_SLIDES)

      const sections: string[] = []
      let size = 0
      for (const slide of slides) {
        const file = zip.file(slide.path)
        if (!file) continue
        const text = extractSlideText(await file.async('string'))
        if (!text) continue
        const section = `## Diapositiva ${slide.number}\n\n${text}`
        sections.push(section)
        size += section.length + 2
        if (size >= limits.maxOutputChars) break
      }

      if (sections.length === 0) return { skipped: 'unsupported' }
      return { markdown: sections.join('\n\n') }
    } catch {
      return { skipped: 'unsupported' }
    }
  }
}
