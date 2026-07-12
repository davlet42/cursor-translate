import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { resolveTranslateHome } from '../config/resolve-translate-home.js';
import { appendMetricsEntry } from '../metrics/append-metrics-entry.js';
import { parseDocCache } from './parse-doc-cache.js';

// Orphan GC. Cache invalidation is sha-based only, so the cache of a deleted
// or renamed doc would otherwise live forever. Removal is NOT immediate: a git
// branch switch makes sources vanish temporarily, and eagerly dropping the
// cache would re-bill a translation on the way back. An orphan is removed only
// after its source has been continuously missing for `graceDays`; first-seen
// markers live in cache/.gc-state.json.
const GC_STATE_FILE = '.gc-state.json';
const GC_STAMP_FILE = '.gc-last-run';
const GC_AUTO_INTERVAL_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_GC_ORPHAN_DAYS = 30;

type GcState = Record<string, string>; // cache path relative to cacheRoot → first-seen-missing ISO

export interface GcOrphanedCachesOptions {
  /** Cache root to scan; defaults to `<translate home>/cache`. */
  cacheRoot?: string;
  /** Days a source must stay missing before its cache is removed. ≤0 disables GC. */
  graceDays?: number;
  /** Report without touching the disk (no removals, no state updates). */
  dryRun?: boolean;
  /** Clock override for tests. */
  now?: Date;
}

export interface GcOrphanedCachesResult {
  disabled: boolean;
  scanned: number;
  orphans: number;
  marked: number;
  keptInGrace: number;
  removed: string[];
}

function statePath(cacheRoot: string): string {
  return join(cacheRoot, GC_STATE_FILE);
}

async function readState(cacheRoot: string): Promise<GcState> {
  try {
    const parsed = JSON.parse(await readFile(statePath(cacheRoot), 'utf8')) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as GcState;
    }
  } catch {
    // missing or corrupt state — start fresh
  }
  return {};
}

async function sourceExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function gcOrphanedCaches(
  options: GcOrphanedCachesOptions = {},
): Promise<GcOrphanedCachesResult> {
  const graceDays = options.graceDays ?? DEFAULT_GC_ORPHAN_DAYS;
  const result: GcOrphanedCachesResult = {
    disabled: graceDays <= 0,
    scanned: 0,
    orphans: 0,
    marked: 0,
    keptInGrace: 0,
    removed: [],
  };
  if (result.disabled) {
    return result;
  }

  const cacheRoot = options.cacheRoot ?? join(resolveTranslateHome(), 'cache');
  const now = options.now ?? new Date();
  const graceMs = graceDays * 24 * 60 * 60 * 1000;

  let projectDirs: string[];
  try {
    const entries = await readdir(cacheRoot, { withFileTypes: true });
    projectDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return result; // no cache dir yet — nothing to collect
  }

  const state = await readState(cacheRoot);
  const nextState: GcState = {};
  let stateChanged = false;

  for (const dir of projectDirs) {
    let files: string[];
    try {
      files = await readdir(join(cacheRoot, dir));
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.endsWith('.en.md')) {
        continue;
      }
      result.scanned += 1;

      const rel = `${dir}/${file}`;
      const flatPath = join(cacheRoot, dir, file);

      let sourcePath: string | null = null;
      try {
        sourcePath = parseDocCache(await readFile(flatPath, 'utf8'))?.meta.sourcePath ?? null;
      } catch {
        // unreadable entry — leave it alone
      }
      if (!sourcePath) {
        continue; // no recognizable frontmatter — too risky to touch
      }

      if (await sourceExists(sourcePath)) {
        if (state[rel]) {
          stateChanged = true; // source came back — drop the orphan marker
        }
        continue;
      }

      result.orphans += 1;
      const firstSeen = state[rel];
      if (!firstSeen) {
        result.marked += 1;
        nextState[rel] = now.toISOString();
        stateChanged = true;
        result.keptInGrace += 1;
        continue;
      }

      const missingMs = now.getTime() - Date.parse(firstSeen);
      if (Number.isFinite(missingMs) && missingMs >= graceMs) {
        result.removed.push(rel);
        if (!options.dryRun) {
          await rm(flatPath, { force: true });
          await rm(flatPath.replace(/\.md$/, '.sections.json'), { force: true });
        }
        stateChanged = true;
      } else {
        nextState[rel] = firstSeen;
        result.keptInGrace += 1;
      }
    }
  }

  // Entries pointing at caches that no longer exist fall out of nextState
  // automatically (they were never re-added above).
  if (Object.keys(state).length !== Object.keys(nextState).length) {
    stateChanged = true;
  }

  if (!options.dryRun) {
    if (stateChanged) {
      try {
        await mkdir(cacheRoot, { recursive: true });
        await writeFile(statePath(cacheRoot), `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');
      } catch {
        // state is an optimization; never fail GC over it
      }
    }
    if (result.removed.length > 0 || result.marked > 0) {
      try {
        await appendMetricsEntry({
          source: 'cache_gc',
          reason: 'orphan_scan',
          action: `removed:${result.removed.length} marked:${result.marked} grace:${result.keptInGrace} scanned:${result.scanned}`,
          ru_tokens_est: 0,
          en_tokens_est: 0,
          saved_tokens_est: 0,
        });
      } catch {
        // metrics must never break GC
      }
    }
  }

  return result;
}

// Throttled entry point for the translate path: at most one scan per day,
// stamped before running so concurrent translations do not stampede.
export async function maybeGcOrphanedCaches(graceDays?: number): Promise<void> {
  try {
    const effective = graceDays ?? DEFAULT_GC_ORPHAN_DAYS;
    if (effective <= 0) {
      return;
    }
    const stampPath = join(resolveTranslateHome(), 'cache', GC_STAMP_FILE);
    let last = 0;
    try {
      last = Number((await readFile(stampPath, 'utf8')).trim()) || 0;
    } catch {
      // no stamp yet
    }
    if (Date.now() - last < GC_AUTO_INTERVAL_MS) {
      return;
    }
    await mkdir(dirname(stampPath), { recursive: true });
    await writeFile(stampPath, String(Date.now()), 'utf8');
    await gcOrphanedCaches({ graceDays: effective });
  } catch {
    // GC must never break the translate path
  }
}
