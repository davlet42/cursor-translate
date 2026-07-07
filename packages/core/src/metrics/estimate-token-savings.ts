export interface TokenSavingsEstimate {
  ruTokensEst: number;
  enTokensEst: number;
  savedTokensEst: number;
  shouldTranslate: boolean;
  reason: string;
}

const CYRILLIC_TOKEN_MULTIPLIER = 1.8;
const EN_COMPRESSION_RATIO = 0.55;

export function estimateTokenSavings(
  text: string,
  cyrillicRatio: number,
  minChars: number,
  minCyrillicRatio = 0.15,
): TokenSavingsEstimate {
  const len = text.length;

  if (len < minChars) {
    return {
      ruTokensEst: Math.ceil(len / 3),
      enTokensEst: Math.ceil(len / 3),
      savedTokensEst: 0,
      shouldTranslate: false,
      reason: 'below_min_chars',
    };
  }

  if (cyrillicRatio < minCyrillicRatio) {
    return {
      ruTokensEst: Math.ceil(len / 4),
      enTokensEst: Math.ceil(len / 4),
      savedTokensEst: 0,
      shouldTranslate: false,
      reason: 'low_cyrillic_ratio',
    };
  }

  const ruTokensEst = Math.ceil((len / 3) * CYRILLIC_TOKEN_MULTIPLIER);
  const enTokensEst = Math.ceil(ruTokensEst * EN_COMPRESSION_RATIO);
  const savedTokensEst = ruTokensEst - enTokensEst;
  const shouldTranslate = savedTokensEst > 50;

  return {
    ruTokensEst,
    enTokensEst,
    savedTokensEst,
    shouldTranslate,
    reason: shouldTranslate ? 'long_ru_prose' : 'breakeven_skip',
  };
}
