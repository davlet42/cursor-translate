import type { LoadedTranslateConfig } from '../config/load-translate-config.js';
import { countMarkdownTranslateChunks } from '../translate/count-markdown-translate-chunks.js';

export function exceedsLazyReadLimit(
  sourceRaw: string,
  config: Pick<LoadedTranslateConfig, 'lazyReadMaxChars' | 'lazyReadMaxChunks'>,
): boolean {
  if (config.lazyReadMaxChars > 0 && sourceRaw.length > config.lazyReadMaxChars) {
    return true;
  }
  if (config.lazyReadMaxChunks > 0 && countMarkdownTranslateChunks(sourceRaw) > config.lazyReadMaxChunks) {
    return true;
  }
  return false;
}
