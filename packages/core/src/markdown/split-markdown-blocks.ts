import { sha256Hex } from '../hash/sha256-hex.js';
import type { MarkdownSection } from './split-markdown-sections.js';
import { splitMarkdownSections } from './split-markdown-sections.js';

export interface SplitMarkdownBlocksOptions {
  /** Keep Obsidian callouts / blockquotes as one unit (default true). */
  isolateCallouts?: boolean;
}

function splitKeepingLineEnds(text: string): string[] {
  if (text.length === 0) {
    return [];
  }
  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') {
      parts.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < text.length) {
    parts.push(text.slice(start));
  }
  return parts;
}

function isFenceLine(line: string): boolean {
  return /^[ \t]{0,3}```/.test(line);
}

function isQuoteLine(line: string): boolean {
  return /^[ \t]{0,3}>/.test(line);
}

function isBlankLine(line: string): boolean {
  return /^[ \t]*\r?\n$/.test(line) || /^[ \t]*$/.test(line);
}

/**
 * Split one ##/### section body into cache units: fenced code, callout/blockquote
 * runs, and blank-line paragraphs. Join of parts === input (exact).
 */
export function splitSectionIntoBlocks(
  text: string,
  options: SplitMarkdownBlocksOptions = {},
): string[] {
  if (!text) {
    return [];
  }
  const isolateCallouts = options.isolateCallouts !== false;
  const lines = splitKeepingLineEnds(text);
  const blocks: string[] = [];
  let buf: string[] = [];
  let mode: 'normal' | 'fence' | 'quote' = 'normal';

  const flush = (): void => {
    if (buf.length === 0) {
      return;
    }
    blocks.push(buf.join(''));
    buf = [];
  };

  const absorbTrailingBlanks = (fromIndex: number): number => {
    let i = fromIndex;
    while (i < lines.length && isBlankLine(lines[i]!)) {
      buf.push(lines[i]!);
      i += 1;
    }
    return i;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;

    if (mode === 'fence') {
      buf.push(line);
      if (isFenceLine(line) && buf.length > 1) {
        i += 1;
        i = absorbTrailingBlanks(i);
        flush();
        mode = 'normal';
        continue;
      }
      i += 1;
      continue;
    }

    if (mode === 'quote') {
      if (isQuoteLine(line)) {
        buf.push(line);
        i += 1;
        continue;
      }
      i = absorbTrailingBlanks(i);
      flush();
      mode = 'normal';
      continue;
    }

    if (isFenceLine(line)) {
      flush();
      mode = 'fence';
      buf.push(line);
      i += 1;
      continue;
    }

    if (isolateCallouts && isQuoteLine(line)) {
      flush();
      mode = 'quote';
      buf.push(line);
      i += 1;
      continue;
    }

    if (isBlankLine(line)) {
      buf.push(line);
      flush();
      i += 1;
      continue;
    }

    buf.push(line);
    i += 1;
  }
  flush();
  return blocks;
}

/**
 * ##/### sections, then each section into callout/paragraph/fence blocks.
 * Content-addressed keys — unchanged neighbors stay cached across edits.
 */
export function splitMarkdownBlocks(
  text: string,
  options: SplitMarkdownBlocksOptions = {},
): MarkdownSection[] {
  const sections = splitMarkdownSections(text);
  const out: MarkdownSection[] = [];
  for (const section of sections) {
    const parts = splitSectionIntoBlocks(section.sourceText, options);
    for (const part of parts) {
      out.push({
        sectionKey: sha256Hex(part),
        sourceText: part,
      });
    }
  }
  return out;
}
