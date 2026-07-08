import { translateMarkdownOpenAi } from './translate-markdown-openai.js';
import { translateMarkdownCursorCli } from './translate-markdown-cursor-cli.js';
import { translateMarkdownClaudeCli } from './translate-markdown-claude-cli.js';
import type { TranslateProvider } from './translate-provider.js';

export interface TranslateMarkdownWithProviderOptions {
  provider: TranslateProvider;
  model: string;
  docFallbackModel: string;
  glossaryTerms: string[];
  customRules?: string | null;
  apiKey?: string;
  allowFallback?: boolean;
}

export interface TranslateMarkdownWithProviderResult {
  text: string;
  modelUsed: string;
  usedFallback: boolean;
  quotaExhausted: boolean;
  costUsd?: number;
}

export async function translateMarkdownWithProvider(
  markdown: string,
  options: TranslateMarkdownWithProviderOptions,
): Promise<TranslateMarkdownWithProviderResult> {
  if (options.provider === 'openai') {
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required when CURSOR_TRANSLATE_PROVIDER=openai');
    }
    const result = await translateMarkdownOpenAi(markdown, {
      apiKey,
      model: options.model,
      fallbackModel: options.docFallbackModel,
      glossaryTerms: options.glossaryTerms,
      customRules: options.customRules,
      allowFallback: options.allowFallback ?? true,
    });
    return {
      text: result.text,
      modelUsed: result.modelUsed,
      usedFallback: result.usedFallback,
      quotaExhausted: result.quotaExhausted,
    };
  }

  if (options.provider === 'claude-cli') {
    const result = translateMarkdownClaudeCli(markdown, {
      model: options.model,
      fallbackModel: options.docFallbackModel,
      glossaryTerms: options.glossaryTerms,
      customRules: options.customRules,
      allowFallback: options.allowFallback ?? true,
    });
    return {
      text: result.text,
      modelUsed: result.modelUsed,
      usedFallback: result.usedFallback,
      quotaExhausted: result.quotaExhausted,
      costUsd: result.costUsd,
    };
  }

  const result = translateMarkdownCursorCli(markdown, {
    model: options.model,
    fallbackModel: options.docFallbackModel,
    glossaryTerms: options.glossaryTerms,
    customRules: options.customRules,
    allowFallback: options.allowFallback ?? true,
  });
  return {
    text: result.text,
    modelUsed: result.modelUsed,
    usedFallback: result.usedFallback,
    quotaExhausted: result.quotaExhausted,
  };
}
