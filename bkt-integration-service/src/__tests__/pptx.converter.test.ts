import JSZip from 'jszip'
import { pptxConverter } from '../services/attachment-converters/pptx.converter'
import { buildLimits } from '../services/attachment-converters/utils'

const limits = buildLimits(10_000_000)

function slideXml(paragraphs: string[]): string {
  const body = paragraphs.map(text => `<a:p><a:r><a:t>${text}</a:t></a:r></a:p>`).join('')
  return `<?xml version="1.0"?><p:sld><p:cSld><p:spTree><p:sp><p:txBody>${body}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`
}

async function pptxOf(slides: Record<number, string[]>): Promise<Buffer> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<Types/>')
  zip.file('ppt/presentation.xml', '<p:presentation/>')
  for (const [number, paragraphs] of Object.entries(slides)) {
    zip.file(`ppt/slides/slide${number}.xml`, slideXml(paragraphs))
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

describe('pptxConverter', () => {
  it('declares its id, extension and required signature', () => {
    expect(pptxConverter.id).toBe('pptx')
    expect(pptxConverter.extensions).toEqual(['pptx'])
    expect(pptxConverter.requiredSniff).toBe('pptx')
  })

  it('converts two slides in order, one paragraph per line', async () => {
    const buffer = await pptxOf({ 2: ['Segunda'], 1: ['Titulo', 'Subtitulo'] })
    expect(await pptxConverter.convert(buffer, limits)).toEqual({
      markdown: '## Diapositiva 1\n\nTitulo\nSubtitulo\n\n## Diapositiva 2\n\nSegunda'
    })
  })

  it('orders slides numerically (slide2 before slide10)', async () => {
    const buffer = await pptxOf({ 10: ['Diez'], 2: ['Dos'] })
    const result = await pptxConverter.convert(buffer, limits)
    const markdown = (result as { markdown: string }).markdown
    expect(markdown.indexOf('Diapositiva 2')).toBeLessThan(markdown.indexOf('Diapositiva 10'))
  })

  it('joins the runs of a paragraph and decodes XML entities', async () => {
    const zip = new JSZip()
    zip.file('ppt/presentation.xml', '<p:presentation/>')
    zip.file(
      'ppt/slides/slide1.xml',
      '<p:sld><a:p><a:r><a:t>A &amp; B </a:t></a:r><a:r><a:t xml:space="preserve">&lt;x&gt; &quot;q&quot; &apos;s&apos; &#65;&#x42;</a:t></a:r></a:p></p:sld>'
    )
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })
    expect(await pptxConverter.convert(buffer, limits)).toEqual({
      markdown: '## Diapositiva 1\n\nA & B <x> "q" \'s\' AB'
    })
  })

  it('does not decode entities twice', async () => {
    const buffer = await pptxOf({ 1: ['&amp;lt;'] })
    expect(await pptxConverter.convert(buffer, limits)).toEqual({ markdown: '## Diapositiva 1\n\n&lt;' })
  })

  it('skips slides without text', async () => {
    const buffer = await pptxOf({ 1: ['Hola'], 2: [], 3: ['Fin'] })
    const result = await pptxConverter.convert(buffer, limits)
    const markdown = (result as { markdown: string }).markdown
    expect(markdown).toContain('Diapositiva 1')
    expect(markdown).not.toContain('Diapositiva 2')
    expect(markdown).toContain('Diapositiva 3')
  })

  it('returns unsupported when the deck has no text at all', async () => {
    const buffer = await pptxOf({ 1: [], 2: [] })
    expect(await pptxConverter.convert(buffer, limits)).toEqual({ skipped: 'unsupported' })
  })

  it('returns unsupported for a corrupt zip', async () => {
    const buffer = await pptxOf({ 1: ['Hola'] })
    const corrupt = Buffer.concat([buffer.subarray(0, 30), Buffer.from('basura que rompe el zip')])
    expect(await pptxConverter.convert(corrupt, limits)).toEqual({ skipped: 'unsupported' })
    expect(await pptxConverter.convert(Buffer.from('no soy un zip'), limits)).toEqual({ skipped: 'unsupported' })
  })

  it('returns too_large for an expansion bomb', async () => {
    const zip = new JSZip()
    zip.file('ppt/presentation.xml', '<p:presentation/>')
    zip.file('ppt/slides/slide1.xml', slideXml(['a'.repeat(5_000_000)]))
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    expect(buffer.byteLength).toBeLessThan(100_000)
    const result = await pptxConverter.convert(buffer, { ...limits, maxUncompressedBytes: 100_000 })
    expect(result).toEqual({ skipped: 'too_large' })
  })

  it('caps the number of slides at 200', async () => {
    const slides: Record<number, string[]> = {}
    for (let n = 1; n <= 250; n++) slides[n] = [`Texto ${n}`]
    const result = await pptxConverter.convert(await pptxOf(slides), limits)
    const markdown = (result as { markdown: string }).markdown
    expect(markdown).toContain('## Diapositiva 200\n')
    expect(markdown).not.toContain('## Diapositiva 201')
  })

  it('stops early once the output limit is reached', async () => {
    const slides: Record<number, string[]> = {}
    for (let n = 1; n <= 50; n++) slides[n] = ['x'.repeat(100)]
    const result = await pptxConverter.convert(await pptxOf(slides), { ...limits, maxOutputChars: 500 })
    const markdown = (result as { markdown: string }).markdown
    expect(markdown).toContain('## Diapositiva 1\n')
    expect(markdown).not.toContain('## Diapositiva 50')
  })
})
