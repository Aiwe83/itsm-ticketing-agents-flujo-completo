// Contrato comun de los conversores de adjuntos a Markdown.
//
// Regla de fallos (decision sin cambiar el contrato OpenAPI): un fichero
// corrupto, con contraseña, escaneado sin texto o cuyo contenido no coincide
// con su extension se devuelve como `{ skipped: 'unsupported' }`. Un fichero
// cuyo contenido descomprimido o convertido es desproporcionado se devuelve
// como `{ skipped: 'too_large' }`. Un conversor NUNCA debe lanzar: el servicio
// tambien lo envuelve en try/catch y en un timeout, pero el contrato es no
// lanzar.

export type ConversionSkipReason = 'unsupported' | 'too_large'

export type ConversionOutcome = { markdown: string } | { skipped: ConversionSkipReason }

export interface ConverterLimits {
  // Tope de bytes del fichero descargado (ATTACHMENT_BYTES_LIMIT).
  bytesLimit: number
  // Tope de caracteres del Markdown final; el servicio trunca por encima.
  maxOutputChars: number
  // Tope de bytes descomprimidos para formatos zip (xlsx, pptx).
  maxUncompressedBytes: number
}

export type SniffedType = 'pdf' | 'xlsx' | 'pptx' | 'docx' | 'zip'

export interface AttachmentConverter {
  id: string
  // Extensiones en minusculas y sin punto.
  extensions: readonly string[]
  // Si existe, el contenido real (firma del fichero) debe ser de este tipo;
  // si no coincide, el adjunto se trata como unsupported.
  requiredSniff?: SniffedType
  // Si es true, el servicio lo ejecuta en un worker que se mata al pasar el
  // tiempo o la memoria permitidos (formatos cuyo analisis puede acaparar la CPU).
  isolated?: boolean
  convert(buffer: Buffer, limits: ConverterLimits): Promise<ConversionOutcome>
}
