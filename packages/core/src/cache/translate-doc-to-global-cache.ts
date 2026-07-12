import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { sha256Hex } from '../hash/sha256-hex.js';
import { resolveProjectSlug } from '../project/resolve-project-slug.js';
import { resolveProjectRoot } from '../project/resolve-project-root.js';
import { loadGlossaryTerms } from '../glossary/load-glossary-terms.js';
import { resolveProviderFromEnv } from '../translate/translate-provider.js';
import type { TranslateProvider } from '../translate/translate-provider.js';
import { loadTranslateConfig } from '../config/load-translate-config.js';
import { loadTranslateRules } from '../rules/load-translate-rules.js';
import {
  clearDocTranslateQuotaState,
  markDocTranslateQuotaExhausted,
} from '../quota/doc-translate-quota-state.js';
import { logDocTranslateCost } from '../metrics/log-doc-cache-metrics.js';
import { maybeGcOrphanedCaches } from './gc-orphaned-caches.js';
import { resolveGlobalCachePath } from './resolve-global-cache-path.js';
import { copyFreshSiblingCache } from './sibling-cache.js';
import { formatDocCache, parseDocCache } from './parse-doc-cache.js';
import type { DocCacheMeta } from './doc-cache-meta.interface.js';
import { splitMarkdownSections } from '../markdown/split-markdown-sections.js';
import {
  assembleSectionTranslatedBody,
  readSectionSidecar,
  writeSectionSidecar,
} from './section-doc-cache.js';
import {
  flatCacheMatchesSha,
  repairFlatCacheFromSections,
  writeFlatDocCacheAtomic,
} from './repair-flat-cache-from-sections.js';
import { translateMarkdownWithProvider } from '../translate/translate-markdown-with-provider.js';

export type { TranslateProvider } from '../translate/translate-provider.js';

export interface TranslateDocOptions {
  sourcePath: string;
  cwd?: string;
  projectSlug?: string;
  force?: boolean;
  dryRun?: boolean;
  provider?: TranslateProvider;
  apiKey?: string;
  model?: string;
  docFallbackModel?: string;
  metricsTrigger?: 'lazy_read' | 'batch_docs' | 'doc_cli';
  skipMetrics?: boolean;
}

export interface TranslateDocResult {
  sourcePath: string;
  cachePath: string;
  projectSlug: string;
  provider: TranslateProvider;
  translateModel: string;
  skipped: boolean;
  reason: 'up_to_date' | 'sibling_copy' | 'dry_run' | 'translated' | 'quota_exhausted';
  sourceSha256: string;
  usedFallback?: boolean;
}

function resolveProvider(explicit: TranslateProvider | undefined, fromConfig: TranslateProvider): TranslateProvider {
  return explicit ?? resolveProviderFromEnv() ?? fromConfig;
}

async function readExistingSha(cachePath: string): Promise<string | null> {
  try {
    const raw = await readFile(cachePath, 'utf8');
    return parseDocCache(raw)?.meta.sourceSha256 ?? null;
  } catch {
    return null;
  }
}

async function translateFullDocument(
  sourceRaw: string,
  options: {
    provider: TranslateProvider;
    model: string;
    docFallbackModel: string;
    glossaryTerms: string[];
    customRules: string | null;
    apiKey?: string;
  },
): Promise<{
  translatedBody: string;
  translateModel: string;
  usedFallback: boolean;
  translateCostUsd?: number;
  quotaExhausted: boolean;
}> {
  const result = await translateMarkdownWithProvider(sourceRaw, {
    provider: options.provider,
    model: options.model,
    docFallbackModel: options.docFallbackModel,
    glossaryTerms: options.glossaryTerms,
    customRules: options.customRules,
    apiKey: options.apiKey,
    allowFallback: true,
  });

  return {
    translatedBody: result.text,
    translateModel: result.modelUsed,
    usedFallback: result.usedFallback,
    translateCostUsd: result.costUsd,
    quotaExhausted: result.quotaExhausted,
  };
}

async function translateIncrementalSections(
  sourceRaw: string,
  cachePath: string,
  options: {
    provider: TranslateProvider;
    model: string;
    docFallbackModel: string;
    glossaryTerms: string[];
    customRules: string | null;
    apiKey?: string;
    force?: boolean;
  },
): Promise<{
  translatedBody: string;
  sectionEntries: Record<string, string>;
  translateModel: string;
  usedFallback: boolean;
  translateCostUsd?: number;
  quotaExhausted: boolean;
}> {
  const sections = splitMarkdownSections(sourceRaw);
  const existingSections = options.force ? new Map<string, string>() : await readSectionSidecar(cachePath);
  const translatedByKey = new Map<string, string>();
  let translateModel = options.model;
  let usedFallback = false;
  let translateCostUsd: number | undefined;
  let quotaExhausted = false;

  for (const section of sections) {
    const cached = existingSections.get(section.sectionKey);
    if (cached && !options.force) {
      translatedByKey.set(section.sectionKey, cached);
      continue;
    }

    const result = await translateMarkdownWithProvider(section.sourceText, {
      provider: options.provider,
      model: options.model,
      docFallbackModel: options.docFallbackModel,
      glossaryTerms: options.glossaryTerms,
      customRules: options.customRules,
      apiKey: options.apiKey,
      allowFallback: true,
    });

    translateModel = result.modelUsed;
    usedFallback = usedFallback || result.usedFallback;
    if (result.costUsd !== undefined) {
      translateCostUsd = (translateCostUsd ?? 0) + result.costUsd;
    }

    if (result.quotaExhausted) {
      quotaExhausted = true;
      if (cached) {
        translatedByKey.set(section.sectionKey, cached);
        continue;
      }
      translatedByKey.set(section.sectionKey, section.sourceText);
      continue;
    }

    translatedByKey.set(section.sectionKey, result.text);
  }

  const translatedBody = assembleSectionTranslatedBody(sections, translatedByKey);

  return {
    translatedBody,
    sectionEntries: Object.fromEntries(translatedByKey.entries()),
    translateModel,
    usedFallback,
    translateCostUsd,
    quotaExhausted,
  };
}

