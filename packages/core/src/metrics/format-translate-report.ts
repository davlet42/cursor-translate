import type { TranslateReportResult } from './aggregate-translate-report.js';
import { estimateBreakEvenReads } from './aggregate-translate-report.js';

export interface FormatTranslateReportOptions {
  brand: string;
  translateSpendRateLabel: string;
  formatMainAgentSavingsUsd: (tokens: number) => string;
  formatTranslateSpendUsd: (tokens: number) => string;
}

function formatSignedTokens(value: number): string {
  if (value > 0) {
    return `+${value}`;
  }
  return String(value);
}

export function formatTranslateReport(
  result: TranslateReportResult,
  options: FormatTranslateReportOptions,
): string {
  const operationalSavingsUsd = options.formatMainAgentSavingsUsd(
    result.operationalSavingsTokensEst,
  );
  const operationalSpendUsd = options.formatTranslateSpendUsd(
    result.operationalTranslateCostTokensEst,
  );
  const operationalNetUsd = (
    Number(operationalSavingsUsd) - Number(operationalSpendUsd)
  ).toFixed(2);

  const fullSavingsUsd = options.formatMainAgentSavingsUsd(result.fullEconomySavingsTokensEst);
  const fullNetUsd = (Number(fullSavingsUsd) - Number(operationalSpendUsd)).toFixed(2);

  const warmupSpendUsd = options.formatTranslateSpendUsd(result.docWarmupCostTokensEst);
  const warmupBreakEvenReads = estimateBreakEvenReads(
    result.docWarmupCostTokensEst,
    result.docSavingsTokensEst,
    result.docCacheServedEvents,
  );
  const incrementalBreakEvenReads = estimateBreakEvenReads(
    result.docIncrementalCostTokensEst,
    result.docSavingsTokensEst,
    result.docCacheServedEvents,
  );

  const lines: string[] = [
    `${options.brand} report (last ${result.days} days)`,
    `  metrics: ${result.metricsPath}`,
    `  events: ${result.totalEvents}`,
    '',
    '  ROI operational (docs + CLI/MCP prompts — excludes display & warmup):',
    `    doc cache served (lazy read / MCP resolve_doc): ~${result.docSavingsTokensEst} tokens saved (${result.docCacheServedEvents} reads)`,
    `    prompt translated RU→EN (CLI + MCP): ~${result.promptSavingsTokensEst} tokens saved`,
    `    incremental doc translate: ~${result.docIncrementalCostTokensEst} tokens`,
    `    prompt/display translate tier cost: ~${result.promptTranslateCostTokensEst} tokens`,
    `    net operational ROI: ~${formatSignedTokens(result.operationalNetRoiTokensEst)} tokens`,
    `    est. main-agent context saved: ~$${operationalSavingsUsd} (@ ~$3/1M)`,
    `    est. translate tier spend: ~$${operationalSpendUsd} (${options.translateSpendRateLabel})`,
    `    est. net operational USD: ~$${operationalNetUsd} (saved − translate spend)`,
    '',
    '  ROI full economy (operational + EN transcript via display / english_replies):',
    `    display transcript EN kept: ~${result.displayTranscriptSavingsTokensEst} tokens saved (${result.displayBackTranslateEvents} display translates)`,
    `    total main-agent savings: ~${result.fullEconomySavingsTokensEst} tokens`,
    `    net full economy: ~${formatSignedTokens(result.fullEconomyNetRoiTokensEst)} tokens`,
    `    est. total main-agent context saved: ~$${fullSavingsUsd} (@ ~$3/1M)`,
    `    est. net full economy USD: ~$${fullNetUsd} (total saved − translate spend)`,
  ];

  if (result.actualSpendEvents > 0) {
    lines.push(
      `    actual translate spend: $${result.actualSpendUsd.toFixed(4)} (${result.actualSpendEvents} calls with claude receipts)`,
    );
  }

  lines.push(
    '',
    '  ROI investment (one-time doc cache warmup):',
    `    batch docs warmup cost: ~${result.docWarmupCostTokensEst} tokens (~$${warmupSpendUsd} ${options.translateSpendRateLabel})`,
  );

  if (warmupBreakEvenReads !== null) {
    lines.push(
      `    break-even reads (warmup ÷ avg savings/read): ~${warmupBreakEvenReads} more doc_cache_served events`,
    );
  } else if (result.docWarmupCostTokensEst > 0) {
    lines.push('    break-even reads (warmup): n/a (no doc_cache_served events in window yet)');
  }

  if (result.docIncrementalCostTokensEst > 0) {
    if (incrementalBreakEvenReads !== null) {
      lines.push(
        `    break-even reads (incremental doc spend ÷ avg savings/read): ~${incrementalBreakEvenReads} more doc_cache_served events`,
      );
    } else {
      lines.push('    break-even reads (incremental): n/a (no doc_cache_served events in window yet)');
    }
  }

  lines.push(
    '',
    '  ROI combined (legacy — includes warmup in spend):',
    `    total narrow context saved: ~${result.realizedSavingsTokensEst} tokens`,
    `    total translate spend: ~${result.translateCostTokensEst} tokens`,
    `    net ROI: ~${formatSignedTokens(result.netDocRoiTokensEst)} tokens`,
    '',
    '  session opportunity (interactive Claude/Cursor — not auto-translated):',
    `    user_prompt (RU sent as-is to main model): ~${result.userPromptOpportunityTokensEst} tokens (${result.bySource.user_prompt?.events ?? 0} events)`,
    `    agent_response + other audits: ~${result.sessionOpportunityTokensEst - result.userPromptOpportunityTokensEst} tokens`,
    `    total session opportunity: ~${result.sessionOpportunityTokensEst} tokens`,
    '',
    '  by source:',
  );

  const sources = Object.keys(result.bySource).sort();
  if (!sources.length) {
    lines.push('    (no events yet)');
  } else {
    for (const source of sources) {
      const row = result.bySource[source];
      let line = `    ${source}: ${row.events} events`;
      if (row.savedTokensEst > 0) {
        line += `, ~${row.savedTokensEst} saved tokens`;
      }
      if (row.translateCostTokensEst > 0) {
        line += `, ~${row.translateCostTokensEst} translate cost tokens`;
      }
      line += `, ${row.chars} chars`;
      if (source === 'subagent_summary' && row.subagentRuns > 0) {
        line += `, ${row.subagentRuns} runs, ${row.toolCalls} tool calls`;
      }
      lines.push(line);
    }
  }

  lines.push('');
  lines.push('  notes:');
  lines.push('    - doc_cache_served = EN cache served (lazy Read hook or MCP resolve_doc)');
  lines.push('    - prompt_translated = RU→EN via `*-translate agent` / `prompt` or MCP translate');
  lines.push(
    '    - response_back_translated = display EN→RU; saved tokens = EN kept in transcript (english_replies / MessageDisplay)',
  );
  lines.push('    - doc_translate_cost (warmup) = batch `*-translate docs` — one-time cache investment');
  lines.push('    - doc_translate_cost (incremental) = on-demand translate (cache miss/stale)');
  lines.push(
    '    - user_prompt = interactive session audit only (terminal `claude` with plugin OR IDE); use `*-translate agent` for realized prompt savings',
  );
  lines.push('    - operational ROI excludes display transcript savings; see full economy section');
  lines.push('    - operational ROI excludes warmup; use break-even reads to judge cache payback');

  return lines.join('\n');
}
