import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { after, before, describe, it } from 'node:test';

const OWN_HOME = mkdtempSync(join(tmpdir(), 'ct-sibling-own-'));
const SIBLING_HOME = mkdtempSync(join(tmpdir(), 'ct-sibling-other-'));
const PROJECT = mkdtempSync(join(tmpdir(), 'ct-sibling-project-'));

const savedEnv = {
  home: process.env.CURSOR_TRANSLATE_HOME,
  siblings: process.env.CURSOR_TRANSLATE_SIBLING_HOMES,
};

process.env.CURSOR_TRANSLATE_HOME = OWN_HOME;
process.env.CURSOR_TRANSLATE_SIBLING_HOMES = SIBLING_HOME;

const { resolveDocForRead } = await import('../packages/core/dist/cache/resolve-doc-for-read.js');
const { copyFreshSiblingCache, resolveSiblingTranslateHomes } = await import(
  '../packages/core/dist/cache/sibling-cache.js'
);

function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function seedSiblingCache(sourcePath, sourceBody, body) {
  const slug = basename(PROJECT);
  const cacheDir = join(SIBLING_HOME, 'cache', slug);
  mkdirSync(cacheDir, { recursive: true });
  const cachePath = join(cacheDir, `${basename(sourcePath).replace(/\.md$/, '')}.en.md`);
  writeFileSync(
    cachePath,
    `---\ncursor-translate-version: 1\ncursor-translate-source: ${sourcePath}\ncursor-translate-source-sha256: ${sha256Hex(sourceBody)}\ncursor-translate-generated-at: 2026-07-08T00:00:00.000Z\ncursor-translate-project: ${slug}\n---\n\n${body}\n`,
    'utf8',
  );
  return cachePath;
}

describe('sibling cache sharing', () => {
  before(() => {
    writeFileSync(join(OWN_HOME, 'config.yaml'), 'enabled: true\n', 'utf8');
  });

  after(() => {
    process.env.CURSOR_TRANSLATE_HOME = savedEnv.home ?? '';
    if (savedEnv.home === undefined) delete process.env.CURSOR_TRANSLATE_HOME;
    process.env.CURSOR_TRANSLATE_SIBLING_HOMES = savedEnv.siblings ?? '';
    if (savedEnv.siblings === undefined) delete process.env.CURSOR_TRANSLATE_SIBLING_HOMES;
  });

  it('copies a fresh sibling entry instead of translating', async () => {
    const sourceBody = `# Русская документация\n\n${'Текст, который уже переведён собратом. '.repeat(10)}`;
    const sourcePath = join(PROJECT, 'SHARED.md');
    writeFileSync(sourcePath, sourceBody, 'utf8');
    seedSiblingCache(sourcePath, sourceBody, '# Russian docs\n\nAlready translated by the sibling.');

    const result = await resolveDocForRead({ sourcePath, cwd: PROJECT });

    assert.equal(result.action, 'sibling_copy');
    assert.equal(result.readPath, result.cachePath);
    assert.ok(result.cachePath.startsWith(OWN_HOME), 'copy must land in own home');
    assert.ok(existsSync(result.cachePath));
    assert.match(readFileSync(result.cachePath, 'utf8'), /Already translated by the sibling/);
  });

  it('hits own cache on the second read', async () => {
    const sourcePath = join(PROJECT, 'SHARED.md');
    const result = await resolveDocForRead({ sourcePath, cwd: PROJECT });
    assert.equal(result.action, 'cache_hit');
  });

  it('ignores a stale sibling entry', async () => {
    const sourceBody = `# Другой документ\n\n${'Новая версия текста. '.repeat(10)}`;
    const sourcePath = join(PROJECT, 'STALE.md');
    writeFileSync(sourcePath, sourceBody, 'utf8');
    seedSiblingCache(sourcePath, 'какой-то старый текст источника', '# Old\n\nStale translation.');

    const copied = await copyFreshSiblingCache({
      projectSlug: basename(PROJECT),
      sourcePath,
      projectRoot: PROJECT,
      sourceSha256: sha256Hex(sourceBody),
      targetCachePath: join(OWN_HOME, 'cache', basename(PROJECT), 'STALE.en.md'),
    });

    assert.equal(copied, null);
  });

  it('empty CURSOR_TRANSLATE_SIBLING_HOMES disables sharing', () => {
    process.env.CURSOR_TRANSLATE_SIBLING_HOMES = '';
    assert.deepEqual(resolveSiblingTranslateHomes(), []);
    process.env.CURSOR_TRANSLATE_SIBLING_HOMES = SIBLING_HOME;
  });

  it('defaults to the cursor and claude homes minus its own', () => {
    delete process.env.CURSOR_TRANSLATE_SIBLING_HOMES;
    const homes = resolveSiblingTranslateHomes();
    assert.ok(homes.some((h) => h.includes('.claude')));
    assert.ok(homes.some((h) => h.includes('.cursor')));
    assert.ok(!homes.includes(OWN_HOME));
    process.env.CURSOR_TRANSLATE_SIBLING_HOMES = SIBLING_HOME;
  });
});
