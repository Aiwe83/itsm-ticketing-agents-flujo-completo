jest.mock('mammoth', () => ({
  __esModule: true,
  default: {
    convertToHtml: jest.fn(),
  },
}))

import mammoth from 'mammoth'
import { AttachmentService, type AttachmentFetcher } from '../services/attachment.service'
import { docxBuffer } from './fixtures/attachment-files'

const convertToHtmlMock = mammoth.convertToHtml as jest.MockedFunction<typeof mammoth.convertToHtml>

describe('AttachmentService', () => {
  beforeEach(() => {
    convertToHtmlMock.mockReset()
  })

  it('converts an inline txt attachment to plain text', async () => {
    const service = new AttachmentService(undefined, { bytesLimit: 1024 })

    const result = await service.processAttachments([
      { filename: 'nota.txt', data: ' Texto visible para agentes ' },
    ])

    expect(result).toEqual([{ filename: 'nota.txt', markdown: 'Texto visible para agentes' }])
  })

  it('converts a Word attachment to Markdown through mammoth + turndown', async () => {
    convertToHtmlMock.mockResolvedValueOnce({ value: '<p>Texto Word</p>', messages: [] } as any)
    const service = new AttachmentService(undefined, { bytesLimit: 100_000 })

    const result = await service.processAttachments([
      { filename: 'informe.docx', buffer: await docxBuffer() },
    ])

    expect(convertToHtmlMock).toHaveBeenCalled()
    expect(result).toEqual([{ filename: 'informe.docx', markdown: 'Texto Word' }])
  })

  it('converts an HTML table in a Word attachment to a Markdown table (GFM plugin wired)', async () => {
    convertToHtmlMock.mockResolvedValueOnce({
      value: '<table><tr><td>A</td><td>B</td></tr></table>',
      messages: [],
    } as any)
    const service = new AttachmentService(undefined, { bytesLimit: 100_000 })

    const result = await service.processAttachments([
      { filename: 'tabla.docx', buffer: await docxBuffer() },
    ])

    expect(result).toHaveLength(1)
    expect(result[0]?.markdown).toContain('|')
    expect(result[0]?.markdown).toContain('A')
    expect(result[0]?.markdown).toContain('B')
  })

  it('marks unsupported extensions without throwing', async () => {
    const service = new AttachmentService(undefined, { bytesLimit: 1024 })

    const result = await service.processAttachments([{ filename: 'imagen.png', data: 'binary' }])

    expect(result).toEqual([
      { filename: 'imagen.png', markdown: '', skippedReason: 'unsupported' },
    ])
  })

  it('marks remote attachments as download_failed when no fetcher exists', async () => {
    const service = new AttachmentService(undefined, { bytesLimit: 1024 })

    const result = await service.processAttachments([
      { filename: 'remoto.txt', content: 'https://jira.example/attachment/1' },
    ])

    expect(result).toEqual([
      { filename: 'remoto.txt', markdown: '', skippedReason: 'download_failed' },
    ])
  })

  it('uses the fetcher for remote attachments', async () => {
    const fetcher: AttachmentFetcher = {
      fetch: jest.fn().mockResolvedValue(Buffer.from('texto descargado')),
    }
    const service = new AttachmentService(fetcher, { bytesLimit: 1024 })

    const result = await service.processAttachments([
      { filename: 'remoto.txt', content: 'https://jira.example/attachment/1' },
    ])

    expect(fetcher.fetch).toHaveBeenCalledTimes(1)
    expect(result).toEqual([{ filename: 'remoto.txt', markdown: 'texto descargado' }])
  })

  it('skips attachments above the declared or real byte limit', async () => {
    const fetcher: AttachmentFetcher = {
      fetch: jest.fn().mockResolvedValue(Buffer.from('demasiado grande')),
    }
    const service = new AttachmentService(fetcher, { bytesLimit: 4 })

    const result = await service.processAttachments([
      { filename: 'declarado.txt', size: 10, data: 'ok' },
      { filename: 'real.txt', content: 'https://jira.example/attachment/2' },
    ])

    expect(result).toEqual([
      { filename: 'declarado.txt', markdown: '', skippedReason: 'too_large' },
      { filename: 'real.txt', markdown: '', skippedReason: 'too_large' },
    ])
  })

  it('skips a Word attachment whose converted HTML expands far beyond its downloaded size', async () => {
    convertToHtmlMock.mockResolvedValueOnce({ value: 'x'.repeat(1_100_000), messages: [] } as any)
    const service = new AttachmentService(undefined, { bytesLimit: 100_000 })

    const result = await service.processAttachments([
      { filename: 'bomba.docx', buffer: await docxBuffer() },
    ])

    expect(result).toEqual([{ filename: 'bomba.docx', markdown: '', skippedReason: 'too_large' }])
  })

  it('keeps processing the rest of the attachment list when one fails', async () => {
    const fetcher: AttachmentFetcher = {
      fetch: jest.fn().mockRejectedValue(new Error('network error')),
    }
    const service = new AttachmentService(fetcher, { bytesLimit: 1024 })

    const result = await service.processAttachments([
      { filename: 'ok.txt', data: 'correcto' },
      { filename: 'roto.txt', content: 'https://jira.example/attachment/3' },
    ])

    expect(result).toEqual([
      { filename: 'ok.txt', markdown: 'correcto' },
      { filename: 'roto.txt', markdown: '', skippedReason: 'download_failed' },
    ])
  })
})
