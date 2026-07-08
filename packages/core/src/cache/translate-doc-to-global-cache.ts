import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { sha256Hex } from '../hash/sha256-hex.js';
import { resolveProjectSlug } from '../project/resolve-project-slug.js';
import { resolveProjectRoot } from '../project/resolve-project-root.js';
import { loadGlossaryTerms } from '../glossary/load-glossary-terms.js';
import { translateMarkdownOpenAi } from '../translate/translate-markdown-openai.js';
import { translateMarkdownCursorCli } from '../translate/translate-markdown-cursor-cli.js';
import { translateMarkdownClaudeCli } from '../translate/translate-markdown-claude-cli.js';
import { resolveProviderFromEnv } from '../translate/translate-provider.js';
import type { TranslateProvider } from '../translate/translate-provider.js';
import { loadTranslateConfig } from '../config/load-translate-config.js';
import { loadTranslateRules } from '../rules/load-translate-rules.js';
import {
  clearDocTranslateQuotaState,
  markDocTranslateQuotaExhausted,
} from '../quota/doc-translate-quota-state.js';
import { logDocTranslateCost } from '../metrics/log-doc-cache-metrics.js';
import { resolveGlobalCachePath } from './resolve-global-cache-path.js';
import { copyFreshSiblingCache } from './sibling-cache.js';
import { formatDocCache, parseDocCache } from './parse-doc-cache.js';
import type { DocCacheMeta } from './doc-cache-meta.interface.js';

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

  // Before spending on a translation, try to reuse a fresh cache entry from a
  // sibling install (cursor-translate ↔ claude-translate share the format).
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

  let translatedBody: string;
  let translateModel = model;
  let usedFallback = false;

  if (provider === 'openai') {
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required when CURSOR_TRANSLATE_PROVIDER=openai');
    }
    const result = await translateMarkdownOpenAi(sourceRaw, {
      apiKey,
      model,
      fallbackModel: docFallbackModel,
      glossaryTerms,
      customRules,
      allowFallback: true,
    });
    translatedBody = result.text;
    translateModel = result.modelUsed;
    usedFallback = result.usedFallback;

    if (result.quotaExhausted) {
      await markDocTranslateQuotaExhausted('openai quota exhausted for doc translation');
      return {
        sourcePath,
        cachePath,
        projectSlug,
        provider,
        translateModel,
        skipped: true,
        reason: 'quota_exhausted',
        sourceSha256,
        usedFallback,
      };
    }
  } else if (provider === 'claude-cli') {
    const result = translateMarkdownClaudeCli(sourceRaw, {
      model,
      fallbackModel: docFallbackModel,
      glossaryTerms,
      customRules,
      allowFallback: true,
    });
    translatedBody = result.text;
    translateModel = result.modelUsed;
    usedFallback = result.usedFallback;

    if (result.quotaExhausted) {
      await markDocTranslateQuotaExhausted('claude-cli quota exhausted for doc translation');
      return {
        sourcePath,
        cachePath,
        projectSlug,
        provider,
        translateModel,
        skipped: true,
        reason: 'quota_exhausted',
        sourceSha256,
        usedFallback,
      };
    }
  } else {
    const result = translateMarkdownCursorCli(sourceRaw, {
      model,
      fallbackModel: docFallbackModel,
      glossaryTerms,
      customRules,
      allowFallback: true,
    });
    translatedBody = result.text;
    translateModel = result.modelUsed;
    usedFallback = result.usedFallback;

    if (result.quotaExhausted) {
      await markDocTranslateQuotaExhausted('cursor-cli quota exhausted for doc translation');
      return {
        sourcePath,
        cachePath,
        projectSlug,
        provider,
        translateModel,
        skipped: true,
        reason: 'quota_exhausted',
        sourceSha256,
        usedFallback,
      };
    }
  }

  await clearDocTranslateQuotaState();

  const meta: DocCacheMeta = {
    cursorTranslateVersion: 1,
    sourcePath,
    sourceSha256,
    generatedAt: new Date().toISOString(),
    projectSlug,
  };

  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, formatDocCache(meta, translatedBody), 'utf8');

  if (!options.skipMetrics) {
    await logDocTranslateCost({
      sourcePath,
      cachePath,
      projectSlug,
      sourceRaw,
      translatedBody,
      translateModel,
      usedFallback,
      trigger: options.metricsTrigger ?? 'doc_cli',
    });
  }

  return {
    sourcePath,
    cachePath,
    projectSlug,
    provider,
    translateModel,
    skipped: false,
    reason: 'translated',
    sourceSha256,
    usedFallback,
  };
}
