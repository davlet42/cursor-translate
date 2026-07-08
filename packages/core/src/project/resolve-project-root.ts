import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';

function tryGitRoot(directory: string): string | null {
  try {
    return execSync('git rev-parse --show-toplevel', {
      cwd: directory,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

export function resolveProjectRoot(cwd: string, hintPath?: string): string {
  const fromCwd = tryGitRoot(cwd);
  if (fromCwd) {
    return fromCwd;
  }

  if (hintPath) {
    const fromHint = tryGitRoot(dirname(resolve(hintPath)));
    if (fromHint) {
      return fromHint;
    }
  }

  return cwd;
}
