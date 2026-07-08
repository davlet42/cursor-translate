import { runClaudePrint } from '../agent/run-claude-print.js';
import {
  DEFAULT_CLAUDE_DOC_FALLBACK_MODEL,
  DEFAULT_CLAUDE_TRANSLATE_MODEL,
} from '../constants/default-translate-model.constant.js';
import { isQuotaExhaustedError } from './is-quota-exhausted-error.js';
import { splitMarkdownChunks } from './split-markdown-chunks.js';

export interface TranslateTextClaudeCliOptions {
  claudeBinary?: string;
  model?: string;
  fallbackModel?: string;
  maxChunkChars?: number;
  glossaryTerms: string[];
  systemPrompt: string;
  contentLabel?: string;
  allowFallback?: boolean;
}

export interface TranslateTextClaudeCliResult {
  text: string;
  modelUsed: string;
  usedFallback: boolean;
  quotaExhausted: boolean;
  // Actual spend summed from claude -p receipts; undefined when unavailable.
  costUsd?: number;
}

function translateChunk(
  chunk: string,
  options: TranslateTextClaudeCliOptions,
  model: string,
): { text: string; costUsd: number | null } {
  const glossaryBlock =
    options.glossaryTerms.length > 0
      ? `\nGlossary (do not translate):\n${options.glossaryTerms.map((t) => `- ${t}`).join('\n')}\n`
      : '';
  const label = options.contentLabel ?? 'Text';

  return runClaudePrint({
    claudeBinary: options.claudeBinary,
    model,
    systemPrompt: `${options.systemPrompt}${glossaryBlock}`,
    prompt: `${label}:\n\n${chunk}`,
  });
}

export function translateTextClaudeCli(
  text: string,
  options: TranslateTextClaudeCliOptions,
): TranslateTextClaudeCliResult {
  const primaryModel =
    options.model ?? process.env.CLAUDE_TRANSLATE_MODEL ?? DEFAULT_CLAUDE_TRANSLATE_MODEL;
  const fallbackModel =
    options.fallbackModel ??
    process.env.CLAUDE_TRANSLATE_DOC_FALLBACK_MODEL ??
    DEFAULT_CLAUDE_DOC_FALLBACK_MODEL;
  const maxChunkChars = options.maxChunkChars ?? 12000;
  const chunks = splitMarkdownChunks(text, maxChunkChars);

  const runWithModel = (model: string): { texts: string[]; costUsd?: number } => {
    const outputs: string[] = [];
    let costUsd: number | undefined;
    for (const chunk of chunks) {
      const trimmed = chunk.trim();
      if (!trimmed) {
        continue;
      }
      const result = translateChunk(trimmed, options, model);
      outputs.push(result.text);
      if (result.costUsd !== null) {
        costUsd = (costUsd ?? 0) + result.costUsd;
      }
    }
    return { texts: outputs, costUsd };
  };

  try {
    const run = runWithModel(primaryModel);
    return {
      text: `${run.texts.join('\n\n')}\n`.trimEnd(),
      modelUsed: primaryModel,
      usedFallback: false,
      quotaExhausted: false,
      costUsd: run.costUsd,
    };
  } catch (primaryError: unknown) {
    const primaryMessage =
      primaryError instanceof Error ? primaryError.message : String(primaryError);

    if (!options.allowFallback || !isQuotaExhaustedError(primaryMessage)) {
      throw primaryError;
    }

    try {
      const run = runWithModel(fallbackModel);
      return {
        text: `${run.texts.join('\n\n')}\n`.trimEnd(),
        modelUsed: fallbackModel,
        usedFallback: true,
        quotaExhausted: false,
        costUsd: run.costUsd,
      };
    } catch (fallbackError: unknown) {
      const fallbackMessage =
        fallbackError instanceof Error ? fallbackError.message : String(fallbackError);

      if (isQuotaExhaustedError(fallbackMessage)) {
        return {
          text,
          modelUsed: primaryModel,
          usedFallback: true,
          quotaExhausted: true,
        };
      }

      throw fallbackError;
    }
  }
}
