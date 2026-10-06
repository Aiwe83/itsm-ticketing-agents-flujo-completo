import { pdfConverter } from './pdf.converter'
import { pptxConverter } from './pptx.converter'
import { jsonConverter, markdownConverter } from './text-formats.converter'
import type { AttachmentConverter, SniffedType } from './types'
import { xlsxConverter } from './xlsx.converter'

// Anadir un formato = anadir su conversor a esta lista.
export const CONVERTERS: readonly AttachmentConverter[] = [
  pdfConverter,
  xlsxConverter,
  pptxConverter,
  jsonConverter,
  markdownConverter
]

export const CONVERTER_EXTENSIONS: ReadonlySet<string> = new Set(
  CONVERTERS.flatMap(converter => [...converter.extensions])
)

export function findConverterById(id: string): AttachmentConverter | undefined {
  return CONVERTERS.find(converter => converter.id === id)
}

export function findConverterByExtension(extension: string): AttachmentConverter | undefined {
  return CONVERTERS.find(converter => converter.extensions.includes(extension))
}

// Para adjuntos sin extension: el conversor cuyo tipo real coincide con la firma.
export function findConverterBySniff(type: SniffedType | null): AttachmentConverter | undefined {
  if (!type) return undefined
  return CONVERTERS.find(converter => converter.requiredSniff === type)
}
