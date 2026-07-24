import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { after, before, describe, it } from 'node:test';

const HOME = mkdtempSync(join(tmpdir(), 'ct-lazy-deferred-'));
const PROJECT = mkdtempSync(join(tmpdir(), 'ct-lazy-project-'));

const savedHome = process.env.CURSOR_TRANSLATE_HOME;

process.env.CURSOR_TRANSLATE_HOME = HOME;

const { resolveDocForRead } = await import('../packages/core/dist/cache/resolve-doc-for-read.js');

function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function writeConfig(yaml) {
  writeFileSync(join(HOME, 'config.yaml'), yaml, 'utf8');
}

function seedOwnCache(sourcePath, sourceBody, translatedBody) {
  const slug = basename(PROJECT);
  const cacheDir = join(HOME, 'cache', slug);
  mkdirSync(cacheDir, { recursive: true });
  const cachePath = join(cacheDir, `${basename(sourcePath).replace(/\.md$/, '')}.en.md`);
  writeFileSync(
    cachePath,
    `---\ncursor-translate-version: 1\ncursor-translate-source: ${sourcePath}\ncursor-translate-source-sha256: ${sha256Hex(sourceBody)}\ncursor-translate-generated-at: 2026-07-08T00:00:00.000Z\ncursor-translate-project: ${slug}\n---\n\n${translatedBody}\n`,
    'utf8',
  );
  return cachePath;
}

describe('lazy read deferral', () => {
  before(() => {
    mkdirSync(HOME, { recursive: true });
    writeConfig(`enabled: true
cache:
  lazy_read_max_chars: 50000
  lazy_read_max_chunks: 3
  lazy_read_hints: true
`);
  });

  after(() => {
    if (savedHome === undefined) {
      delete process.env.CURSOR_TRANSLATE_HOME;
    } else {
      process.env.CURSOR_TRANSLATE_HOME = savedHome;
    }
  });

  it('defers lazy translate for a large cold file and returns a savings hint', async () => {
    const body = `# Большой документ\n\n${'Раздел с кириллицей для перевода. '.repeat(4000)}`;
    assert.ok(body.length > 50_000, 'fixture must exceed lazy_read_max_chars');
    const sourcePath = join(PROJECT, 'BIG.md');
    writeFileSync(sourcePath, body, 'utf8');

    const result = await resolveDocForRead({ sourcePath, cwd: PROJECT });

    assert.equal(result.action, 'lazy_deferred');
    assert.equal(result.readPath, sourcePath);
    assert.match(result.userHint ?? '', /lazy translate skipped/i);
    assert.match(result.userHint ?? '', /main-agent tokens per read/i);
  });

  it('still serves a warm cache hit for a large file', async () => {
    const body = `# Большой документ\n\n${'Раздел с кириллицей для перевода. '.repeat(4000)}`;
    const sourcePath = join(PROJECT, 'BIG-WARM.md');
    writeFileSync(sourcePath, body, 'utf8');
    seedOwnCache(sourcePath, body, '# Big document\n\nEnglish cache body.');

    const result = await resolveDocForRead({ sourcePath, cwd: PROJECT });
    assert.equal(result.action, 'cache_hit');
    assert.notEqual(result.readPath, sourcePath);
    assert.ok(existsSync(result.readPath));
    assert.match(readFileSync(result.readPath, 'utf8'), /English cache body/);
  });

  it('serves Russian for a stale large file instead of the old cache', async () => {
    const original = `# Старый документ\n\n${'Исходный текст для кэша. '.repeat(4000)}`;
    const sourcePath = join(PROJECT, 'BIG-STALE.md');
    writeFileSync(sourcePath, original, 'utf8');
    seedOwnCache(sourcePath, original, '# Old\n\nStale English cache.');

    writeFileSync(sourcePath, `${original}\n\nНовый параграф.`, 'utf8');
    const stale = await resolveDocForRead({ sourcePath, cwd: PROJECT });

    assert.equal(stale.action, 'lazy_deferred');
    assert.equal(stale.readPath, sourcePath);
  });

  it('defers mid-size docs with many incremental Cyrillic blocks (not size-chunk count)', async () => {
    writeConfig(`enabled: true
cache:
  incremental: block
  lazy_read_max_chars: 50000
  lazy_read_max_chunks: 3
  lazy_read_hints: true
`);
    // Under max_chars and under old size-based chunk count (=1 for ~12k), but >3 block units.
    const paras = Array.from({ length: 12 }, (_, i) => `Абзац номер ${i + 1} с кириллицей для перевода.`).join('\n\n');
    const body = `# Политика моделей\n\n${paras}\n`;
    assert.ok(body.length < 50_000);
    const sourcePath = join(PROJECT, 'MID-BLOCKS.md');
    writeFileSync(sourcePath, body, 'utf8');

    const result = await resolveDocForRead({ sourcePath, cwd: PROJECT });
    assert.equal(result.action, 'lazy_deferred');
    assert.equal(result.readPath, sourcePath);
  });

});
