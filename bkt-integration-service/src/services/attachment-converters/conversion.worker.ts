import { isMainThread, parentPort, workerData } from 'worker_threads'
import { findConverterById } from './registry'
import type { ConversionOutcome, ConverterLimits } from './types'

export interface ConversionWorkerInput {
  converterId: string
  buffer: Uint8Array
  limits: ConverterLimits
}

async function run(input: ConversionWorkerInput): Promise<ConversionOutcome> {
  const converter = findConverterById(input.converterId)
  if (!converter) return { skipped: 'unsupported' }
  return converter.convert(Buffer.from(input.buffer), input.limits)
}

// Solo se ejecuta dentro de un worker; importar este fichero desde el hilo
// principal (p. ej. al calcular la cobertura) no hace nada.
if (!isMainThread && parentPort) {
  const port = parentPort
  run(workerData as ConversionWorkerInput)
    .then(outcome => port.postMessage(outcome))
    .catch(() => port.postMessage({ skipped: 'unsupported' } satisfies ConversionOutcome))
}
