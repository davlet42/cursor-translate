import { basename } from 'node:path';
import { countCyrillicRatio } from '../detect/count-cyrillic-ratio.js';
import { countLazyReadTranslateUnits } from './exceeds-lazy-read-limit.js';
import { estimateDocTranslateCost } from '../metrics/log-doc-cache-metrics.js';
import { estimateTokenSavings } from '../metrics/estimate-token-savings.js';

const MAIN_AGENT_USD_PER_MILLION = 3;
const HAIKU_BLEND_USD_PER_MILLION = 2.2;

export function formatLazyDeferredHint(
  sourcePath: string,
  sourceRaw: string,
  cliName: 'cursor-translate' | 'claude-translate',
): string {
  const label = basename(sourcePath);
  const chars = sourceRaw.length;
  const chunks = countLazyReadTranslateUnits(sourceRaw, 'block');
  const cyrillicRatio = countCyrillicRatio(sourceRaw);
  const savings = estimateTokenSavings(sourceRaw, cyrillicRatio, 0);
  const enCharsEst = Math.max(1, savings.enTokensEst * 4);
  const warmupTokensEst = estimateDocTranslateCost(sourceRaw, 'x'.repeat(enCharsEst));
  const savedUsd = ((savings.savedTokensEst / 1_000_000) * MAIN_AGENT_USD_PER_MILLION).toFixed(2);
  const warmupUsd = ((warmupTokensEst / 1_000_000) * HAIKU_BLEND_USD_PER_MILLION).toFixed(2);

  return (
    `${cliName}: ${label} (${chars.toLocaleString('en-US')} chars, ~${chunks} translate units) — ` +
    `lazy translate skipped; reading Russian source. ` +
    `Pre-warm: ${cliName} doc ${label}. ` +
    `Est. warmup ~${warmupTokensEst.toLocaleString('en-US')} tokens (~$${warmupUsd}); ` +
    `est. savings ~${savings.savedTokensEst.toLocaleString('en-US')} main-agent tokens per read (~$${savedUsd}).`
  );
}
