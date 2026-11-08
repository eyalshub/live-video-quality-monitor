/**
 * Samples waiting to be stored by the backend. Nothing is dropped on a network failure: the
 * samples go back to the front of the queue and ride along with the next batch. The backend
 * ignores duplicates, so resending is always safe (iron rule 6).
 */
import type { Sample } from '../metrics/verdict'

/** ok = stored; retry = transient failure (network, timeout, 5xx); reject = the server refused
 * the data (4xx) and resending would fail again. */
export type SendOutcome = 'ok' | 'retry' | 'reject'

export type BatchSender = (samples: Sample[]) => Promise<SendOutcome>

export class Outbox {
  private queue: Sample[] = []
  private inFlight: Sample[] = []
  private closed = false
  rejected = 0

  private readonly maxBatch: number

  constructor(maxBatch: number) {
    if (!Number.isInteger(maxBatch) || maxBatch < 1) throw new Error('maxBatch must be >= 1')
    this.maxBatch = maxBatch
  }

  /** A method, not a field read: `closed` can change while `flush` awaits the network. */
  private isClosed(): boolean {
    return this.closed
  }

  add(sample: Sample): void {
    if (!this.closed) this.queue.push(sample)
  }

  /** Samples not yet confirmed by the backend (queued + in flight). */
  get pendingCount(): number {
    return this.queue.length + this.inFlight.length
  }

  get isSending(): boolean {
    return this.inFlight.length > 0
  }

  /** Send one batch (at most maxBatch). Only one request is in flight at a time. */
  async flush(send: BatchSender): Promise<SendOutcome | 'idle'> {
    if (this.closed || this.inFlight.length > 0 || this.queue.length === 0) return 'idle'
    const batch = this.queue.splice(0, this.maxBatch)
    this.inFlight = batch
    let outcome: SendOutcome
    try {
      outcome = await send(batch)
    } catch {
      outcome = 'retry'
    }
    // After drainAll (Stop / pagehide) the batch belongs to the final request: ignore this result.
    if (this.isClosed()) return outcome
    this.inFlight = []
    if (outcome === 'retry') this.queue.unshift(...batch)
    if (outcome === 'reject') this.rejected += batch.length
    return outcome
  }

  /**
   * Take everything still unconfirmed, including samples whose request is still in flight, and
   * close the outbox (Stop / pagehide). Sorted by t, one per t, split into backend-sized chunks.
   */
  drainAll(): Sample[][] {
    const byT = new Map<number, Sample>()
    for (const sample of [...this.inFlight, ...this.queue]) {
      if (!byT.has(sample.t)) byT.set(sample.t, sample)
    }
    this.queue = []
    this.inFlight = []
    this.closed = true
    const all = [...byT.values()].sort((a, b) => a.t - b.t)
    const chunks: Sample[][] = []
    for (let i = 0; i < all.length; i += this.maxBatch) chunks.push(all.slice(i, i + this.maxBatch))
    return chunks
  }

  /** Copy of everything unconfirmed, without closing (for the pagehide keepalive send). */
  snapshotChunks(): Sample[][] {
    const all = [...this.inFlight, ...this.queue].sort((a, b) => a.t - b.t)
    const chunks: Sample[][] = []
    for (let i = 0; i < all.length; i += this.maxBatch) chunks.push(all.slice(i, i + this.maxBatch))
    return chunks
  }
}
