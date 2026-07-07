import { spawnSync } from 'node:child_process';
import { appendCursorAgentTrustArgs } from '../agent/append-cursor-agent-trust-args.js';
import {
  DEFAULT_DOC_FALLBACK_MODEL,
  DEFAULT_TRANSLATE_MODEL,
} from '../constants/default-translate-model.constant.js';
import { isQuotaExhaustedError } from './is-quota-exhausted-error.js';
import { splitMarkdownChunks } from './split-markdown-chunks.js';

export interface TranslateTextCursorCliOptions {
  agentBinary?: string;
  model?: string;
  fallbackModel?: string;
  maxChunkChars?: number;
  glossaryTerms: string[];
  systemPrompt: string;
  contentLabel?: string;
  allowFallback?: boolean;
}

export interface TranslateTextCursorCliResult {
  text: string;
  modelUsed: string;
  usedFallback: boolean;
  quotaExhausted: boolean;
}

function translateChunk(
  chunk: string,
  options: TranslateTextCursorCliOptions,
  model: string,
): string {
  const agent = options.agentBinary ?? process.env.CURSOR_AGENT_BIN ?? 'agent';
  const glossaryBlock =
    options.glossaryTerms.length > 0
      ? `\nGlossary (do not translate):\n${options.glossaryTerms.map((t) => `- ${t}`).join('\n')}\n`
      : '';
  const label = options.contentLabel ?? 'Text';
  const prompt = `${options.systemPrompt}${glossaryBlock}\n${label}:\n\n${chunk}`;
  const args = appendCursorAgentTrustArgs([
    '--print',
    '--mode',
    'ask',
    '--output-format',
    'text',
    '--model',
    model,
    '-p',
    prompt,
  ]);

  const result = spawnSync(agent, args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    timeout: 10 * 60 * 1000,
  });

  if (result.error) {
    throw new Error(`Cursor agent CLI failed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.trim() || 'unknown error';
    throw new Error(`Cursor agent CLI exited ${result.status}: ${stderr}`);
  }

  const content = result.stdout?.trim();
  if (!content) {
    throw new Error('Cursor agent CLI returned empty translation');
  }

  return content;
}

export function translateTextCursorCli(
  text: string,
  options: TranslateTextCursorCliOptions,
): TranslateTextCursorCliResult {
  const primaryModel = options.model ?? process.env.CURSOR_TRANSLATE_MODEL ?? DEFAULT_TRANSLATE_MODEL;
  const fallbackModel =
    options.fallbackModel ??
    process.env.CURSOR_TRANSLATE_DOC_FALLBACK_MODEL ??
    DEFAULT_DOC_FALLBACK_MODEL;
  const maxChunkChars = options.maxChunkChars ?? 12000;
  const chunks = splitMarkdownChunks(text, maxChunkChars);

  const runWithModel = (model: string): string[] => {
    const outputs: string[] = [];
    for (const chunk of chunks) {
      const trimmed = chunk.trim();
      if (!trimmed) {
        continue;
      }
      outputs.push(translateChunk(trimmed, options, model));
    }
    return outputs;
  };

  try {
    return {
      text: `${runWithModel(primaryModel).join('\n\n')}\n`.trimEnd(),
      modelUsed: primaryModel,
      usedFallback: false,
      quotaExhausted: false,
    };
  } catch (primaryError: unknown) {
    const primaryMessage =
      primaryError instanceof Error ? primaryError.message : String(primaryError);

    if (!options.allowFallback || !isQuotaExhaustedError(primaryMessage)) {
      throw primaryError;
    }

    try {
      return {
        text: `${runWithModel(fallbackModel).join('\n\n')}\n`.trimEnd(),
        modelUsed: fallbackModel,
        usedFallback: true,
        quotaExhausted: false,
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
