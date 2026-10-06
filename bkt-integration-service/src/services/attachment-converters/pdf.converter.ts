import { getDocumentProxy } from 'unpdf'
import type { AttachmentConverter, ConversionOutcome } from './types'

const MAX_PAGES = 200

// Se recorre pagina a pagina (no extractText sobre todo el documento) para poder
// parar al llegar al tope de paginas o de caracteres sin procesar el resto.
async function convertPdf(buffer: Buffer, maxOutputChars: number): Promise<ConversionOutcome> {
  // unpdf/pdf.js rechaza Buffer: exige un Uint8Array puro
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  try {
    const pageCount = Math.min(pdf.numPages, MAX_PAGES)
    const sections: string[] = []
    let length = 0

    for (let pageNumber = 1; pageNumber <= pageCount && length < maxOutputChars; pageNumber++) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      page.cleanup()

      let text = ''
      for (const item of content.items) {
        if (!('str' in item)) continue
        text += item.str
        if (item.hasEOL) text += '\n'
      }
      text = text.trim()
      if (!text) continue

      const section = `## Página ${pageNumber}\n\n${text}`
      sections.push(section)
      length += section.length + 2
    }

    if (sections.length === 0) return { skipped: 'unsupported' }
    return { markdown: sections.join('\n\n').slice(0, maxOutputChars) }
  } finally {
    await pdf.loadingTask.destroy().catch(() => undefined)
  }
}

export const pdfConverter: AttachmentConverter = {
  id: 'pdf',
  extensions: ['pdf'],
  requiredSniff: 'pdf',
  isolated: true,
  async convert(buffer, limits) {
    try {
      return await convertPdf(buffer, limits.maxOutputChars)
    } catch {
      // corrupto, con contraseña o cualquier fallo del parser
      return { skipped: 'unsupported' }
    }
  }
}
