import { DEFAULT_MARKDOWN_TRANSLATE_CHUNK_CHARS } from '../constants/default-lazy-read-limits.constant.js';
import { splitMarkdownChunks } from './split-markdown-chunks.js';

export function countMarkdownTranslateChunks(
  text: string,
  maxChunkChars = DEFAULT_MARKDOWN_TRANSLATE_CHUNK_CHARS,
): number {
  return splitMarkdownChunks(text, maxChunkChars).filter((chunk) => chunk.trim().length > 0).length;
}
