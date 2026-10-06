import { isMainThread, parentPort, workerData } from 'worker_threads'

if (!isMainThread && parentPort) parentPort.postMessage({ eco: workerData })
