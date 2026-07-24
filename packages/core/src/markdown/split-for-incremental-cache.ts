import type { MarkdownSection } from './split-markdown-sections.js';
import { splitMarkdownSections } from './split-markdown-sections.js';
import { splitMarkdownBlocks } from './split-markdown-blocks.js';

/** Doc-cache incremental granularity (`cache.incremental` in config.yaml). */
export type CacheIncrementalMode = 'off' | 'section' | 'block' | 'paragraph';

export type ActiveCacheIncrementalMode = Exclude<CacheIncrementalMode, 'off'>;

export function parseCacheIncrementalMode(
  raw: string | null | undefined,
  fallback: CacheIncrementalMode = 'block',
): CacheIncrementalMode {
  if (raw === 'off' || raw === 'section' || raw === 'block' || raw === 'paragraph') {
    return raw;
  }
  return fallback;
}

export function isActiveCacheIncrementalMode(
  mode: CacheIncrementalMode,
): mode is ActiveCacheIncrementalMode {
  return mode === 'section' || mode === 'block' || mode === 'paragraph';
}

/**
 * Split source markdown into content-addressed cache units for the given mode.
 * - section: ## / ### only
 * - block: ## / ### then callouts / fences / blank-line paragraphs (default)
 * - paragraph: ## / ### then fences / blank-line paragraphs (callouts not special-cased)
 */
export function splitForIncrementalCache(
  text: string,
  mode: ActiveCacheIncrementalMode,
): MarkdownSection[] {
  switch (mode) {
    case 'section':
      return splitMarkdownSections(text);
    case 'paragraph':
      return splitMarkdownBlocks(text, { isolateCallouts: false });
    case 'block':
      return splitMarkdownBlocks(text, { isolateCallouts: true });
  }
}

/** True when the unit has Cyrillic and must go through the translator. */
export function incrementalUnitNeedsTranslation(text: string): boolean {
  return /[А-Яа-яЁё]/.test(text);
}
