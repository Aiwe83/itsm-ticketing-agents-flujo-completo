import { JiraAttachmentFetcher } from '../services/jira-attachment.fetcher'

describe('JiraAttachmentFetcher', () => {
  it('rejects attachment URLs outside the configured Jira origin', async () => {
    const fetcher = new JiraAttachmentFetcher({
      baseUrl: 'https://jira.example',
      user: 'jira-user',
      password: 'jira-password',
    })

    await expect(
      fetcher.fetch({
        filename: 'evil.txt',
        content: 'https://attacker.example/attachment/1',
      })
    ).rejects.toThrow('Attachment host is not allowed')
  })

  it('downloads attachments from the configured Jira origin', async () => {
    const httpClient = {
      get: jest.fn().mockResolvedValue({ body: Buffer.from('downloaded') }),
    }
    const fetcher = new JiraAttachmentFetcher(
      {
        baseUrl: 'https://jira.example/base',
        user: 'jira-user',
        password: 'jira-password',
        bytesLimit: 1024,
      },
      httpClient as any
    )

    await expect(
      fetcher.fetch({
        filename: 'ok.txt',
        content: 'https://jira.example/secure/attachment/1',
      })
    ).resolves.toEqual(Buffer.from('downloaded'))

    expect(httpClient.get).toHaveBeenCalledWith(
      'https://jira.example/secure/attachment/1',
      expect.objectContaining({
        followRedirect: true,
        responseType: 'buffer',
        headers: expect.objectContaining({
          authorization: expect.stringMatching(/^Basic /),
        }),
      })
    )
  })

  it('rejects a download that exceeds the configured byte limit', async () => {
    const httpClient = {
      get: jest.fn().mockResolvedValue({ body: Buffer.from('this buffer is way too long for the limit') }),
    }
    const fetcher = new JiraAttachmentFetcher(
      {
        baseUrl: 'https://jira.example',
        user: 'jira-user',
        password: 'jira-password',
        bytesLimit: 5,
      },
      httpClient as any
    )

    await expect(
      fetcher.fetch({
        filename: 'big.txt',
        content: 'https://jira.example/secure/attachment/2',
      })
    ).rejects.toThrow('Attachment exceeds the configured byte limit')
  })

  it('downloads attachments served from the Atlassian attachment gateway even on a different base origin', async () => {
    const httpClient = {
      get: jest.fn().mockResolvedValue({ body: Buffer.from('downloaded') }),
    }
    const fetcher = new JiraAttachmentFetcher(
      {
        baseUrl: 'https://pablodefranchi.atlassian.net',
        user: 'jira-user',
        password: 'jira-password',
      },
      httpClient as any
    )

    await expect(
      fetcher.fetch({
        filename: 'real.docx',
        content:
          'https://api.atlassian.com/ex/jira/576709d6-7e5b-4431-8a2f-7199ca648279/rest/api/3/attachment/content/10038',
      })
    ).resolves.toEqual(Buffer.from('downloaded'))
  })
})
