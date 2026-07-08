export interface TranslateReportMetricsEntry {
  ts: string;
  source?: string;
  skipped?: boolean;
  reason?: string;
  ru_tokens_est?: number;
  en_tokens_est?: number;
  saved_tokens_est?: number;
  translate_cost_tokens_est?: number;
  translate_cost_usd?: number;
  text_chars?: number;
  prompt_chars?: number;
  served_chars?: number;
  cyrillic_ratio?: number;
  file_path?: string | null;
  cache_path?: string | null;
  project_slug?: string | null;
  action?: string | null;
  subagent_type?: string | null;
  tool_call_count?: number | null;
  message_count?: number | null;
  duration_ms?: number | null;
}
