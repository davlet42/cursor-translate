import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const {
  splitMarkdownSections,
  splitMarkdownBlocks,
  splitSectionIntoBlocks,
  splitForIncrementalCache,
  incrementalUnitNeedsTranslation,
} = await import('../packages/core/dist/index.js');

describe('block-level incremental split', () => {
  it('reconstructs section text exactly from blocks', () => {
    const source = [
      '# Title',
      '',
      'Intro paragraph.',
      '',
      '> [!note] Callout one',
      '> body line',
      '',
      '> [!note] Callout two',
      '> other',
      '',
      '## Section',
      '',
      '```ts',
      'const x = 1;',
      '',
      'const y = 2;',
      '```',
      '',
      'After fence.',
      '',
    ].join('\n');

    const blocks = splitMarkdownBlocks(source);
    assert.equal(blocks.map((b) => b.sourceText).join(''), source);

    const sections = splitMarkdownSections(source);
    for (const section of sections) {
      const parts = splitSectionIntoBlocks(section.sourceText);
      assert.equal(parts.join(''), section.sourceText);
    }
  });

  it('isolates Obsidian callouts so one edit invalidates one unit', () => {
    const base = [
      '# Doc',
      '',
      '> [!note] Rev A',
      '> old text',
      '',
      '> [!note] Rev B',
      '> keep',
      '',
      '## Body',
      '',
      'ok',
      '',
    ].join('\n');

    const edited = base.replace('old text', 'new text');
    const before = splitForIncrementalCache(base, 'block');
    const after = splitForIncrementalCache(edited, 'block');

    const beforeKeys = new Set(before.map((u) => u.sectionKey));
    const afterKeys = new Set(after.map((u) => u.sectionKey));
    const lost = [...beforeKeys].filter((k) => !afterKeys.has(k));
    const gained = [...afterKeys].filter((k) => !beforeKeys.has(k));

    assert.equal(lost.length, 1, `expected 1 lost key, got ${lost.length}`);
    assert.equal(gained.length, 1, `expected 1 gained key, got ${gained.length}`);
    assert.ok(
      before.length >= 4,
      `expected several block units in preamble+body, got ${before.length}`,
    );
  });

  it('section mode still keeps the whole preamble as one unit', () => {
    const source = [
      '# Doc',
      '',
      '> [!note] A',
      '> a',
      '',
      '> [!note] B',
      '> b',
      '',
      '## Body',
      '',
      'ok',
      '',
    ].join('\n');

    const sections = splitForIncrementalCache(source, 'section');
    assert.equal(sections.length, 2);
    assert.match(sections[0].sourceText, /\[!note\] A/);
    assert.match(sections[0].sourceText, /\[!note\] B/);
  });

  it('skips translation for units without Cyrillic', () => {
    assert.equal(incrementalUnitNeedsTranslation('```\ncode\n```\n'), false);
    assert.equal(incrementalUnitNeedsTranslation('\n\n'), false);
    assert.equal(incrementalUnitNeedsTranslation('> [!note] Ревизия\n> текст\n'), true);
  });

  it('Poieton roadmap preamble yields many small units under block mode', () => {
    const path =
      '/Users/davlet42/Projects/Obsidian Vault/Projects/Poieton/Poieton — n8n Factory Roadmap.md';
    let raw;
    try {
      raw = readFileSync(path, 'utf8');
    } catch {
      return; // optional fixture when vault path missing
    }

    const sectionUnits = splitForIncrementalCache(raw, 'section');
    const blockUnits = splitForIncrementalCache(raw, 'block');
    assert.equal(blockUnits.map((u) => u.sourceText).join(''), raw);
    assert.ok(blockUnits.length > sectionUnits.length * 2);
    assert.ok(
      blockUnits[0].sourceText.length < 5000,
      `first block still huge: ${blockUnits[0].sourceText.length}`,
    );

    const calloutUnits = blockUnits.filter((u) => u.sourceText.includes('[!note]'));
    assert.ok(calloutUnits.length >= 20, `expected many callout units, got ${calloutUnits.length}`);
  });
});
