import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { resolveTranslateHome } from '../config/resolve-translate-home.js';
import { resolveCachePathUnderHome } from './resolve-global-cache-path.js';
import { parseDocCache } from './parse-doc-cache.js';

// cursor-translate and claude-translate share the same cache format and the
// same slug/relative-path scheme, so a doc translated by one tool can be
// reused by the other instead of paying for a second translation.
// Override candidates with CURSOR_TRANSLATE_SIBLING_HOMES (colon-separated;
// empty string disables sharing).
export function resolveSiblingTranslateHomes(): string[] {
  const raw =
    process.env.CURSOR_TRANSLATE_SIBLING_HOMES ?? process.env.CLAUDE_TRANSLATE_SIBLING_HOMES;
  const ownHome = resolve(resolveTranslateHome());

  const candidates =
    raw !== undefined
      ? raw
          .split(':')
          .map((p) => p.trim())
          .filter(Boolean)
      : [
          join(homedir(), '.cursor', 'translate-proxy'),
          join(homedir(), '.claude', 'translate-proxy'),
        ];

  return candidates.map((p) => resolve(p)).filter((p) => p !== ownHome);
}

export interface SiblingCacheCopyOptions {
  projectSlug: string;
  sourcePath: string;
  projectRoot?: string;
  sourceSha256: string;
  targetCachePath: string;
}

export interface SiblingCacheCopyResult {
  siblingHome: string;
  siblingCachePath: string;
}

export async function copyFreshSiblingCache(
  options: SiblingCacheCopyOptions,
): Promise<SiblingCacheCopyResult | null> {
  for (const siblingHome of resolveSiblingTranslateHomes()) {
    const siblingCachePath = resolveCachePathUnderHome(
      siblingHome,
      options.projectSlug,
      options.sourcePath,
      options.projectRoot,
    );

    let raw: string;
    try {
      raw = await readFile(siblingCachePath, 'utf8');
    } catch {
      continue;
    }

    const parsed = parseDocCache(raw);
    if (!parsed || parsed.meta.sourceSha256 !== options.sourceSha256) {
      continue;
    }

    await mkdir(dirname(options.targetCachePath), { recursive: true });
    await writeFile(options.targetCachePath, raw, 'utf8');
    return { siblingHome, siblingCachePath };
  }

  return null;
}
