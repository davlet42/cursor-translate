import type { DocCacheMeta } from './doc-cache-meta.interface.js';

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;

function parseFrontmatterValue(block: string, key: string): string | null {
  const match = block.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  if (!match) {
    return null;
  }
  return match[1].trim();
}

export function parseDocCache(raw: string): { meta: DocCacheMeta; body: string } | null {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) {
    return null;
  }

  const [, frontmatter, body] = match;
  const sourcePath = parseFrontmatterValue(frontmatter, 'cursor-translate-source');
  const sourceSha256 = parseFrontmatterValue(frontmatter, 'cursor-translate-source-sha256');
  const generatedAt = parseFrontmatterValue(frontmatter, 'cursor-translate-generated-at');
  const projectSlug = parseFrontmatterValue(frontmatter, 'cursor-translate-project');
  const incrementalRaw = parseFrontmatterValue(frontmatter, 'cursor-translate-incremental');
  const incremental =
    incrementalRaw === 'section' || incrementalRaw === 'block' || incrementalRaw === 'paragraph'
      ? incrementalRaw
      : undefined;
  const versionRaw = parseFrontmatterValue(frontmatter, 'cursor-translate-version');
  const cursorTranslateVersion = versionRaw ? Number(versionRaw) : 1;

  if (!sourcePath || !sourceSha256 || !generatedAt || !projectSlug) {
    return null;
  }

  return {
    meta: {
      cursorTranslateVersion: Number.isFinite(cursorTranslateVersion) ? cursorTranslateVersion : 1,
      sourcePath,
      sourceSha256,
      generatedAt,
      projectSlug,
      incremental,
    },
    body,
  };
}

export function formatDocCache(meta: DocCacheMeta, body: string): string {
  const incrementalLine = meta.incremental ? `cursor-translate-incremental: ${meta.incremental}\n` : '';
  return `---
cursor-translate-version: ${meta.cursorTranslateVersion}
cursor-translate-source: ${meta.sourcePath}
cursor-translate-source-sha256: ${meta.sourceSha256}
cursor-translate-generated-at: ${meta.generatedAt}
cursor-translate-project: ${meta.projectSlug}
${incrementalLine}---

${body.trimStart()}
`;
}
