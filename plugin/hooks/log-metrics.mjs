#!/usr/bin/env node
/**
 * Unified metrics logger for cursor-translate Phase 0/0b/0c.
 * Usage: SOURCE=... node log-metrics.mjs < hook.json
 */
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOME = join(homedir(), '.cursor', 'translate-proxy');
const METRICS_PATH = join(HOME, 'metrics.jsonl');
const CYRILLIC_RE = /[А-Яа-яЁё]/g;

const SOURCE = process.env.SOURCE ?? 'unknown';

const THRESHOLDS = {
  user_prompt: { minChars: 120, minCyrillic: 20 },
  agent_response: { minChars: 200, minCyrillic: 30 },
  file_read: { minChars: 200, minCyrillic: 20 },
  subagent_task: { minChars: 80, minCyrillic: 10 },
  subagent_summary: { minChars: 100, minCyrillic: 10 },
};

const ALWAYS_LOG_SOURCES = new Set(['subagent_task', 'subagent_summary']);

function countCyrillic(text) {
  return (text.match(CYRILLIC_RE) ?? []).length;
}

function estimateTokens(charCount, cyrillicCount) {
  const ratio = charCount > 0 ? cyrillicCount / charCount : 0;
  const base = Math.ceil(charCount / 3);
  const ruEst = ratio >= 0.05 ? Math.ceil(base * 1.8) : base;
  const enEst = Math.ceil(ruEst * 0.55);
  return { ruEst, enEst, saved: ruEst - enEst };
}

function extractPayload(source, input) {
  switch (source) {
    case 'user_prompt':
      return { text: input.prompt ?? '', meta: {} };
    case 'agent_response':
      return { text: input.text ?? '', meta: {} };
    case 'subagent_task':
      return {
        text: input.task ?? '',
        meta: {
          subagent_id: input.subagent_id ?? null,
          subagent_type: input.subagent_type ?? null,
          parent_conversation_id: input.parent_conversation_id ?? null,
          subagent_model: input.subagent_model ?? null,
        },
      };
    case 'subagent_summary':
      return {
        text: input.summary ?? '',
        meta: {
          subagent_type: input.subagent_type ?? null,
          status: input.status ?? null,
          tool_call_count: input.tool_call_count ?? null,
          message_count: input.message_count ?? null,
          duration_ms: input.duration_ms ?? null,
          modified_files_count: Array.isArray(input.modified_files)
            ? input.modified_files.length
            : null,
        },
      };
    case 'file_read': {
      const toolInput = input.tool_input ?? {};
      const filePath = toolInput.path ?? toolInput.file_path ?? toolInput.target ?? null;
      let text = '';

      if (typeof input.tool_output === 'string') {
        try {
          const parsed = JSON.parse(input.tool_output);
          text =
            parsed.content ??
            parsed.text ??
            parsed.output ??
            (typeof parsed === 'string' ? parsed : JSON.stringify(parsed));
        } catch {
          text = input.tool_output;
        }
      }

      if (!text && typeof input.content === 'string') {
        text = input.content;
      }

      return { text, meta: { file_path: filePath } };
    }
    default:
      return { text: '', meta: {} };
  }
}

function shouldLog(source, text, cyrillicCount) {
  if (ALWAYS_LOG_SOURCES.has(source)) {
    return text.length > 0;
  }
  const t = THRESHOLDS[source] ?? THRESHOLDS.user_prompt;
  return text.length >= t.minChars && cyrillicCount >= t.minCyrillic;
}

function tokenEstimates(source, text, cyrillicCount) {
  const t = THRESHOLDS[source] ?? THRESHOLDS.user_prompt;
  const qualifies =
    ALWAYS_LOG_SOURCES.has(source) &&
    text.length >= t.minChars &&
    cyrillicCount >= t.minCyrillic;

  if (ALWAYS_LOG_SOURCES.has(source) && !qualifies) {
    return { ruEst: 0, enEst: 0, saved: 0, qualifies: false };
  }

  if (!ALWAYS_LOG_SOURCES.has(source)) {
    const est = estimateTokens(text.length, cyrillicCount);
    return { ...est, qualifies: true };
  }

  const est = estimateTokens(text.length, cyrillicCount);
  return { ...est, qualifies: true };
}

const raw = readFileSync(0, 'utf8');
const input = JSON.parse(raw);
const { text, meta } = extractPayload(SOURCE, input);
const cyrillicCount = countCyrillic(text);

if (!shouldLog(SOURCE, text, cyrillicCount)) {
  process.exit(0);
}

const ratio = text.length ? cyrillicCount / text.length : 0;
const { ruEst, enEst, saved, qualifies } = tokenEstimates(SOURCE, text, cyrillicCount);

const entry = {
  ts: new Date().toISOString(),
  source: SOURCE,
  conversation_id: input.conversation_id ?? input.parent_conversation_id ?? null,
  generation_id: input.generation_id ?? null,
  skipped: ALWAYS_LOG_SOURCES.has(SOURCE) && !qualifies,
  reason: qualifies ? 'audit_opportunity' : 'subagent_activity',
  ru_tokens_est: ruEst,
  en_tokens_est: enEst,
  saved_tokens_est: saved,
  cyrillic_ratio: Number(ratio.toFixed(3)),
  text_chars: text.length,
  ...meta,
};

mkdirSync(HOME, { recursive: true });
appendFileSync(METRICS_PATH, `${JSON.stringify(entry)}\n`);
