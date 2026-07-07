import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveTranslateHome } from '../config/resolve-translate-home.js';
import { parseMarkdownSection } from './parse-markdown-section.js';

const SECTION_TITLE = 'cursor-translate';

async function readOptionalFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

async function rulesFromMarkdownFile(path: string): Promise<string | null> {
  const raw = await readOptionalFile(path);
  if (!raw) {
    return null;
  }
  return parseMarkdownSection(raw, SECTION_TITLE);
}

export async function loadTranslateRules(projectRoot?: string): Promise<string | null> {
  const candidates: string[] = [
    join(resolveTranslateHome(), 'cursor-translate-rules.md'),
  ];

  if (projectRoot) {
    candidates.push(
      join(projectRoot, '.cursor', 'cursor-translate.md'),
      join(projectRoot, 'CURSOR.md'),
      join(projectRoot, 'AGENTS.md'),
    );
  }

  for (const path of candidates) {
    if (path.endsWith('cursor-translate.md') || path.endsWith('cursor-translate-rules.md')) {
      const dedicated = await readOptionalFile(path);
      if (dedicated?.trim()) {
        return dedicated.trim();
      }
      continue;
    }

    const section = await rulesFromMarkdownFile(path);
    if (section) {
      return section;
    }
  }

  return null;
}
