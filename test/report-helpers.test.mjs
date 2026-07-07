import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  estimateBreakEvenReads,
  resolveBySourceKey,
  resolveDocTranslateCostBucket,
  resolveMetricsPathFromEnv,
} from '../packages/cli/dist/helpers/report-helpers.js';

describe('report helpers', () => {
  it('resolveDocTranslateCostBucket warmup vs incremental', () => {
    assert.equal(resolveDocTranslateCostBucket({ reason: 'warmup_translate' }), 'warmup');
    assert.equal(resolveDocTranslateCostBucket({ reason: 'lazy_translate' }), 'incremental');
    assert.equal(resolveDocTranslateCostBucket({}), 'incremental');
  });

  it('resolveBySourceKey splits doc_translate_cost', () => {
    assert.equal(
      resolveBySourceKey({ reason: 'warmup_translate' }, 'doc_translate_cost'),
      'doc_translate_cost (warmup)',
    );
    assert.equal(
      resolveBySourceKey({ reason: 'lazy_translate' }, 'doc_translate_cost'),
      'doc_translate_cost (incremental)',
    );
    assert.equal(resolveBySourceKey({}, 'prompt_translated'), 'prompt_translated');
  });

  it('estimateBreakEvenReads', () => {
    assert.equal(estimateBreakEvenReads(0, 100, 10), null);
    assert.equal(estimateBreakEvenReads(1000, 0, 10), null);
    assert.equal(estimateBreakEvenReads(1000, 500, 5), 10);
    assert.equal(estimateBreakEvenReads(1001, 500, 5), 11);
  });

  it('resolveMetricsPathFromEnv', () => {
    const defaultPath = '/tmp/metrics.jsonl';
    const original = process.env.CURSOR_TRANSLATE_METRICS_PATH;
    delete process.env.CURSOR_TRANSLATE_METRICS_PATH;
    assert.equal(resolveMetricsPathFromEnv(defaultPath), defaultPath);
    process.env.CURSOR_TRANSLATE_METRICS_PATH = '  /custom/metrics.jsonl  ';
    assert.equal(resolveMetricsPathFromEnv(defaultPath), '/custom/metrics.jsonl');
    if (original === undefined) {
      delete process.env.CURSOR_TRANSLATE_METRICS_PATH;
    } else {
      process.env.CURSOR_TRANSLATE_METRICS_PATH = original;
    }
  });
});
