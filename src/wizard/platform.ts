import { execSync } from 'node:child_process';
import type { PlatformInfo } from './types.js';

function tryExec(cmd: string): string | null {
  try {
    return execSync(cmd, { stdio: 'pipe', timeout: 5000 }).toString().trim();
  } catch {
    return null;
  }
}

export function detectPlatform(): PlatformInfo {
  const os = process.platform as PlatformInfo['os'];
  const arch = process.arch;

  // Docker detection
  const hasDocker = tryExec('docker --version') !== null;

  // Python detection (python3 first, then python)
  let hasPython = false;
  let pythonCommand: string | null = null;

  const py3 = tryExec('python3 --version');
  if (py3) {
    hasPython = true;
    pythonCommand = 'python3';
  } else {
    const py = tryExec('python --version');
    if (py) {
      hasPython = true;
      pythonCommand = 'python';
    }
  }

  // BT GID on Linux
  let btGid: number | undefined;
  if (os === 'linux') {
    const gidLine = tryExec('getent group bluetooth');
    if (gidLine) {
      const parts = gidLine.split(':');
      const gid = Number(parts[2]);
      if (Number.isFinite(gid)) btGid = gid;
    }
  }

  return { os, arch, hasDocker, hasPython, pythonCommand, btGid };
}
