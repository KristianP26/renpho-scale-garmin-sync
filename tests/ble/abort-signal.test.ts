import { describe, it, expect } from 'vitest';
import { abortableSleep } from '../../src/ble/types.js';

describe('abortableSleep()', () => {
  it('resolves normally when not aborted', async () => {
    await expect(abortableSleep(10)).resolves.toBeUndefined();
  });

  it('rejects immediately on pre-aborted signal', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(abortableSleep(10_000, ac.signal)).rejects.toThrow();
  });

  it('rejects on mid-sleep abort', async () => {
    const ac = new AbortController();
    const promise = abortableSleep(10_000, ac.signal);
    setTimeout(() => ac.abort(), 10);
    await expect(promise).rejects.toThrow();
  });

  it('resolves when signal is not aborted', async () => {
    const ac = new AbortController();
    await expect(abortableSleep(10, ac.signal)).resolves.toBeUndefined();
  });
});
