import path from 'path'
import { Worker } from 'worker_threads'

export const DEFAULT_WORKER_MEMORY_MB = 512

export interface WorkerFile {
  path: string
  execArgv: string[]
}

export interface WorkerRunOptions {
  timeoutMs: number
  maxOldGenerationSizeMb?: number
}

export type WorkerFailure = 'timeout' | 'memory' | 'error'

export type WorkerResult<T> = { ok: true; value: T } | { ok: false; reason: WorkerFailure }

// El worker vive junto a este fichero. Compilado es .js; en desarrollo y en
// Jest es .ts y necesita ts-node para poder cargarse.
export function workerFile(baseName: string): WorkerFile {
  const extension = path.extname(__filename)
  return {
    path: path.join(__dirname, `${baseName}${extension}`),
    execArgv: extension === '.ts' ? ['--require', 'ts-node/register/transpile-only'] : []
  }
}

// Ejecuta una tarea en un hilo aparte que se mata al pasar el tiempo o la
// memoria permitidos. A diferencia de un timeout sobre una promesa, esto SI
// corta un analisis sincrono que acapare la CPU, y el hilo principal sigue
// atendiendo peticiones mientras tanto.
export function runInWorker<T>(
  file: WorkerFile,
  input: unknown,
  options: WorkerRunOptions
): Promise<WorkerResult<T>> {
  return new Promise(resolve => {
    let settled = false
    let timer: NodeJS.Timeout | undefined

    const worker = new Worker(file.path, {
      workerData: input,
      execArgv: file.execArgv,
      resourceLimits: { maxOldGenerationSizeMb: options.maxOldGenerationSizeMb ?? DEFAULT_WORKER_MEMORY_MB }
    })

    const finish = (result: WorkerResult<T>): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      void worker.terminate()
      resolve(result)
    }

    timer = setTimeout(() => finish({ ok: false, reason: 'timeout' }), options.timeoutMs)
    worker.once('message', (value: T) => finish({ ok: true, value }))
    worker.once('error', (error: NodeJS.ErrnoException) =>
      finish({ ok: false, reason: error.code === 'ERR_WORKER_OUT_OF_MEMORY' ? 'memory' : 'error' })
    )
    worker.once('exit', () => finish({ ok: false, reason: 'error' }))
  })
}

// Limita cuantas tareas corren a la vez; el resto espera su turno.
export class Semaphore {
  private active = 0
  private readonly waiting: Array<() => void> = []

  constructor(private readonly max: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active < this.max) {
      this.active++
    } else {
      // El turno se cede directamente al siguiente: active no baja ni sube.
      await new Promise<void>(resolve => this.waiting.push(resolve))
    }
    try {
      return await task()
    } finally {
      const next = this.waiting.shift()
      if (next) next()
      else this.active--
    }
  }
}
