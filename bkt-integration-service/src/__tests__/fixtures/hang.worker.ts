import { isMainThread } from 'worker_threads'

if (!isMainThread) {
  for (;;) {
    // bucle sincrono infinito: simula un analisis que acapara la CPU
  }
}
