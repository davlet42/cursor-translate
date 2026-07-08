import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildClaudePrintArgs } from '../packages/core/dist/agent/run-claude-print.js';
import { parseTranslateProvider } from '../packages/core/dist/translate/translate-provider.js';
import { isQuotaExhaustedError } from '../packages/core/dist/translate/is-quota-exhausted-error.js';

describe('buildClaudePrintArgs', () => {
  it('builds a minimal subscription-safe headless invocation', () => {
    const args = buildClaudePrintArgs('claude-haiku-4-5', 'Translate RU to EN.');
    assert.ok(args.includes('--print'));
    assert.ok(args.includes('--safe-mode'), 'must use --safe-mode (keeps OAuth, skips hooks)');
    assert.ok(args.includes('--no-session-persistence'));
    assert.ok(!args.includes('--bare'), '--bare drops OAuth auth and must not be used');

    const toolsIdx = args.indexOf('--tools');
    assert.ok(toolsIdx >= 0);
    assert.equal(args[toolsIdx + 1], '', 'all tools must be disabled');

    const formatIdx = args.indexOf('--output-format');
    assert.equal(args[formatIdx + 1], 'json', 'JSON output carries total_cost_usd for metrics');

    const modelIdx = args.indexOf('--model');
    assert.equal(args[modelIdx + 1], 'claude-haiku-4-5');

    const sysIdx = args.indexOf('--system-prompt');
    assert.equal(args[sysIdx + 1], 'Translate RU to EN.');
  });
});

describe('parseTranslateProvider', () => {
  it('accepts all three providers', () => {
    assert.equal(parseTranslateProvider('cursor-cli'), 'cursor-cli');
    assert.equal(parseTranslateProvider('openai'), 'openai');
    assert.equal(parseTranslateProvider('claude-cli'), 'claude-cli');
  });

  it('rejects unknown values', () => {
    assert.equal(parseTranslateProvider('gemini'), null);
    assert.equal(parseTranslateProvider(''), null);
    assert.equal(parseTranslateProvider(undefined), null);
  });
});

describe('isQuotaExhaustedError — Claude subscription messages', () => {
  it('matches Claude usage-limit phrasings', () => {
    assert.ok(isQuotaExhaustedError('Claude AI usage limit reached|1751968800'));
    assert.ok(isQuotaExhaustedError('5-hour limit reached ∙ resets 3am'));
    assert.ok(isQuotaExhaustedError('Weekly limit reached'));
  });

  it('does not match ordinary errors', () => {
    assert.ok(!isQuotaExhaustedError('ENOENT: claude binary not found'));
    assert.ok(!isQuotaExhaustedError('Invalid model name'));
  });
});