export async function translateDocToGlobalCache(
  options: TranslateDocOptions,
): Promise<TranslateDocResult> {
  const cwd = options.cwd ?? process.cwd();
  const sourcePath = resolve(cwd, options.sourcePath);
  const projectRoot = resolveProjectRoot(cwd, sourcePath);
  const sourceRaw = await readFile(sourcePath, 'utf8');
  const sourceSha256 = sha256Hex(sourceRaw);
  const projectSlug = resolveProjectSlug(cwd, options.projectSlug, sourcePath);
  const cachePath = resolveGlobalCachePath(projectSlug, sourcePath, projectRoot);
  const config = await loadTranslateConfig();
  const provider = resolveProvider(options.provider, config.provider);
  const model = options.model ?? config.model;
  const docFallbackModel = options.docFallbackModel ?? config.docFallbackModel;

  const existingSha = await readExistingSha(cachePath);
  if (!options.force && existingSha === sourceSha256) {
    return {
      sourcePath,
      cachePath,
      projectSlug,
      provider,
      translateModel: model,
      skipped: true,
      reason: 'up_to_date',
      sourceSha256,
    };
  }

  if (
    !options.force &&
    config.cacheIncremental === 'section' &&
    !(await flatCacheMatchesSha(cachePath, sourceSha256))
  ) {
    const repaired = await repairFlatCacheFromSections(cachePath, sourceRaw, {
      cursorTranslateVersion: 2,
      sourcePath,
      sourceSha256,
      generatedAt: new Date().toISOString(),
      projectSlug,
      incremental: 'section',
    });
    if (repaired) {
      return {
        sourcePath,
        cachePath,
        projectSlug,
        provider,
        translateModel: model,
        skipped: true,
        reason: 'up_to_date',
        sourceSha256,
      };
    }
  }

  if (options.dryRun) {
    return {
      sourcePath,
      cachePath,
      projectSlug,
      provider,
      translateModel: model,
      skipped: true,
      reason: 'dry_run',
      sourceSha256,
    };
  }

  if (!options.force && config.shareSiblingCaches) {
    const sibling = await copyFreshSiblingCache({
      projectSlug,
      sourcePath,
      projectRoot,
      sourceSha256,
      targetCachePath: cachePath,
    });

    if (sibling) {
      return {
        sourcePath,
        cachePath,
        projectSlug,
        provider,
        translateModel: model,
        skipped: true,
        reason: 'sibling_copy',
        sourceSha256,
      };
    }
  }

  const [glossaryTerms, customRules] = await Promise.all([
    loadGlossaryTerms(projectRoot),
    loadTranslateRules(projectRoot),
  ]);

  const translateOptions = {
    provider,
    model,
    docFallbackModel,
    glossaryTerms,
    customRules,
    apiKey: options.apiKey,
    force: options.force,
  };

  const useIncremental = config.cacheIncremental === 'section';
  const translation = useIncremental
    ? await translateIncrementalSections(sourceRaw, cachePath, translateOptions)
    : await translateFullDocument(sourceRaw, translateOptions);
  const sectionEntries = useIncremental
    ? (translation as Awaited<ReturnType<typeof translateIncrementalSections>>).sectionEntries
    : undefined;

  if (translation.quotaExhausted) {
    await markDocTranslateQuotaExhausted(`${provider} quota exhausted for doc translation`);
    return {
      sourcePath,
      cachePath,
      projectSlug,
      provider,
      translateModel: translation.translateModel,
      skipped: true,
      reason: 'quota_exhausted',
      sourceSha256,
      usedFallback: translation.usedFallback,
    };
  }

  await clearDocTranslateQuotaState();

  const meta: DocCacheMeta = {
    cursorTranslateVersion: useIncremental ? 2 : 1,
    sourcePath,
    sourceSha256,
    generatedAt: new Date().toISOString(),
    projectSlug,
    incremental: useIncremental ? 'section' : undefined,
  };

  const flatContent = formatDocCache(meta, translation.translatedBody);
  await writeFlatDocCacheAtomic(cachePath, flatContent);

  if (sectionEntries) {
    await writeSectionSidecar(cachePath, sectionEntries);
  }

  if (!(await flatCacheMatchesSha(cachePath, sourceSha256))) {
    throw new Error(`Failed to write doc cache file: ${cachePath}`);
  }

  // A translation already ran (slow path) — cheap moment to sweep orphaned
  // caches of deleted/renamed docs, at most once a day.
  await maybeGcOrphanedCaches(config.gcOrphanDays);

  if (!options.skipMetrics) {
    await logDocTranslateCost({
      sourcePath,
      cachePath,
      projectSlug,
      sourceRaw,
      translatedBody: translation.translatedBody,
      translateModel: translation.translateModel,
      usedFallback: translation.usedFallback,
      trigger: options.metricsTrigger ?? 'doc_cli',
      translateCostUsd: translation.translateCostUsd,
    });
  }

  return {
    sourcePath,
    cachePath,
    projectSlug,
    provider,
    translateModel: translation.translateModel,
    skipped: false,
    reason: 'translated',
    sourceSha256,
    usedFallback: translation.usedFallback,
  };
}
