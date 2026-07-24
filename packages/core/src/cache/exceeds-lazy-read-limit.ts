import type { LoadedTranslateConfig } from '../config/load-translate-config.js';
import { countMarkdownTranslateChunks } from '../translate/count-markdown-translate-chunks.js';
import {
  incrementalUnitNeedsTranslation,
  isActiveCacheIncrementalMode,
  splitForIncrementalCache,
  type CacheIncrementalMode,
} from '../markdown/split-for-incremental-cache.js';

export type LazyReadLimitConfig = Pick<
  LoadedTranslateConfig,
  'lazyReadMaxChars' | 'lazyReadMaxChunks' | 'cacheIncremental'
>;

/**
 * How many translator calls a cold lazy-read would make.
 * With incremental cache modes, count Cyrillic units (blocks/sections) — NOT
 * size-based API chunks. A ~12k doc can be 1 API chunk but 60+ block units;
 * counting the wrong thing let Read block for minutes on vault roadmaps.
 */
export function countLazyReadTranslateUnits(
  sourceRaw: string,
  cacheIncremental: CacheIncrementalMode,
): number {
  if (isActiveCacheIncrementalMode(cacheIncremental)) {
    return splitForIncrementalCache(sourceRaw, cacheIncremental).filter((unit) =>
      incrementalUnitNeedsTranslation(unit.sourceText),
    ).length;
  }
  return countMarkdownTranslateChunks(sourceRaw);
}

export function exceedsLazyReadLimit(
  sourceRaw: string,
  config: LazyReadLimitConfig,
): boolean {
  if (config.lazyReadMaxChars > 0 && sourceRaw.length > config.lazyReadMaxChars) {
    return true;
  }
  if (config.lazyReadMaxChunks > 0) {
    const units = countLazyReadTranslateUnits(sourceRaw, config.cacheIncremental);
    if (units > config.lazyReadMaxChunks) {
      return true;
    }
  }
  return false;
}
