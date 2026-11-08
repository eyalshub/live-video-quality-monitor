import { describe, expect, it } from 'vitest'

import type { Sample } from '../metrics/verdict'
import { type BatchSender, Outbox } from './outbox'

function sample(t: number): Sample {
  return {
    t,
    fps: 30,
    brightness: 130,
    motion: 2,
    face: true,
    verdict: 'good',
    reason: null,
  }
}

function recorder(outcomes: ('ok' | 'retry' | 'reject' | 'throw')[]) {
  const calls: number[][] = []
  const send: BatchSender = (samples) => {
    calls.push(samples.map((s) => s.t))
    const outcome = outcomes.shift() ?? 'ok'
    if (outcome === 'throw') return Promise.reject(new Error('network down'))
    return Promise.resolve(outcome)
  }
  return { calls, send }
}

describe('Outbox', () => {
  it('sends queued samples and forgets them on success', async () => {
    const outbox = new Outbox(10)
    outbox.add(sample(0))
    outbox.add(sample(1))
    const { calls, send } = recorder(['ok'])
    expect(await outbox.flush(send)).toBe('ok')
    expect(calls).toEqual([[0, 1]])
    expect(outbox.pendingCount).toBe(0)
  })

  it('keeps samples after a failure and resends them first with the next batch', async () => {
    const outbox = new Outbox(10)
    outbox.add(sample(0))
    const { calls, send } = recorder(['throw', 'ok'])
    expect(await outbox.flush(send)).toBe('retry')
    expect(outbox.pendingCount).toBe(1)
    outbox.add(sample(1))
    await outbox.flush(send)
    expect(calls).toEqual([[0], [0, 1]])
    expect(outbox.pendingCount).toBe(0)
  })

  it('treats a retry outcome (5xx, timeout) like a network failure', async () => {
    const outbox = new Outbox(10)
    outbox.add(sample(0))
    await outbox.flush(recorder(['retry']).send)
    expect(outbox.pendingCount).toBe(1)
  })

  it('counts rejected samples and does not resend them', async () => {
    const outbox = new Outbox(10)
    outbox.add(sample(0))
    await outbox.flush(recorder(['reject']).send)
    expect(outbox.pendingCount).toBe(0)
    expect(outbox.rejected).toBe(1)
  })

  it('splits a long queue into batches of at most maxBatch', async () => {
    const outbox = new Outbox(2)
    for (let t = 0; t < 5; t++) outbox.add(sample(t))
    const { calls, send } = recorder([])
    await outbox.flush(send)
    await outbox.flush(send)
    await outbox.flush(send)
    expect(calls).toEqual([[0, 1], [2, 3], [4]])
  })

  it('allows only one request in flight', async () => {
    const outbox = new Outbox(10)
    outbox.add(sample(0))
    let release: (value: 'ok') => void = () => undefined
    const slow: BatchSender = () =>
      new Promise((resolve) => {
        release = resolve
      })
    const first = outbox.flush(slow)
    expect(outbox.isSending).toBe(true)
    expect(await outbox.flush(slow)).toBe('idle')
    release('ok')
    expect(await first).toBe('ok')
  })

  it('does nothing when empty', async () => {
    expect(await new Outbox(10).flush(recorder([]).send)).toBe('idle')
  })

  it('drainAll includes in-flight samples, dedupes by t, sorts and chunks', () => {
    const outbox = new Outbox(2)
    outbox.add(sample(3))
    outbox.add(sample(1))
    void outbox.flush(() => new Promise(() => undefined)) // t=3,1 stay in flight forever
    outbox.add(sample(2))
    outbox.add(sample(1))
    expect(outbox.drainAll().map((chunk) => chunk.map((s) => s.t))).toEqual([[1, 2], [3]])
    expect(outbox.pendingCount).toBe(0)
  })

  it('is closed after drainAll: late results and new samples are ignored', async () => {
    const outbox = new Outbox(10)
    outbox.add(sample(0))
    let fail: (reason: Error) => void = () => undefined
    const pending = outbox.flush(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject
        }),
    )
    outbox.drainAll()
    fail(new Error('late failure'))
    await pending
    outbox.add(sample(1))
    expect(outbox.pendingCount).toBe(0)
  })

  it('snapshotChunks copies without closing', () => {
    const outbox = new Outbox(10)
    outbox.add(sample(0))
    expect(outbox.snapshotChunks()).toEqual([[sample(0)]])
    expect(outbox.pendingCount).toBe(1)
  })
})
