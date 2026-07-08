import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const { splitMarkdownSections } = await import('../packages/core/dist/markdown/split-markdown-sections.js');
const {
  assembleSectionTranslatedBody,
  readSectionSidecar,
  writeSectionSidecar,
  resolveSectionSidecarPath,
} = await import('../packages/core/dist/cache/section-doc-cache.js');

describe('section-level doc cache', () => {
  it('splits on level-2 and level-3 headings', () => {
    const source = [
      '# Title',
      '',
      'Вступление.',
      '',
      '## Раздел A',
      '',
      'Текст A.',
      '',
      '### Подраздел A1',
      '',
      'Текст A1.',
      '',
      '## Раздел B',
      '',
      'Текст B.',
    ].join('\n');

    const sections = splitMarkdownSections(source);
    assert.equal(sections.length, 4);
    assert.match(sections[0].sourceText, /^# Title/);
    assert.match(sections[1].sourceText, /^## Раздел A/);
    assert.match(sections[2].sourceText, /^### Подраздел A1/);
    assert.match(sections[3].sourceText, /^## Раздел B/);
  });

  it('round-trips section sidecar storage', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ct-section-sidecar-'));
    const cachePath = join(dir, 'DOC.en.md');
    await writeFile(cachePath, 'placeholder', 'utf8');

    await writeSectionSidecar(cachePath, {
      abc: 'English A',
      def: 'English B',
    });

    const map = await readSectionSidecar(cachePath);
    assert.equal(map.get('abc'), 'English A');
    assert.equal(map.get('def'), 'English B');
    assert.ok(resolveSectionSidecarPath(cachePath).endsWith('.en.sections.json'));
  });

  it('assembles translated sections in source order', () => {
    const sections = splitMarkdownSections('## A\n\nru\n\n### B\n\nmore');
    const translated = new Map([
      [sections[0].sectionKey, '## A\n\nen'],
      [sections[1].sectionKey, '### B\n\nen-more'],
    ]);
    const body = assembleSectionTranslatedBody(sections, translated);
    assert.match(body, /^## A/);
    assert.match(body, /### B/);
  });
});
