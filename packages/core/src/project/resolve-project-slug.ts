import { basename, dirname, resolve } from 'node:path';
import { execSync } from 'node:child_process';

function trySlugFromGit(directory: string): string | null {
  try {
    const root = execSync('git rev-parse --show-toplevel', {
      cwd: directory,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return basename(root);
  } catch {
    return null;
  }
}

export function resolveProjectSlug(
  workingDirectory: string,
  override?: string,
  hintPath?: string,
): string {
  if (override?.trim()) {
    return override.trim();
  }

  const fromCwd = trySlugFromGit(workingDirectory);
  if (fromCwd) {
    return fromCwd;
  }

  if (hintPath) {
    const fromHint = trySlugFromGit(dirname(resolve(hintPath)));
    if (fromHint) {
      return fromHint;
    }
  }

  return basename(workingDirectory);
}
