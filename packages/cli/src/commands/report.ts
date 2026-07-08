import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  aggregateTranslateReport,
  aggregateTranslateReportFromMissingFile,
  type TranslateReportResult,
} from '@cursor-translate/core';
import { formatTranslateReport } from '@cursor-translate/core';
import { resolveMetricsPathFromEnv } from '../helpers/report-helpers.js';

const TRANSLATE_HOME = join(homedir(), '.cursor', 'translate-proxy');
const DEFAULT_METRICS_PATH = join(TRANSLATE_HOME, 'metrics.jsonl');

export type { TranslateReportMetricsEntry as MetricsEntry } from '@cursor-translate/core';
export type ReportResult = TranslateReportResult;

function parseDays(args: string[]): number {
  const idx = args.indexOf('--days');
  if (idx === -1 || !args[idx + 1]) {
    return 7;
  }
  const n = Number(args[idx + 1]);
  return Number.isFinite(n) && n > 0 ? n : 7;
}

function formatUsdFromMainAgentTokens(tokens: number): string {
  const blendedRate = 3 / 1_000_000;
  return (tokens * blendedRate).toFixed(2);
}

function formatUsdFromNanoTokens(tokens: number): string {
  const inputShare = 0.7;
  const outputShare = 0.3;
  const inputRate = 0.05 / 1_000_000;
  const outputRate = 0.4 / 1_000_000;
  const usd = tokens * inputShare * inputRate + tokens * outputShare * outputRate;
  return usd.toFixed(2);
}

export async function runReport(args: string[]): Promise<TranslateReportResult> {
  const days = parseDays(args);
  const metricsPath = resolveMetricsPathFromEnv(DEFAULT_METRICS_PATH);

  try {
    const raw = await readFile(metricsPath, 'utf8');
    return aggregateTranslateReport(raw, days, metricsPath);
  } catch {
    return aggregateTranslateReportFromMissingFile(days, metricsPath);
  }
}

export function formatReport(result: TranslateReportResult): string {
  return formatTranslateReport(result, {
    brand: 'cursor-translate',
    translateSpendRateLabel: '@ nano rates',
    formatMainAgentSavingsUsd: formatUsdFromMainAgentTokens,
    formatTranslateSpendUsd: formatUsdFromNanoTokens,
  });
}
