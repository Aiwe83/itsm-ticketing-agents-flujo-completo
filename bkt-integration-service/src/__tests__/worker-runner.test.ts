import path from 'path'
import { Semaphore, runInWorker, workerFile, type WorkerFile } from '../services/attachment-converters/worker-runner'

const TS_NODE = ['--require', 'ts-node/register/transpile-only']
const fixture = (name: string): WorkerFile => ({
  path: path.join(__dirname, 'fixtures', name),
  execArgv: TS_NODE
})

describe('runInWorker', () => {
  it('returns what the worker posts', async () => {
    const result = await runInWorker<{ eco: string }>(fixture('echo.worker.ts'), 'hola', { timeoutMs: 8000 })

    expect(result).toEqual({ ok: true, value: { eco: 'hola' } })
  })

  it('kills a worker stuck in a synchronous infinite loop and keeps the main thread alive', async () => {
    let ticks = 0
    const heartbeat = setInterval(() => ticks++, 20)
    const started = Date.now()

    const result = await runInWorker(fixture('hang.worker.ts'), null, { timeoutMs: 600 })
    clearInterval(heartbeat)

    expect(result).toEqual({ ok: false, reason: 'timeout' })
    expect(Date.now() - started).toBeLessThan(5000)
    // Si el bucle hubiera corrido en el hilo principal, el intervalo no habria latido.
    expect(ticks).toBeGreaterThan(5)
  })

  it('stops a worker that exhausts its memory limit', async () => {
    const result = await runInWorker(fixture('memory.worker.ts'), null, {
      timeoutMs: 20_000,
      maxOldGenerationSizeMb: 64
    })

    expect(result).toEqual({ ok: false, reason: 'memory' })
  })

  it('reports an error when the worker file cannot be loaded', async () => {
    const result = await runInWorker(fixture('no-existe.worker.ts'), null, { timeoutMs: 8000 })

    expect(result).toEqual({ ok: false, reason: 'error' })
  })

  it('resolves the real worker next to the runner, with ts-node only for .ts', () => {
    const file = workerFile('conversion.worker')

    expect(file.path.endsWith(path.join('attachment-converters', 'conversion.worker.ts'))).toBe(true)
    expect(file.execArgv).toEqual(TS_NODE)
  })
})

describe('Semaphore', () => {
  it('never runs more tasks at once than its limit and runs them all', async () => {
    const semaphore = new Semaphore(2)
    let active = 0
    let peak = 0
    const task = async (): Promise<number> => {
      active++
      peak = Math.max(peak, active)
      await new Promise(resolve => setTimeout(resolve, 20))
      active--
      return 1
    }

    const results = await Promise.all(Array.from({ length: 7 }, () => semaphore.run(task)))

    expect(results).toHaveLength(7)
    expect(peak).toBe(2)
    expect(active).toBe(0)
  })

  it('releases its slot when a task fails', async () => {
    const semaphore = new Semaphore(1)

    await expect(semaphore.run(async () => Promise.reject(new Error('fallo')))).rejects.toThrow('fallo')
    await expect(semaphore.run(async () => 'sigue')).resolves.toBe('sigue')
  })
})
