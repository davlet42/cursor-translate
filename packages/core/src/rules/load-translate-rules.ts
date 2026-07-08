import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveTranslateHome } from '../config/resolve-translate-home.js';
import { parseMarkdownSection } from './parse-markdown-section.js';

const SECTION_TITLES = ['cursor-translate', 'claude-translate'] as const;

const DEDICATED_FILE_SUFFIXES = [
  'cursor-translate.md',
  'cursor-translate-rules.md',
  'claude-translate.md',
  'claude-translate-rules.md',
] as const;

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
  for (const title of SECTION_TITLES) {
    const section = parseMarkdownSection(raw, title);
    if (section) {
      return section;
    }
  }
  return null;
}

function isDedicatedRulesFile(path: string): boolean {
  return DEDICATED_FILE_SUFFIXES.some((suffix) => path.endsWith(suffix));
}

export async function loadTranslateRules(projectRoot?: string): Promise<string | null> {
  const candidates: string[] = [
    join(resolveTranslateHome(), 'cursor-translate-rules.md'),
    join(resolveTranslateHome(), 'claude-translate-rules.md'),
  ];

  if (projectRoot) {
    candidates.push(
      join(projectRoot, '.cursor', 'cursor-translate.md'),
      join(projectRoot, '.claude', 'claude-translate.md'),
      join(projectRoot, 'CURSOR.md'),
      join(projectRoot, 'CLAUDE.md'),
      join(projectRoot, 'AGENTS.md'),
    );
  }

  for (const path of candidates) {
    if (isDedicatedRulesFile(path)) {
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
