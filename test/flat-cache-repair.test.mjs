import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const { repairFlatCacheFromSections, writeFlatDocCacheAtomic } = await import(
  '../packages/core/dist/cache/repair-flat-cache-from-sections.js'
);
const { writeSectionSidecar } = await import('../packages/core/dist/cache/section-doc-cache.js');
const { splitMarkdownSections } = await import('../packages/core/dist/markdown/split-markdown-sections.js');
const { sha256Hex } = await import('../packages/core/dist/hash/sha256-hex.js');

describe('repairFlatCacheFromSections', () => {
  it('rebuilds a missing flat .en.md from a complete section sidecar', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ct-repair-flat-'));
    const cachePath = join(dir, 'DOC.en.md');
    const source = ['## A', '', 'русский A', '', '### B', '', 'русский B'].join('\n');
    const sourceSha256 = sha256Hex(source);
    const sections = splitMarkdownSections(source);
    const sectionEntries = Object.fromEntries(
      sections.map((section) => [
        section.sectionKey,
        section.sourceText.replace(/русский/g, 'english'),
      ]),
    );

    await writeSectionSidecar(cachePath, sectionEntries);

    const repaired = await repairFlatCacheFromSections(cachePath, source, {
      cursorTranslateVersion: 2,
      sourcePath: '/project/DOC.md',
      sourceSha256,
      generatedAt: '2026-07-08T00:00:00.000Z',
      projectSlug: 'demo',
      incremental: 'section',
    });

    assert.equal(repaired, true);
    assert.ok(existsSync(cachePath));
    const raw = await readFile(cachePath, 'utf8');
    assert.match(raw, /english A/);
    assert.match(raw, /english B/);
  });

  it('writes flat cache atomically', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ct-repair-atomic-'));
    const cachePath = join(dir, 'ATOMIC.en.md');
    await writeFlatDocCacheAtomic(cachePath, '---\nkey: value\n---\n\nbody\n');
    assert.ok(existsSync(cachePath));
    assert.equal(await readFile(cachePath, 'utf8'), '---\nkey: value\n---\n\nbody\n');
    for (const file of ['ATOMIC.en.md.tmp']) {
      const tmp = join(dir, file);
      if (existsSync(tmp)) {
        unlinkSync(tmp);
      }
    }
  });
});
