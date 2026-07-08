import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveTranslateHome } from '../config/resolve-translate-home.js';

export interface MetricsLogEntry {
  ts?: string;
  source: string;
  reason: string;
  ru_tokens_est: number;
  en_tokens_est: number;
  saved_tokens_est: number;
  translate_cost_tokens_est?: number;
  // Actual spend from claude -p receipts (total_cost_usd), when available.
  translate_cost_usd?: number;
  cyrillic_ratio?: number;
  text_chars?: number;
  served_chars?: number;
  file_path?: string;
  cache_path?: string;
  project_slug?: string;
  action?: string;
  translate_model?: string;
  used_fallback?: boolean;
  skipped?: boolean;
}

export function resolveMetricsPath(): string {
  return join(resolveTranslateHome(), 'metrics.jsonl');
}

export async function appendMetricsEntry(entry: MetricsLogEntry): Promise<void> {
  const home = resolveTranslateHome();
  await mkdir(home, { recursive: true });
  const line = `${JSON.stringify({
    ts: entry.ts ?? new Date().toISOString(),
    ...entry,
  })}\n`;
  await appendFile(resolveMetricsPath(), line, 'utf8');
}
