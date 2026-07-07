import { buildTranslateSystemPrompt } from './build-translate-system-prompt.js';
import { isQuotaExhaustedError } from './is-quota-exhausted-error.js';
import { splitMarkdownChunks } from './split-markdown-chunks.js';
import {
  DEFAULT_DOC_FALLBACK_MODEL,
  DEFAULT_TRANSLATE_MODEL,
} from '../constants/default-translate-model.constant.js';

export interface TranslateMarkdownOptions {
  apiKey: string;
  model: string;
  fallbackModel?: string;
  glossaryTerms: string[];
  customRules?: string | null;
  maxChunkChars?: number;
  allowFallback?: boolean;
}

export interface TranslateMarkdownOpenAiResult {
  text: string;
  modelUsed: string;
  usedFallback: boolean;
  quotaExhausted: boolean;
}

async function translateChunk(
  chunk: string,
  options: TranslateMarkdownOptions,
  model: string,
): Promise<string> {
  const glossaryBlock =
    options.glossaryTerms.length > 0
      ? `\nGlossary (do not translate):\n${options.glossaryTerms.map((t) => `- ${t}`).join('\n')}\n`
      : '';
  const systemPrompt = buildTranslateSystemPrompt(options.customRules);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `${glossaryBlock}\nMarkdown chunk:\n\n${chunk}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI translate failed (${response.status}): ${text}`);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI translate returned empty content');
  }
  return content.trim();
}

export async function translateMarkdownOpenAi(
  markdown: string,
  options: TranslateMarkdownOptions,
): Promise<TranslateMarkdownOpenAiResult> {
  const primaryModel = options.model ?? DEFAULT_TRANSLATE_MODEL;
  const fallbackModel = options.fallbackModel ?? DEFAULT_DOC_FALLBACK_MODEL;
  const maxChunkChars = options.maxChunkChars ?? 12000;
  const chunks = splitMarkdownChunks(markdown, maxChunkChars);

  const runWithModel = async (model: string): Promise<string[]> => {
    const outputs: string[] = [];
    for (const chunk of chunks) {
      const trimmed = chunk.trim();
      if (!trimmed) {
        continue;
      }
      outputs.push(await translateChunk(trimmed, options, model));
    }
    return outputs;
  };

  try {
    return {
      text: `${(await runWithModel(primaryModel)).join('\n\n')}\n`,
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
        text: `${(await runWithModel(fallbackModel)).join('\n\n')}\n`,
        modelUsed: fallbackModel,
        usedFallback: true,
        quotaExhausted: false,
      };
    } catch (fallbackError: unknown) {
      const fallbackMessage =
        fallbackError instanceof Error ? fallbackError.message : String(fallbackError);

      if (isQuotaExhaustedError(fallbackMessage)) {
        return {
          text: markdown,
          modelUsed: primaryModel,
          usedFallback: true,
          quotaExhausted: true,
        };
      }

      throw fallbackError;
    }
  }
}
