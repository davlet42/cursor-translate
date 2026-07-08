const CYRILLIC_TOKEN_MULTIPLIER = 1.8;
const EN_COMPRESSION_RATIO = 0.55;

export interface TranscriptEnSavingsEstimate {
  ruTokensEst: number;
  enTokensEst: number;
  savedTokensEst: number;
}

export function estimateTranscriptEnSavings(charCount: number): TranscriptEnSavingsEstimate {
  if (charCount <= 0) {
    return { ruTokensEst: 0, enTokensEst: 0, savedTokensEst: 0 };
  }

  const base = Math.ceil(charCount / 3);
  const ruTokensEst = Math.ceil(base * CYRILLIC_TOKEN_MULTIPLIER);
  const enTokensEst = Math.ceil(ruTokensEst * EN_COMPRESSION_RATIO);

  return {
    ruTokensEst,
    enTokensEst,
    savedTokensEst: Math.max(0, ruTokensEst - enTokensEst),
  };
}
