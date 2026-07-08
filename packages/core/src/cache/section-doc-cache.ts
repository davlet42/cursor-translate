import { readFile, writeFile } from 'node:fs/promises';
import type { MarkdownSection } from '../markdown/split-markdown-sections.js';

export interface SectionSidecar {
  version: 2;
  sections: Record<string, string>;
}

export function resolveSectionSidecarPath(cachePath: string): string {
  return cachePath.replace(/\.en\.md$/i, '.en.sections.json');
}

export function assembleSectionTranslatedBody(
  sections: MarkdownSection[],
  translatedByKey: Map<string, string>,
): string {
  return sections.map((section) => translatedByKey.get(section.sectionKey) ?? '').join('');
}

export async function readSectionSidecar(cachePath: string): Promise<Map<string, string>> {
  const sidecarPath = resolveSectionSidecarPath(cachePath);
  try {
    const raw = await readFile(sidecarPath, 'utf8');
    const parsed = JSON.parse(raw) as SectionSidecar;
    if (parsed.version !== 2 || typeof parsed.sections !== 'object') {
      return new Map();
    }
    return new Map(Object.entries(parsed.sections));
  } catch {
    return new Map();
  }
}

export async function writeSectionSidecar(
  cachePath: string,
  sections: Record<string, string>,
): Promise<void> {
  const sidecarPath = resolveSectionSidecarPath(cachePath);
  const payload: SectionSidecar = {
    version: 2,
    sections,
  };
  await writeFile(sidecarPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}
