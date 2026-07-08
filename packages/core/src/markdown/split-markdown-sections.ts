import { sha256Hex } from '../hash/sha256-hex.js';

export interface MarkdownSection {
  sectionKey: string;
  sourceText: string;
}

const SECTION_BOUNDARY_RE = /(?=^#{2,3} )/m;

export function splitMarkdownSections(text: string): MarkdownSection[] {
  const parts = text.split(SECTION_BOUNDARY_RE).filter((part) => part.length > 0);
  return parts.map((sourceText) => ({
    sectionKey: sha256Hex(sourceText),
    sourceText,
  }));
}
