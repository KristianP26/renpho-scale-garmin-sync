import { describe, it, expect, vi, afterEach } from 'vitest';
import { detectPlatform } from '../../src/wizard/platform.js';

// ─── detectPlatform() ────────────────────────────────────────────────────

describe('detectPlatform()', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the current platform OS', () => {
    const info = detectPlatform();
    expect(['linux', 'darwin', 'win32']).toContain(info.os);
  });

  it('returns the current arch', () => {
    const info = detectPlatform();
    expect(info.arch).toBeTruthy();
    expect(typeof info.arch).toBe('string');
  });

  it('returns boolean for hasDocker', () => {
    const info = detectPlatform();
    expect(typeof info.hasDocker).toBe('boolean');
  });

  it('returns boolean for hasPython', () => {
    const info = detectPlatform();
    expect(typeof info.hasPython).toBe('boolean');
  });

  it('pythonCommand is null when python not available or a string when available', () => {
    const info = detectPlatform();
    if (info.hasPython) {
      expect(typeof info.pythonCommand).toBe('string');
      expect(['python3', 'python']).toContain(info.pythonCommand);
    } else {
      expect(info.pythonCommand).toBeNull();
    }
  });

  it('btGid is undefined on non-Linux or a number on Linux', () => {
    const info = detectPlatform();
    if (info.os === 'linux') {
      // btGid may or may not be present depending on system
      if (info.btGid !== undefined) {
        expect(typeof info.btGid).toBe('number');
      }
    } else {
      expect(info.btGid).toBeUndefined();
    }
  });

  it('returns consistent results across multiple calls', () => {
    const first = detectPlatform();
    const second = detectPlatform();
    expect(first.os).toBe(second.os);
    expect(first.arch).toBe(second.arch);
  });

  it('has all required fields', () => {
    const info = detectPlatform();
    expect(info).toHaveProperty('os');
    expect(info).toHaveProperty('arch');
    expect(info).toHaveProperty('hasDocker');
    expect(info).toHaveProperty('hasPython');
    expect(info).toHaveProperty('pythonCommand');
  });
});
