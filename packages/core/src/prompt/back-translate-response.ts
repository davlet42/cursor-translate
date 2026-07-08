import { countCyrillicRatio } from '../detect/count-cyrillic-ratio.js';
import { loadTranslateConfig } from '../config/load-translate-config.js';
import { loadGlossaryTerms } from '../glossary/load-glossary-terms.js';
import { loadTranslateRules } from '../rules/load-translate-rules.js';
import {
  isPromptTranslationBlocked,
  markDocTranslateQuotaExhausted,
} from '../quota/doc-translate-quota-state.js';
import { buildBackTranslateSystemPrompt } from '../translate/build-back-translate-system-prompt.js';
import { translateTextCursorCli } from '../translate/translate-text-cursor-cli.js';
import { translateTextClaudeCli } from '../translate/translate-text-claude-cli.js';
import { translateTextOpenAi } from '../translate/translate-text-openai.js';
import { logPromptTranslateMetrics } from '../metrics/log-prompt-translate-metrics.js';
import { resolveProjectSlug } from '../project/resolve-project-slug.js';
import { resolveProjectRoot } from '../project/resolve-project-root.js';
import { resolveProviderFromEnv } from '../translate/translate-provider.js';
import type { TranslateProvider } from '../translate/translate-provider.js';

export interface BackTranslateResponseOptions {
  text: string;
  cwd?: string;
  projectSlug?: string;
  projectRootHint?: string;
  force?: boolean;
  skipMetrics?: boolean;
  provider?: TranslateProvider;
  apiKey?: string;
}

export interface BackTranslateResponseResult {
  text: string;
  skipped: boolean;
  reason: string;
  originalText: string;
  modelUsed?: string;
  usedFallback?: boolean;
  projectSlug: string;
}

function resolveProvider(
  explicit: TranslateProvider | undefined,
  fromConfig: TranslateProvider,
): TranslateProvider {
  return explicit ?? resolveProviderFromEnv() ?? fromConfig;
}

export async function backTranslateResponse(
  options: BackTranslateResponseOptions,
): Promise<BackTranslateResponseResult> {
  const cwd = options.cwd ?? process.cwd();
  const projectRoot = resolveProjectRoot(cwd, options.projectRootHint);
  const projectSlug = resolveProjectSlug(cwd, options.projectSlug, options.projectRootHint);
  const originalText = options.text;
  const config = await loadTranslateConfig();

  const baseResult = {
    originalText,
    projectSlug,
  };

  if (!config.enabled) {
    return {
      ...baseResult,
      text: originalText,
      skipped: true,
      reason: 'disabled',
    };
  }

  if (!config.responseBackTranslate && !options.force) {
    return {
      ...baseResult,
      text: originalText,
      skipped: true,
      reason: 'back_translate_disabled',
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

  if (!options.force && originalText.trim().length === 0) {
    return {
      ...baseResult,
      text: originalText,
      skipped: true,
      reason: 'empty_response',
    };
  }

  const cyrillicRatio = countCyrillicRatio(originalText);
  if (!options.force && cyrillicRatio >= 0.15) {
    return {
      ...baseResult,
      text: originalText,
      skipped: true,
      reason: 'already_ru',
    };
  }

  const [glossaryTerms, customRules] = await Promise.all([
    loadGlossaryTerms(projectRoot),
    loadTranslateRules(projectRoot),
  ]);
  const systemPrompt = buildBackTranslateSystemPrompt(customRules);
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
      contentLabel: 'Agent response',
      allowFallback: true,
    });
    translatedText = result.text;
    modelUsed = result.modelUsed;
    usedFallback = result.usedFallback;

    if (result.quotaExhausted) {
      await markDocTranslateQuotaExhausted('openai quota exhausted for back-translation');
      return {
        ...baseResult,
        text: originalText,
        skipped: true,
        reason: 'quota_exhausted',
        modelUsed,
        usedFallback,
      };
    }
  } else if (provider === 'claude-cli') {
    const result = translateTextClaudeCli(originalText, {
      model: config.model,
      fallbackModel: config.docFallbackModel,
      glossaryTerms,
      systemPrompt,
      contentLabel: 'Agent response',
      allowFallback: true,
    });
    translatedText = result.text;
    modelUsed = result.modelUsed;
    usedFallback = result.usedFallback;

    if (result.quotaExhausted) {
      await markDocTranslateQuotaExhausted('claude-cli quota exhausted for back-translation');
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
      contentLabel: 'Agent response',
      allowFallback: true,
    });
    translatedText = result.text;
    modelUsed = result.modelUsed;
    usedFallback = result.usedFallback;

    if (result.quotaExhausted) {
      await markDocTranslateQuotaExhausted('cursor-cli quota exhausted for back-translation');
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

  if (!options.skipMetrics) {
    await logPromptTranslateMetrics({
      direction: 'en_ru',
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
  };
}
