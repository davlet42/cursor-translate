import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { estimateTranscriptEnSavings } = await import(
  '../packages/core/dist/metrics/estimate-transcript-en-savings.js'
);
const { aggregateTranslateReport } = await import(
  '../packages/core/dist/metrics/aggregate-translate-report.js'
);
const { formatTranslateReport } = await import('../packages/core/dist/metrics/format-translate-report.js');

describe('estimateTranscriptEnSavings', () => {
  it('estimates EN-in-transcript savings vs hypothetical Russian', () => {
    const est = estimateTranscriptEnSavings(1200);
    assert.ok(est.ruTokensEst > est.enTokensEst);
    assert.equal(est.savedTokensEst, est.ruTokensEst - est.enTokensEst);
  });
});

describe('aggregateTranslateReport full economy', () => {
  it('counts display transcript savings and separates session opportunity', () => {
    const now = new Date().toISOString();
    const raw = [
      JSON.stringify({
        ts: now,
        source: 'doc_cache_served',
        saved_tokens_est: 2000,
      }),
      JSON.stringify({
        ts: now,
        source: 'response_back_translated',
        skipped: false,
        text_chars: 1200,
        translate_cost_tokens_est: 400,
        saved_tokens_est: 0,
      }),
      JSON.stringify({
        ts: now,
        source: 'user_prompt',
        reason: 'audit_opportunity',
        saved_tokens_est: 500,
        prompt_chars: 200,
      }),
      JSON.stringify({
        ts: now,
        source: 'doc_translate_cost',
        reason: 'lazy_translate',
        translate_cost_tokens_est: 300,
      }),
    ].join('\n');

    const result = aggregateTranslateReport(raw, 7, '/tmp/metrics.jsonl');

    assert.equal(result.operationalSavingsTokensEst, 2000);
    assert.ok(result.displayTranscriptSavingsTokensEst > 0);
    assert.equal(result.fullEconomySavingsTokensEst, 2000 + result.displayTranscriptSavingsTokensEst);
    assert.equal(result.userPromptOpportunityTokensEst, 500);
    assert.equal(result.fullEconomyNetRoiTokensEst, result.fullEconomySavingsTokensEst - 700);
  });

  it('formats full economy section', () => {
    const now = new Date().toISOString();
    const raw = JSON.stringify({
      ts: now,
      source: 'response_back_translated',
      skipped: false,
      text_chars: 800,
      translate_cost_tokens_est: 100,
    });

    const result = aggregateTranslateReport(`${raw}\n`, 7, '/tmp/metrics.jsonl');
    const formatted = formatTranslateReport(result, {
      brand: 'cursor-translate',
      translateSpendRateLabel: '@ nano rates',
      formatMainAgentSavingsUsd: (t) => (t * 0.000003).toFixed(2),
      formatTranslateSpendUsd: (t) => (t * 0.000001).toFixed(2),
    });

    assert.match(formatted, /ROI full economy/);
    assert.match(formatted, /display transcript EN kept/);
    assert.match(formatted, /user_prompt/);
    assert.match(formatted, /terminal `claude` with plugin/);
  });
});
