import { countCyrillicRatio } from '../detect/count-cyrillic-ratio.js';
import { estimateTokenSavings } from './estimate-token-savings.js';
import { appendMetricsEntry } from './append-metrics-entry.js';

export interface PromptTranslateMetricsInput {
  direction: 'ru_en' | 'en_ru';
  originalText: string;
  translatedText: string;
  skipped: boolean;
  reason: string;
  translateModel?: string;
  usedFallback?: boolean;
  projectSlug?: string;
}

function estimateTranslateCost(originalText: string, translatedText: string): number {
  const cyrillicRatio = countCyrillicRatio(originalText);
  const inputEst = estimateTokenSavings(originalText, cyrillicRatio, 0).ruTokensEst;
  const outputEst = Math.ceil(translatedText.length / 4);
  return inputEst + outputEst;
}

function estimateEnTokens(charCount: number): number {
  return Math.ceil(charCount / 4);
}

export async function logPromptTranslateMetrics(input: PromptTranslateMetricsInput): Promise<void> {
  const cyrillicRatio = countCyrillicRatio(input.originalText);
  const ruSide = estimateTokenSavings(
    input.originalText,
    cyrillicRatio,
    0,
    0,
  );
  const enTokensEst = estimateEnTokens(input.translatedText.length);
  const savedTokensEst =
    input.direction === 'ru_en' && !input.skipped
      ? Math.max(0, ruSide.ruTokensEst - enTokensEst)
      : 0;
  const translateCost =
    input.skipped || input.translatedText === input.originalText
      ? 0
      : estimateTranslateCost(input.originalText, input.translatedText);

  const source =
    input.direction === 'ru_en' ? 'prompt_translated' : 'response_back_translated';

  await appendMetricsEntry({
    source,
    reason: input.reason,
    action: input.skipped ? 'skipped' : 'translated',
    project_slug: input.projectSlug,
    translate_model: input.translateModel,
    used_fallback: input.usedFallback,
    ru_tokens_est: ruSide.ruTokensEst,
    en_tokens_est: enTokensEst,
    saved_tokens_est: savedTokensEst,
    translate_cost_tokens_est: translateCost,
    cyrillic_ratio: Number(cyrillicRatio.toFixed(3)),
    text_chars: input.originalText.length,
    served_chars: input.translatedText.length,
    skipped: input.skipped,
  });
}
