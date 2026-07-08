import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, it } from 'node:test';

const HOME = mkdtempSync(join(tmpdir(), 'ct-quota-test-'));
process.env.CURSOR_TRANSLATE_HOME = HOME;
delete process.env.CURSOR_TRANSLATE_QUOTA_TTL_MIN;
delete process.env.CLAUDE_TRANSLATE_QUOTA_TTL_MIN;

const { isPromptTranslationBlocked, markDocTranslateQuotaExhausted } = await import(
  '../packages/core/dist/quota/doc-translate-quota-state.js'
);

const STATE_PATH = join(HOME, 'doc-translate-quota.json');

describe('quota latch TTL', () => {
  beforeEach(() => {
    try {
      writeFileSync(STATE_PATH, '', 'utf8');
    } catch {
      // ignore
    }
  });

  it('blocks right after quota exhaustion', async () => {
    await markDocTranslateQuotaExhausted('test: fresh exhaustion');
    assert.equal(await isPromptTranslationBlocked(), true);
  });

  it('auto-expires a stale latch and clears the state', async () => {
    const staleState = {
      exhaustedAt: new Date(Date.now() - 45 * 60_000).toISOString(),
      reason: 'test: stale',
    };
    writeFileSync(STATE_PATH, JSON.stringify(staleState), 'utf8');

    assert.equal(await isPromptTranslationBlocked(), false, '45min-old latch must expire (TTL 30min)');
    assert.equal(readFileSync(STATE_PATH, 'utf8'), '', 'expired state must be cleared');
  });

  it('treats a malformed timestamp as expired', async () => {
    writeFileSync(STATE_PATH, JSON.stringify({ exhaustedAt: 'not-a-date', reason: 'x' }), 'utf8');
    assert.equal(await isPromptTranslationBlocked(), false);
  });

  it('honors the TTL env override', async () => {
    process.env.CURSOR_TRANSLATE_QUOTA_TTL_MIN = '120';
    const state = {
      exhaustedAt: new Date(Date.now() - 45 * 60_000).toISOString(),
      reason: 'test: within extended ttl',
    };
    writeFileSync(STATE_PATH, JSON.stringify(state), 'utf8');

    assert.equal(await isPromptTranslationBlocked(), true, '45min-old latch must hold with TTL 120min');
    delete process.env.CURSOR_TRANSLATE_QUOTA_TTL_MIN;
  });

  it('empty state file means not blocked', async () => {
    assert.equal(existsSync(STATE_PATH), true);
    assert.equal(await isPromptTranslationBlocked(), false);
  });
});
