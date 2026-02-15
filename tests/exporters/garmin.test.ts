import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { Writable, PassThrough } from 'node:stream';
import type { BodyComposition } from '../../src/interfaces/scale-adapter.js';

const samplePayload: BodyComposition = {
  weight: 80,
  impedance: 500,
  bmi: 23.9,
  bodyFatPercent: 18.5,
  waterPercent: 55.2,
  boneMass: 3.1,
  muscleMass: 62.4,
  visceralFat: 8,
  physiqueRating: 5,
  bmr: 1750,
  metabolicAge: 30,
};

interface MockProc extends EventEmitter {
  stdin: Writable | null;
  stdout: PassThrough | null;
  stderr: null;
}

function createVersionCheckProc(exitCode: number, errorMsg?: string): MockProc {
  const proc = new EventEmitter() as MockProc;
  proc.stdin = null;
  proc.stdout = null;
  proc.stderr = null;
  process.nextTick(() => {
    if (errorMsg) {
      proc.emit('error', new Error(errorMsg));
    } else {
      proc.emit('close', exitCode);
    }
  });
  return proc;
}

function createUploadProc(stdoutData: string, exitCode: number): MockProc {
  const proc = new EventEmitter() as MockProc;
  const stdinStream = new Writable({
    write(_chunk, _enc, cb) {
      cb();
    },
  });
  const stdoutStream = new PassThrough();

  proc.stdin = stdinStream;
  proc.stdout = stdoutStream;
  proc.stderr = null;

  process.nextTick(() => {
    stdoutStream.write(stdoutData);
    stdoutStream.end();
    proc.emit('close', exitCode);
  });

  return proc;
}

const { mockSpawn } = vi.hoisted(() => {
  const mockSpawn = vi.fn();
  return { mockSpawn };
});

vi.mock('node:child_process', () => ({
  spawn: mockSpawn,
}));

describe('GarminExporter', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../src/exporters/garmin.js');
    mod._resetPythonCache();
  });

  it('returns success on successful upload', async () => {
    const uploadResult = JSON.stringify({ success: true, data: { weight: 80 } });

    mockSpawn.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === '--version') return createVersionCheckProc(0);
      return createUploadProc(uploadResult, 0);
    });

    const { GarminExporter } = await import('../../src/exporters/garmin.js');
    const exporter = new GarminExporter();
    const result = await exporter.export(samplePayload);

    expect(result.success).toBe(true);
    expect(mockSpawn).toHaveBeenCalledTimes(2);
    expect(mockSpawn.mock.calls[0][0]).toBe('python3');
  });

  it('retries on failure and eventually returns failure', async () => {
    const failResult = JSON.stringify({ success: false, error: 'auth failed' });

    mockSpawn.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === '--version') return createVersionCheckProc(0);
      return createUploadProc(failResult, 1);
    });

    const { GarminExporter } = await import('../../src/exporters/garmin.js');
    const exporter = new GarminExporter();
    const result = await exporter.export(samplePayload);

    expect(result.success).toBe(false);
    expect(result.error).toBe('auth failed');
    // 1 version check + 3 upload attempts
    expect(mockSpawn).toHaveBeenCalledTimes(4);
  });

  it('falls back to python when python3 is not found', async () => {
    const uploadResult = JSON.stringify({ success: true });

    mockSpawn.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === '--version') return createVersionCheckProc(0, 'not found');
      return createUploadProc(uploadResult, 0);
    });

    const { GarminExporter } = await import('../../src/exporters/garmin.js');
    const exporter = new GarminExporter();
    const result = await exporter.export(samplePayload);

    expect(result.success).toBe(true);
    expect(mockSpawn).toHaveBeenCalledTimes(2);
    // Second spawn call should use 'python' (fallback)
    expect(mockSpawn.mock.calls[1][0]).toBe('python');
  });

  it('passes token_dir to Python subprocess', async () => {
    const uploadResult = JSON.stringify({ success: true, data: { weight: 80 } });

    mockSpawn.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === '--version') return createVersionCheckProc(0);
      return createUploadProc(uploadResult, 0);
    });

    const { GarminExporter } = await import('../../src/exporters/garmin.js');
    const exporter = new GarminExporter({ token_dir: '/custom/token/path' });
    const result = await exporter.export(samplePayload);

    expect(result.success).toBe(true);
    // Check that token_dir was passed as CLI argument
    const uploadCall = mockSpawn.mock.calls[1];
    expect(uploadCall[1]).toContain('--token-dir');
    expect(uploadCall[1]).toContain('/custom/token/path');
    // Check that TOKEN_DIR env var is set
    expect(uploadCall[2].env.TOKEN_DIR).toBe('/custom/token/path');
  });

  it('expands ~ to home directory in token_dir', async () => {
    const uploadResult = JSON.stringify({ success: true });

    mockSpawn.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === '--version') return createVersionCheckProc(0);
      return createUploadProc(uploadResult, 0);
    });

    const { GarminExporter } = await import('../../src/exporters/garmin.js');
    const exporter = new GarminExporter({ token_dir: '~/my-tokens' });
    const result = await exporter.export(samplePayload);

    expect(result.success).toBe(true);
    // Check that ~ was expanded
    const uploadCall = mockSpawn.mock.calls[1];
    expect(uploadCall[1]).toContain('--token-dir');
    const tokenDirArg = uploadCall[1][uploadCall[1].indexOf('--token-dir') + 1];
    expect(tokenDirArg).not.toContain('~');
  });

  it('works without token_dir (backward compatibility)', async () => {
    const uploadResult = JSON.stringify({ success: true });

    mockSpawn.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === '--version') return createVersionCheckProc(0);
      return createUploadProc(uploadResult, 0);
    });

    const { GarminExporter } = await import('../../src/exporters/garmin.js');
    const exporter = new GarminExporter();
    const result = await exporter.export(samplePayload);

    expect(result.success).toBe(true);
    // Check that no --token-dir argument was added
    const uploadCall = mockSpawn.mock.calls[1];
    expect(uploadCall[1]).not.toContain('--token-dir');
    // TOKEN_DIR env var should not be explicitly set (but env is passed through)
    expect(uploadCall[2].env).toBeDefined();
  });
});
