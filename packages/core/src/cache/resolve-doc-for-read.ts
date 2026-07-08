import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { countCyrillicRatio } from '../detect/count-cyrillic-ratio.js';
import { sha256Hex } from '../hash/sha256-hex.js';
import { loadTranslateConfig } from '../config/load-translate-config.js';
import { resolveProjectSlug } from '../project/resolve-project-slug.js';
import { resolveProjectRoot } from '../project/resolve-project-root.js';
import { resolveGlobalCachePath } from './resolve-global-cache-path.js';
import { parseDocCache } from './parse-doc-cache.js';
import { logDocCacheServed } from '../metrics/log-doc-cache-metrics.js';
import { translateDocToGlobalCache } from './translate-doc-to-global-cache.js';
import { exceedsLazyReadLimit } from './exceeds-lazy-read-limit.js';
import { formatLazyDeferredHint } from './format-lazy-deferred-hint.js';
import { resolveCliBrand } from '../config/resolve-cli-brand.js';

export type ResolveDocAction =
  | 'passthrough'
  | 'skipped_no_cyrillic'
  | 'cache_hit'
  | 'sibling_copy'
  | 'translated'
  | 'cache_refreshed'
  | 'quota_exhausted'
  | 'lazy_deferred'
  | 'disabled';

export interface ResolveDocForReadOptions {
  sourcePath: string;
  cwd?: string;
  projectSlug?: string;
  minCyrillicRatio?: number;
  minChars?: number;
  force?: boolean;
  skipMetrics?: boolean;
  allowLazyTranslate?: boolean;
}

export interface ResolveDocForReadResult {
  sourcePath: string;
  readPath: string;
  cachePath: string | null;
  projectSlug: string;
  action: ResolveDocAction;
  sourceSha256: string;
  translateModel?: string;
  usedFallback?: boolean;
  userHint?: string;
}

function isMarkdownPath(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return ext === '.md' || ext === '.mdx';
}

function shouldTranslate(
  text: string,
  minCyrillicRatio: number,
  minChars: number,
): boolean {
  if (text.length < minChars) {
    return false;
  }
  return countCyrillicRatio(text) >= minCyrillicRatio;
}

async function readExistingCacheBody(cachePath: string): Promise<string | null> {
  try {
    const raw = await readFile(cachePath, 'utf8');
    return parseDocCache(raw)?.body ?? null;
  } catch {
    return null;
  }
}

async function maybeLogServed(
  input: ResolveDocForReadResult,
  sourceRaw: string,
  skipMetrics?: boolean,
): Promise<void> {
  if (skipMetrics || !input.cachePath || input.readPath === input.sourcePath) {
    return;
  }

  if (
    input.action !== 'cache_hit' &&
    input.action !== 'sibling_copy' &&
    input.action !== 'translated' &&
    input.action !== 'cache_refreshed'
  ) {
    return;
  }

  await logDocCacheServed({
    sourcePath: input.sourcePath,
    cachePath: input.cachePath,
    projectSlug: input.projectSlug,
    action: input.action,
    sourceRaw,
    translateModel: input.translateModel,
    usedFallback: input.usedFallback,
    trigger: 'lazy_read',
  });
}

