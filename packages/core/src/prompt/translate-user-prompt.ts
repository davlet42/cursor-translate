import { countCyrillicRatio } from '../detect/count-cyrillic-ratio.js';
import { loadTranslateConfig } from '../config/load-translate-config.js';
import { loadGlossaryTerms } from '../glossary/load-glossary-terms.js';
import { loadTranslateRules } from '../rules/load-translate-rules.js';
import { estimateTokenSavings } from '../metrics/estimate-token-savings.js';
import {
  isPromptTranslationBlocked,
  markDocTranslateQuotaExhausted,
} from '../quota/doc-translate-quota-state.js';
import { buildPromptTranslateSystemPrompt } from '../translate/build-prompt-translate-system-prompt.js';
import { translateTextCursorCli } from '../translate/translate-text-cursor-cli.js';
import { translateTextOpenAi } from '../translate/translate-text-openai.js';
import { logPromptTranslateMetrics } from '../metrics/log-prompt-translate-metrics.js';
import { resolveProjectSlug } from '../project/resolve-project-slug.js';
import { resolveProjectRoot } from '../project/resolve-project-root.js';
import type { TranslateProvider } from '../cache/translate-doc-to-global-cache.js';

export interface TranslateUserPromptOptions {
  text: string;
  cwd?: string;
  projectSlug?: string;
  projectRootHint?: string;
  force?: boolean;
  skipMetrics?: boolean;
  provider?: TranslateProvider;
  apiKey?: string;
}

export interface TranslateUserPromptResult {
  text: string;
  skipped: boolean;
  reason: string;
  originalText: string;
  modelUsed?: string;
  usedFallback?: boolean;
  cyrillicRatio: number;
  savedTokensEst: number;
  projectSlug: string;
}

function resolveProvider(
  explicit: TranslateProvider | undefined,
  fromConfig: TranslateProvider,
): TranslateProvider {
  const fromEnv = process.env.CURSOR_TRANSLATE_PROVIDER;
  if (explicit) {
    return explicit;
  }
  if (fromEnv === 'openai' || fromEnv === 'cursor-cli') {
    return fromEnv;
  }
  return fromConfig;
}

export async function translateUserPrompt(
  options: TranslateUserPromptOptions,
): Promise<TranslateUserPromptResult> {
  const cwd = options.cwd ?? process.cwd();
  const projectRoot = resolveProjectRoot(cwd, options.projectRootHint);
  const projectSlug = resolveProjectSlug(cwd, options.projectSlug, options.projectRootHint);
  const originalText = options.text;
  const cyrillicRatio = countCyrillicRatio(originalText);
  const config = await loadTranslateConfig();

  const baseResult = {
    originalText,
    cyrillicRatio,
    projectSlug,
    savedTokensEst: 0,
  };

  if (!config.enabled) {
    return {
      ...baseResult,
      text: originalText,
      skipped: true,
      reason: 'disabled',
    };
  }

  if (!config.promptTranslateEnabled) {
    return {
      ...baseResult,
      text: originalText,
      skipped: true,
      reason: 'prompt_translate_disabled',
    };
  }

  if (await isPromptTranslationBlocked()) {
    return {
      ...baseResult,
      text: originalText,
      skipped: true,
      reason: 'quota_blocked',
    };
  }

  const savings = estimateTokenSavings(
    originalText,
    cyrillicRatio,
    config.minCharsToTranslate,
    config.minCyrillicRatio,
  );

  if (!options.force && !savings.shouldTranslate) {
    if (!options.skipMetrics) {
      await logPromptTranslateMetrics({
        direction: 'ru_en',
        originalText,
        translatedText: originalText,
        skipped: true,
        reason: savings.reason,
        projectSlug,
      });
    }

    return {
      ...baseResult,
      text: originalText,
      skipped: true,
      reason: savings.reason,
      savedTokensEst: 0,
    };
  }

  const [glossaryTerms, customRules] = await Promise.all([
    loadGlossaryTerms(projectRoot),
    loadTranslateRules(projectRoot),
  ]);
  const systemPrompt = buildPromptTranslateSystemPrompt(customRules);
  const provider = resolveProvider(options.provider, config.provider);

  let translatedText = originalText;
  let modelUsed: string | undefined;
  let usedFallback = false;

  if (provider === 'openai') {
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required when CURSOR_TRANSLATE_PROVIDER=openai');
    }

    const result = await translateTextOpenAi(originalText, {
      apiKey,
      model: config.model,
      fallbackModel: config.docFallbackModel,
      glossaryTerms,
      systemPrompt,
      contentLabel: 'User prompt',
      allowFallback: true,
    });
    translatedText = result.text;
    modelUsed = result.modelUsed;
    usedFallback = result.usedFallback;

    if (result.quotaExhausted) {
      await markDocTranslateQuotaExhausted('openai quota exhausted for prompt translation');
      return {
        ...baseResult,
        text: originalText,
        skipped: true,
        reason: 'quota_exhausted',
        modelUsed,
        usedFallback,
      };
    }
  } else {
    const result = translateTextCursorCli(originalText, {
      model: config.model,
      fallbackModel: config.docFallbackModel,
      glossaryTerms,
      systemPrompt,
      contentLabel: 'User prompt',
      allowFallback: true,
    });
    translatedText = result.text;
    modelUsed = result.modelUsed;
    usedFallback = result.usedFallback;

    if (result.quotaExhausted) {
      await markDocTranslateQuotaExhausted('cursor-cli quota exhausted for prompt translation');
      return {
        ...baseResult,
        text: originalText,
        skipped: true,
        reason: 'quota_exhausted',
        modelUsed,
        usedFallback,
      };
    }
  }

  const enTokensEst = Math.ceil(translatedText.length / 4);
  const savedTokensEst = Math.max(0, savings.ruTokensEst - enTokensEst);

  if (!options.skipMetrics) {
    await logPromptTranslateMetrics({
      direction: 'ru_en',
      originalText,
      translatedText,
      skipped: false,
      reason: 'translated',
      translateModel: modelUsed,
      usedFallback,
      projectSlug,
    });
  }

  return {
    ...baseResult,
    text: translatedText,
    skipped: false,
    reason: 'translated',
    modelUsed,
    usedFallback,
    savedTokensEst,
  };
}
