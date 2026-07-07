import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export function resolveInstallRoot(startDir: string): string {
  let current = resolve(startDir);

  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(current, 'plugin', 'hooks'))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return resolve(startDir);
}