export async function resolveDocForRead(
  options: ResolveDocForReadOptions,
): Promise<ResolveDocForReadResult> {
  const cwd = options.cwd ?? process.cwd();
  const config = await loadTranslateConfig();
  const sourcePath = resolve(cwd, options.sourcePath);
  const projectRoot = resolveProjectRoot(cwd, sourcePath);
  const projectSlug = resolveProjectSlug(cwd, options.projectSlug, sourcePath);
  const minCyrillicRatio = options.minCyrillicRatio ?? config.minCyrillicRatio;
  const minChars = options.minChars ?? config.minCharsToTranslate;

  if (!config.enabled) {
    const raw = await readFile(sourcePath, 'utf8');
    return {
      sourcePath,
      readPath: sourcePath,
      cachePath: null,
      projectSlug,
      action: 'disabled',
      sourceSha256: sha256Hex(raw),
    };
  }

  if (!isMarkdownPath(sourcePath)) {
    const raw = await readFile(sourcePath, 'utf8');
    return {
      sourcePath,
      readPath: sourcePath,
      cachePath: null,
      projectSlug,
      action: 'passthrough',
      sourceSha256: sha256Hex(raw),
    };
  }

  const sourceRaw = await readFile(sourcePath, 'utf8');
  const sourceSha256 = sha256Hex(sourceRaw);

  if (!shouldTranslate(sourceRaw, minCyrillicRatio, minChars)) {
    return {
      sourcePath,
      readPath: sourcePath,
      cachePath: null,
      projectSlug,
      action: 'skipped_no_cyrillic',
      sourceSha256,
    };
  }

  const cachePath = resolveGlobalCachePath(projectSlug, sourcePath, projectRoot);

  const allowLazyTranslate = options.allowLazyTranslate ?? true;
  if (
    allowLazyTranslate &&
    !options.force &&
    exceedsLazyReadLimit(sourceRaw, config)
  ) {
    let cacheFresh = false;
    if (!options.force) {
      try {
        const cached = await readFile(cachePath, 'utf8');
        const parsed = parseDocCache(cached);
        cacheFresh = Boolean(parsed && parsed.meta.sourceSha256 === sourceSha256);
      } catch {
        cacheFresh = false;
      }
    }

    if (!cacheFresh) {
      const userHint = config.lazyReadHints
        ? formatLazyDeferredHint(sourcePath, sourceRaw, resolveCliBrand())
        : undefined;
      return {
        sourcePath,
        readPath: sourcePath,
        cachePath,
        projectSlug,
        action: 'lazy_deferred',
        sourceSha256,
        userHint,
      };
    }
  }

  if (!options.force) {
    try {
      const cached = await readFile(cachePath, 'utf8');
      const parsed = parseDocCache(cached);
      if (parsed && parsed.meta.sourceSha256 === sourceSha256) {
        const result: ResolveDocForReadResult = {
          sourcePath,
          readPath: cachePath,
          cachePath,
          projectSlug,
          action: 'cache_hit',
          sourceSha256,
        };
        await maybeLogServed(result, sourceRaw, options.skipMetrics);
        return result;
      }
    } catch {
      // cache missing or unreadable — translate below
    }
  }

  const hadCache = Boolean(await readExistingCacheBody(cachePath));
  const translateResult = await translateDocToGlobalCache({
    sourcePath,
    cwd,
    projectSlug,
    force: options.force,
    metricsTrigger: 'lazy_read',
    skipMetrics: options.skipMetrics,
  });

  if (translateResult.reason === 'quota_exhausted') {
    if (hadCache) {
      const result: ResolveDocForReadResult = {
        sourcePath,
        readPath: cachePath,
        cachePath,
        projectSlug,
        action: 'cache_hit',
        sourceSha256,
        translateModel: translateResult.translateModel,
        usedFallback: translateResult.usedFallback,
      };
      await maybeLogServed(result, sourceRaw, options.skipMetrics);
      return result;
    }

    return {
      sourcePath,
      readPath: sourcePath,
      cachePath,
      projectSlug,
      action: 'quota_exhausted',
      sourceSha256,
      translateModel: translateResult.translateModel,
      usedFallback: translateResult.usedFallback,
    };
  }

  if (translateResult.skipped && translateResult.reason === 'up_to_date') {
    const result: ResolveDocForReadResult = {
      sourcePath,
      readPath: cachePath,
      cachePath,
      projectSlug,
      action: 'cache_hit',
      sourceSha256,
      translateModel: translateResult.translateModel,
    };
    await maybeLogServed(result, sourceRaw, options.skipMetrics);
    return result;
  }

  if (translateResult.skipped && translateResult.reason === 'sibling_copy') {
    const result: ResolveDocForReadResult = {
      sourcePath,
      readPath: cachePath,
      cachePath,
      projectSlug,
      action: 'sibling_copy',
      sourceSha256,
      translateModel: translateResult.translateModel,
    };
    await maybeLogServed(result, sourceRaw, options.skipMetrics);
    return result;
  }

  const result: ResolveDocForReadResult = {
    sourcePath,
    readPath: cachePath,
    cachePath,
    projectSlug,
    action: hadCache ? 'cache_refreshed' : 'translated',
    sourceSha256,
    translateModel: translateResult.translateModel,
    usedFallback: translateResult.usedFallback,
  };
  await maybeLogServed(result, sourceRaw, options.skipMetrics);
  return result;
}
