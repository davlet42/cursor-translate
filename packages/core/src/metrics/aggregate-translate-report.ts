import { estimateTranscriptEnSavings } from './estimate-transcript-en-savings.js';
import type { TranslateReportMetricsEntry } from './translate-report-entry.interface.js';

const NARROW_REALIZED_SOURCES = new Set(['doc_cache_served', 'prompt_translated']);
const COST_SOURCES = new Set(['doc_translate_cost', 'prompt_translated', 'response_back_translated']);
const SESSION_OPPORTUNITY_SOURCES = new Set([
  'user_prompt',
  'agent_response',
  'file_read',
  'subagent_task',
  'subagent_summary',
]);

export interface TranslateReportBySourceRow {
  events: number;
  savedTokensEst: number;
  translateCostTokensEst: number;
  chars: number;
  subagentRuns: number;
  toolCalls: number;
}

export interface TranslateReportResult {
  days: number;
  totalEvents: number;
  bySource: Record<string, TranslateReportBySourceRow>;
  totalSavedTokensEst: number;
  realizedSavingsTokensEst: number;
  translateCostTokensEst: number;
  netDocRoiTokensEst: number;
  sessionOpportunityTokensEst: number;
  userPromptOpportunityTokensEst: number;
  agentResponseOpportunityTokensEst: number;
  promptSavingsTokensEst: number;
  promptTranslateCostTokensEst: number;
  displayTranscriptSavingsTokensEst: number;
  displayBackTranslateEvents: number;
  docSavingsTokensEst: number;
  docCacheServedEvents: number;
  docWarmupCostTokensEst: number;
  docIncrementalCostTokensEst: number;
  operationalSavingsTokensEst: number;
  operationalTranslateCostTokensEst: number;
  operationalNetRoiTokensEst: number;
  fullEconomySavingsTokensEst: number;
  fullEconomyNetRoiTokensEst: number;
  actualSpendUsd: number;
  actualSpendEvents: number;
  metricsPath: string;
}

export function resolveDocTranslateCostBucket(entry: TranslateReportMetricsEntry): 'warmup' | 'incremental' {
  if (entry.reason === 'warmup_translate') {
    return 'warmup';
  }
  return 'incremental';
}

export function resolveBySourceKey(entry: TranslateReportMetricsEntry, source: string): string {
  if (source === 'doc_translate_cost') {
    return entry.reason === 'warmup_translate'
      ? 'doc_translate_cost (warmup)'
      : 'doc_translate_cost (incremental)';
  }
  return source;
}

export function estimateBreakEvenReads(
  costTokens: number,
  docSavings: number,
  reads: number,
): number | null {
  if (costTokens <= 0) {
    return null;
  }
  if (reads <= 0 || docSavings <= 0) {
    return null;
  }
  const avgSavingsPerRead = docSavings / reads;
  if (avgSavingsPerRead <= 0) {
    return null;
  }
  return Math.ceil(costTokens / avgSavingsPerRead);
}

function resolveDisplayTranscriptSavings(entry: TranslateReportMetricsEntry): number {
  if (entry.skipped) {
    return 0;
  }

  const saved = entry.saved_tokens_est ?? 0;
  if (saved > 0) {
    return saved;
  }

  const chars = entry.text_chars ?? entry.served_chars ?? 0;
  if (chars <= 0) {
    return 0;
  }

  return estimateTranscriptEnSavings(chars).savedTokensEst;
}

function emptyReportResult(days: number, metricsPath: string): TranslateReportResult {
  return {
    days,
    totalEvents: 0,
    bySource: {},
    totalSavedTokensEst: 0,
    realizedSavingsTokensEst: 0,
    translateCostTokensEst: 0,
    netDocRoiTokensEst: 0,
    sessionOpportunityTokensEst: 0,
    userPromptOpportunityTokensEst: 0,
    agentResponseOpportunityTokensEst: 0,
    promptSavingsTokensEst: 0,
    promptTranslateCostTokensEst: 0,
    displayTranscriptSavingsTokensEst: 0,
    displayBackTranslateEvents: 0,
    docSavingsTokensEst: 0,
    docCacheServedEvents: 0,
    docWarmupCostTokensEst: 0,
    docIncrementalCostTokensEst: 0,
    operationalSavingsTokensEst: 0,
    operationalTranslateCostTokensEst: 0,
    operationalNetRoiTokensEst: 0,
    fullEconomySavingsTokensEst: 0,
    fullEconomyNetRoiTokensEst: 0,
    actualSpendUsd: 0,
    actualSpendEvents: 0,
    metricsPath,
  };
}

function normalizeSource(entry: TranslateReportMetricsEntry): string {
  return entry.source ?? 'user_prompt';
}

