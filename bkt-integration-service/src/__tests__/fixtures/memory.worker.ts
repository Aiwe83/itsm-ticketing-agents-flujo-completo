import { isMainThread } from 'worker_threads'

if (!isMainThread) {
  const hoard: string[] = []
  for (;;) hoard.push('x'.repeat(1_000_000))
}
