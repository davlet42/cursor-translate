import { readFile } from 'node:fs/promises';
import { countCyrillicRatio } from '../detect/count-cyrillic-ratio.js';
import { estimateTokenSavings } from './estimate-token-savings.js';
import { appendMetricsEntry } from './append-metrics-entry.js';
import { parseDocCache } from '../cache/parse-doc-cache.js';

export interface DocCacheServedMetricsInput {
  sourcePath: string;
  cachePath: string;
  projectSlug: string;
  action: 'cache_hit' | 'sibling_copy' | 'translated' | 'cache_refreshed';
  sourceRaw: string;
  translateModel?: string;
  usedFallback?: boolean;
  trigger?: 'lazy_read' | 'batch_docs' | 'doc_cli';
}

export interface DocTranslateCostMetricsInput {
  sourcePath: string;
  cachePath: string;
  projectSlug: string;
  sourceRaw: string;
  translatedBody: string;
  translateModel: string;
  usedFallback?: boolean;
  trigger?: 'lazy_read' | 'batch_docs' | 'doc_cli';
  translateCostUsd?: number;
}

function estimateEnTokensFromChars(charCount: number): number {
  return Math.ceil(charCount / 4);
}

export function estimateDocServedSavings(sourceRaw: string, servedBody: string): {
  ruTokensEst: number;
  enTokensEst: number;
  savedTokensEst: number;
  cyrillicRatio: number;
} {
  const cyrillicRatio = countCyrillicRatio(sourceRaw);
  const ruSide = estimateTokenSavings(sourceRaw, cyrillicRatio, 0);
  const enTokensEst = estimateEnTokensFromChars(servedBody.length);
  const savedTokensEst = Math.max(0, ruSide.ruTokensEst - enTokensEst);

  return {
    ruTokensEst: ruSide.ruTokensEst,
    enTokensEst,
    savedTokensEst,
    cyrillicRatio,
  };
}

export function estimateDocTranslateCost(sourceRaw: string, translatedBody: string): number {
  const cyrillicRatio = countCyrillicRatio(sourceRaw);
  const inputEst = estimateTokenSavings(sourceRaw, cyrillicRatio, 0).ruTokensEst;
  const outputEst = estimateEnTokensFromChars(translatedBody.length);
  return inputEst + outputEst;
}

export async function logDocCacheServed(input: DocCacheServedMetricsInput): Promise<void> {
  let servedBody = input.sourceRaw;
  try {
    const cached = await readFile(input.cachePath, 'utf8');
    servedBody = parseDocCache(cached)?.body ?? cached;
  } catch {
    // fall back to source length estimate
  }

  const savings = estimateDocServedSavings(input.sourceRaw, servedBody);

  await appendMetricsEntry({
    source: 'doc_cache_served',
    reason: 'realized_savings',
    action: input.action,
    file_path: input.sourcePath,
    cache_path: input.cachePath,
    project_slug: input.projectSlug,
    translate_model: input.translateModel,
    used_fallback: input.usedFallback,
    ru_tokens_est: savings.ruTokensEst,
    en_tokens_est: savings.enTokensEst,
    saved_tokens_est: savings.savedTokensEst,
    cyrillic_ratio: Number(savings.cyrillicRatio.toFixed(3)),
    text_chars: input.sourceRaw.length,
    served_chars: servedBody.length,
    skipped: false,
  });
}

export async function logDocTranslateCost(input: DocTranslateCostMetricsInput): Promise<void> {
  const translateCost = estimateDocTranslateCost(input.sourceRaw, input.translatedBody);
  const cyrillicRatio = countCyrillicRatio(input.sourceRaw);

  await appendMetricsEntry({
    source: 'doc_translate_cost',
    reason: input.trigger === 'batch_docs' ? 'warmup_translate' : 'lazy_translate',
    action: 'translated',
    file_path: input.sourcePath,
    cache_path: input.cachePath,
    project_slug: input.projectSlug,
    translate_model: input.translateModel,
    used_fallback: input.usedFallback,
    ru_tokens_est: 0,
    en_tokens_est: 0,
    saved_tokens_est: 0,
    translate_cost_tokens_est: translateCost,
    translate_cost_usd: input.translateCostUsd,
    cyrillic_ratio: Number(cyrillicRatio.toFixed(3)),
    text_chars: input.sourceRaw.length,
    served_chars: input.translatedBody.length,
    skipped: false,
  });
}
