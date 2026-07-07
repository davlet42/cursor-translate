import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveTranslateHome } from '../config/resolve-translate-home.js';
import { parseDocCache } from '../cache/parse-doc-cache.js';
import { appendMetricsEntry, resolveMetricsPath } from './append-metrics-entry.js';
import { estimateDocTranslateCost } from './log-doc-cache-metrics.js';
import { countCyrillicRatio } from '../detect/count-cyrillic-ratio.js';

export interface BackfillTranslateCostsOptions {
  projectSlug?: string;
  dryRun?: boolean;
}

export interface BackfillTranslateCostsResult {
  scannedCacheFiles: number;
  backfilled: number;
  skippedExisting: number;
  skippedMissingSource: number;
  totalCostTokensEst: number;
  metricsPath: string;
}

async function walkCacheFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkCacheFiles(fullPath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.en.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

async function loadExistingCostKeys(metricsPath: string): Promise<Set<string>> {
  const keys = new Set<string>();
  try {
    const raw = await readFile(metricsPath, 'utf8');
    for (const line of raw.split('\n')) {
      if (!line.trim()) {
        continue;
      }
      try {
        const entry = JSON.parse(line) as {
          source?: string;
          file_path?: string;
          reason?: string;
        };
        if (entry.source !== 'doc_translate_cost' || !entry.file_path) {
          continue;
        }
        keys.add(entry.file_path);
      } catch {
        // ignore malformed lines
      }
    }
  } catch {
    // no metrics yet
  }
  return keys;
}

export async function backfillTranslateCosts(
  options: BackfillTranslateCostsOptions = {},
): Promise<BackfillTranslateCostsResult> {
  const cacheRoot = join(resolveTranslateHome(), 'cache');
  const metricsPath = resolveMetricsPath();
  const existing = await loadExistingCostKeys(metricsPath);

  let cacheDirs: string[];
  if (options.projectSlug) {
    cacheDirs = [join(cacheRoot, options.projectSlug)];
  } else {
    try {
      const entries = await readdir(cacheRoot, { withFileTypes: true });
      cacheDirs = entries.filter((e) => e.isDirectory()).map((e) => join(cacheRoot, e.name));
    } catch {
      return {
        scannedCacheFiles: 0,
        backfilled: 0,
        skippedExisting: 0,
        skippedMissingSource: 0,
        totalCostTokensEst: 0,
        metricsPath,
      };
    }
  }

  const cacheFiles: string[] = [];
  for (const dir of cacheDirs) {
    try {
      cacheFiles.push(...(await walkCacheFiles(dir)));
    } catch {
      // project cache dir missing
    }
  }

  let backfilled = 0;
  let skippedExisting = 0;
  let skippedMissingSource = 0;
  let totalCostTokensEst = 0;

  for (const cachePath of cacheFiles) {
    let cachedRaw: string;
    try {
      cachedRaw = await readFile(cachePath, 'utf8');
    } catch {
      skippedMissingSource += 1;
      continue;
    }

    const parsed = parseDocCache(cachedRaw);
    if (!parsed) {
      skippedMissingSource += 1;
      continue;
    }

    const sourcePath = parsed.meta.sourcePath;
    if (existing.has(sourcePath)) {
      skippedExisting += 1;
      continue;
    }

    let sourceRaw: string;
    try {
      sourceRaw = await readFile(sourcePath, 'utf8');
    } catch {
      skippedMissingSource += 1;
      continue;
    }

    const translatedBody = parsed.body;
    const cost = estimateDocTranslateCost(sourceRaw, translatedBody);
    totalCostTokensEst += cost;

    if (!options.dryRun) {
      const cyrillicRatio = countCyrillicRatio(sourceRaw);
      await appendMetricsEntry({
        source: 'doc_translate_cost',
        reason: 'backfill_warmup_translate',
        action: 'translated',
        file_path: sourcePath,
        cache_path: cachePath,
        project_slug: parsed.meta.projectSlug,
        translate_model: 'gpt-5.4-nano-none',
        ru_tokens_est: 0,
        en_tokens_est: 0,
        saved_tokens_est: 0,
        translate_cost_tokens_est: cost,
        cyrillic_ratio: Number(cyrillicRatio.toFixed(3)),
        text_chars: sourceRaw.length,
        served_chars: translatedBody.length,
        skipped: false,
      });
      existing.add(sourcePath);
    }

    backfilled += 1;
  }

  return {
    scannedCacheFiles: cacheFiles.length,
    backfilled,
    skippedExisting,
    skippedMissingSource: skippedMissingSource,
    totalCostTokensEst,
    metricsPath,
  };
}