export function aggregateTranslateReport(
  raw: string,
  days: number,
  metricsPath: string,
): TranslateReportResult {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const bySource: Record<string, TranslateReportBySourceRow> = {};
  let totalEvents = 0;
  let totalSavedTokensEst = 0;
  let realizedSavingsTokensEst = 0;
  let translateCostTokensEst = 0;
  let sessionOpportunityTokensEst = 0;
  let userPromptOpportunityTokensEst = 0;
  let agentResponseOpportunityTokensEst = 0;
  let promptSavingsTokensEst = 0;
  let promptTranslateCostTokensEst = 0;
  let displayTranscriptSavingsTokensEst = 0;
  let displayBackTranslateEvents = 0;
  let docSavingsTokensEst = 0;
  let docCacheServedEvents = 0;
  let docWarmupCostTokensEst = 0;
  let docIncrementalCostTokensEst = 0;
  let actualSpendUsd = 0;
  let actualSpendEvents = 0;

  for (const line of raw.split('\n')) {
    if (!line.trim()) {
      continue;
    }

    let entry: TranslateReportMetricsEntry;
    try {
      entry = JSON.parse(line) as TranslateReportMetricsEntry;
    } catch {
      continue;
    }

    const ts = Date.parse(entry.ts);
    if (Number.isFinite(ts) && ts < cutoff) {
      continue;
    }

    const source = normalizeSource(entry);
    const bySourceKey = resolveBySourceKey(entry, source);
    if (!bySource[bySourceKey]) {
      bySource[bySourceKey] = {
        events: 0,
        savedTokensEst: 0,
        translateCostTokensEst: 0,
        chars: 0,
        subagentRuns: 0,
        toolCalls: 0,
      };
    }

    const saved = entry.saved_tokens_est ?? 0;
    const cost = entry.translate_cost_tokens_est ?? 0;
    const displaySavings = source === 'response_back_translated' ? resolveDisplayTranscriptSavings(entry) : 0;

    bySource[bySourceKey].events += 1;
    bySource[bySourceKey].savedTokensEst += saved > 0 ? saved : displaySavings;
    bySource[bySourceKey].translateCostTokensEst += cost;
    bySource[bySourceKey].chars += entry.text_chars ?? entry.prompt_chars ?? 0;
    if (source === 'subagent_summary') {
      bySource[bySourceKey].subagentRuns += 1;
      bySource[bySourceKey].toolCalls += entry.tool_call_count ?? 0;
    }

    totalEvents += 1;
    totalSavedTokensEst += saved > 0 ? saved : displaySavings;
    translateCostTokensEst += cost;

    if (source === 'doc_cache_served') {
      docSavingsTokensEst += saved;
      docCacheServedEvents += 1;
    }

    if (source === 'doc_translate_cost') {
      if (resolveDocTranslateCostBucket(entry) === 'warmup') {
        docWarmupCostTokensEst += cost;
      } else {
        docIncrementalCostTokensEst += cost;
      }
    }

    if (NARROW_REALIZED_SOURCES.has(source)) {
      realizedSavingsTokensEst += saved;
      if (source === 'prompt_translated') {
        promptSavingsTokensEst += saved;
      }
    } else if (source === 'response_back_translated') {
      displayTranscriptSavingsTokensEst += displaySavings;
      if (!entry.skipped && cost > 0) {
        displayBackTranslateEvents += 1;
      }
    } else if (SESSION_OPPORTUNITY_SOURCES.has(source)) {
      sessionOpportunityTokensEst += saved;
      if (source === 'user_prompt') {
        userPromptOpportunityTokensEst += saved;
      }
      if (source === 'agent_response') {
        agentResponseOpportunityTokensEst += saved;
      }
    }

    if (COST_SOURCES.has(source)) {
      if (source === 'prompt_translated' || source === 'response_back_translated') {
        promptTranslateCostTokensEst += cost;
      }
      if (typeof entry.translate_cost_usd === 'number') {
        actualSpendUsd += entry.translate_cost_usd;
        actualSpendEvents += 1;
      }
    }
  }

  const operationalTranslateCostTokensEst =
    docIncrementalCostTokensEst + promptTranslateCostTokensEst;
  const operationalSavingsTokensEst = realizedSavingsTokensEst;
  const operationalNetRoiTokensEst =
    operationalSavingsTokensEst - operationalTranslateCostTokensEst;
  const fullEconomySavingsTokensEst =
    operationalSavingsTokensEst + displayTranscriptSavingsTokensEst;
  const fullEconomyNetRoiTokensEst =
    fullEconomySavingsTokensEst - operationalTranslateCostTokensEst;
  const netDocRoiTokensEst = realizedSavingsTokensEst - translateCostTokensEst;

  return {
    days,
    totalEvents,
    bySource,
    totalSavedTokensEst,
    realizedSavingsTokensEst,
    translateCostTokensEst,
    netDocRoiTokensEst,
    sessionOpportunityTokensEst,
    userPromptOpportunityTokensEst,
    agentResponseOpportunityTokensEst,
    promptSavingsTokensEst,
    promptTranslateCostTokensEst,
    displayTranscriptSavingsTokensEst,
    displayBackTranslateEvents,
    docSavingsTokensEst,
    docCacheServedEvents,
    docWarmupCostTokensEst,
    docIncrementalCostTokensEst,
    operationalSavingsTokensEst,
    operationalTranslateCostTokensEst,
    operationalNetRoiTokensEst,
    fullEconomySavingsTokensEst,
    fullEconomyNetRoiTokensEst,
    actualSpendUsd,
    actualSpendEvents,
    metricsPath,
  };
}

export function aggregateTranslateReportFromMissingFile(
  days: number,
  metricsPath: string,
): TranslateReportResult {
  return emptyReportResult(days, metricsPath);
}
