import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { runReport, formatReport } from '../packages/cli/dist/commands/report.js';

describe('runReport', () => {
  let tempDir = '';
  let metricsPath = '';
  const originalMetricsEnv = process.env.CURSOR_TRANSLATE_METRICS_PATH;

  after(() => {
    if (originalMetricsEnv === undefined) {
      delete process.env.CURSOR_TRANSLATE_METRICS_PATH;
    } else {
      process.env.CURSOR_TRANSLATE_METRICS_PATH = originalMetricsEnv;
    }
  });

  it('aggregates operational vs warmup metrics', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ct-report-'));
    metricsPath = join(tempDir, 'metrics.jsonl');
    const now = new Date().toISOString();

    const lines = [
      {
        ts: now,
        source: 'doc_cache_served',
        saved_tokens_est: 2000,
        translate_cost_tokens_est: 0,
      },
      {
        ts: now,
        source: 'doc_translate_cost',
        reason: 'warmup_translate',
        translate_cost_tokens_est: 50000,
        saved_tokens_est: 0,
      },
      {
        ts: now,
        source: 'doc_translate_cost',
        reason: 'lazy_translate',
        translate_cost_tokens_est: 300,
        saved_tokens_est: 0,
      },
      {
        ts: now,
        source: 'prompt_translated',
        saved_tokens_est: 800,
        translate_cost_tokens_est: 120,
      },
    ];

    writeFileSync(metricsPath, `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`, 'utf8');
    process.env.CURSOR_TRANSLATE_METRICS_PATH = metricsPath;

    const result = await runReport(['--days', '7']);

    assert.equal(result.docCacheServedEvents, 1);
    assert.equal(result.docSavingsTokensEst, 2000);
    assert.equal(result.docWarmupCostTokensEst, 50000);
    assert.equal(result.docIncrementalCostTokensEst, 300);
    assert.equal(result.operationalSavingsTokensEst, 2800);
    assert.equal(result.operationalTranslateCostTokensEst, 420);
    assert.equal(result.operationalNetRoiTokensEst, 2380);

    const formatted = formatReport(result);
    assert.match(formatted, /ROI operational/);
    assert.match(formatted, /ROI full economy/);
    assert.match(formatted, /break-even reads \(warmup/);
    assert.match(formatted, /doc_translate_cost \(warmup\)/);
  });
});
