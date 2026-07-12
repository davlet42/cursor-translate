import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const HOME = mkdtempSync(join(tmpdir(), 'cursor-translate-gc-home-'));
process.env.CURSOR_TRANSLATE_HOME = HOME;

const { gcOrphanedCaches } = await import('../packages/core/dist/cache/gc-orphaned-caches.js');

const CACHE = join(HOME, 'cache');
const SOURCES = mkdtempSync(join(tmpdir(), 'cursor-translate-gc-src-'));

function seedCache(slug, name, sourcePath) {
  mkdirSync(join(CACHE, slug), { recursive: true });
  const flat = join(CACHE, slug, `${name}.en.md`);
  writeFileSync(
    flat,
    `---\ncursor-translate-version: 2\ncursor-translate-source: ${sourcePath}\ncursor-translate-source-sha256: abc\ncursor-translate-generated-at: 2026-07-01T00:00:00.000Z\ncursor-translate-project: ${slug}\n---\n\nEnglish body.\n`,
    'utf8',
  );
  writeFileSync(join(CACHE, slug, `${name}.en.sections.json`), '{"sections":[]}', 'utf8');
  return flat;
}

const DAY = 24 * 60 * 60 * 1000;

describe('gcOrphanedCaches', () => {
  it('keeps live caches, marks fresh orphans, and removes them only after the grace period', async () => {
    const liveSource = join(SOURCES, 'live.md');
    writeFileSync(liveSource, '# живой док', 'utf8');
    const liveFlat = seedCache('proj', 'live', liveSource);
    const goneFlat = seedCache('proj', 'gone', join(SOURCES, 'deleted.md'));

    const t0 = new Date('2026-07-12T00:00:00.000Z');
    const first = await gcOrphanedCaches({ graceDays: 30, now: t0 });
    assert.equal(first.scanned, 2);
    assert.equal(first.orphans, 1);
    assert.equal(first.marked, 1);
    assert.deepEqual(first.removed, []);
    assert.ok(existsSync(goneFlat), 'orphan must survive the grace period');

    const withinGrace = await gcOrphanedCaches({ graceDays: 30, now: new Date(t0.getTime() + 29 * DAY) });
    assert.deepEqual(withinGrace.removed, []);
    assert.equal(withinGrace.keptInGrace, 1);

    const afterGrace = await gcOrphanedCaches({ graceDays: 30, now: new Date(t0.getTime() + 31 * DAY) });
    assert.deepEqual(afterGrace.removed, ['proj/gone.en.md']);
    assert.ok(!existsSync(goneFlat), 'flat cache must be removed');
    assert.ok(!existsSync(goneFlat.replace(/\.md$/, '.sections.json')), 'sidecar must be removed');
    assert.ok(existsSync(liveFlat), 'live cache must stay');
  });

  it('drops the orphan marker when the source comes back (branch switch)', async () => {
    const source = join(SOURCES, 'branchy.md');
    seedCache('proj', 'branchy', source);

    const t0 = new Date('2026-07-12T00:00:00.000Z');
    await gcOrphanedCaches({ graceDays: 30, now: t0 }); // marks orphan (source absent)
    writeFileSync(source, '# вернулся из ветки', 'utf8'); // source reappears
    await gcOrphanedCaches({ graceDays: 30, now: new Date(t0.getTime() + 1 * DAY) });

    const state = JSON.parse(readFileSync(join(CACHE, '.gc-state.json'), 'utf8'));
    assert.ok(!('proj/branchy.en.md' in state), 'marker must be dropped when the source returns');

    // even long after t0, a re-vanished source restarts the grace period
    rmSync(source);
    const late = await gcOrphanedCaches({ graceDays: 30, now: new Date(t0.getTime() + 60 * DAY) });
    assert.deepEqual(late.removed, [], 'grace must restart from the second disappearance');
  });

  it('dry-run reports without touching disk or state', async () => {
    const flat = seedCache('proj2', 'doomed', join(SOURCES, 'never.md'));
    const t0 = new Date('2026-07-12T00:00:00.000Z');
    await gcOrphanedCaches({ graceDays: 30, now: t0 });

    const dry = await gcOrphanedCaches({
      graceDays: 30,
      now: new Date(t0.getTime() + 40 * DAY),
      dryRun: true,
    });
    assert.deepEqual(dry.removed, ['proj2/doomed.en.md']);
    assert.ok(existsSync(flat), 'dry-run must not delete');

    const real = await gcOrphanedCaches({ graceDays: 30, now: new Date(t0.getTime() + 40 * DAY) });
    assert.deepEqual(real.removed, ['proj2/doomed.en.md']);
    assert.ok(!existsSync(flat));
  });

  it('is disabled when grace days ≤ 0 and skips unparseable entries', async () => {
    const disabled = await gcOrphanedCaches({ graceDays: 0 });
    assert.equal(disabled.disabled, true);

    mkdirSync(join(CACHE, 'proj3'), { recursive: true });
    writeFileSync(join(CACHE, 'proj3', 'stray.en.md'), 'no frontmatter at all', 'utf8');
    const result = await gcOrphanedCaches({ graceDays: 30, now: new Date() });
    assert.ok(existsSync(join(CACHE, 'proj3', 'stray.en.md')), 'unparseable entries are never touched');
  });
});
