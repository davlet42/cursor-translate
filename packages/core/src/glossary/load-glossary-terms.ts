import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveTranslateHome } from '../config/resolve-translate-home.js';

interface GlossaryFile {
  exact?: string[];
  patterns?: string[];
}

function parseSimpleYamlList(block: string, key: string): string[] {
  const lines = block.split('\n');
  const items: string[] = [];
  let inSection = false;

  for (const line of lines) {
    if (line.startsWith(`${key}:`)) {
      inSection = true;
      continue;
    }
    if (inSection && /^[a-zA-Z_]+:/.test(line)) {
      break;
    }
    if (inSection) {
      const item = line.match(/^\s*-\s+(.+)$/);
      if (item) {
        items.push(item[1].trim().replace(/^['"]|['"]$/g, ''));
      }
    }
  }

  return items;
}

export async function loadGlossaryTerms(projectRoot?: string): Promise<string[]> {
  const paths = [join(resolveTranslateHome(), 'glossary.yaml')];
  if (projectRoot) {
    paths.push(join(projectRoot, '.cursor', 'cursor-translate-glossary.yaml'));
  }

  const terms = new Set<string>();

  for (const path of paths) {
    try {
      const raw = await readFile(path, 'utf8');
      for (const term of parseSimpleYamlList(raw, 'exact')) {
        terms.add(term);
      }
    } catch {
      // optional glossary file
    }
  }

  return [...terms];
}
