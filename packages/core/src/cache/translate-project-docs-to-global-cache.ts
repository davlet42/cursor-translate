import { translateDocToGlobalCache, type TranslateDocResult } from './translate-doc-to-global-cache.js';
import {
  findMarkdownFilesWithCyrillic,
  type MarkdownCandidate,
} from '../discover/find-markdown-files-with-cyrillic.js';
import { resolveProjectSlug } from '../project/resolve-project-slug.js';

export interface TranslateProjectDocsOptions {
  cwd?: string;
  scopePath?: string;
  projectSlug?: string;
  force?: boolean;
  dryRun?: boolean;
  minCyrillicRatio?: number;
  minChars?: number;
  includeGitignored?: boolean;
  provider?: 'cursor-cli' | 'openai';
  model?: string;
}

export interface TranslateProjectDocsResult {
  projectRoot: string;
  projectSlug: string;
  scannedMarkdown: number;
  withCyrillic: number;
  translated: number;
  skippedUpToDate: number;
  planned: number;
  items: TranslateDocResult[];
  candidates: MarkdownCandidate[];
}

export async function translateProjectDocsToGlobalCache(
  options: TranslateProjectDocsOptions,
): Promise<TranslateProjectDocsResult> {
  const cwd = options.cwd ?? process.cwd();
  const projectSlug = resolveProjectSlug(cwd, options.projectSlug);
  const candidates = await findMarkdownFilesWithCyrillic({
    rootDir: cwd,
    scopePath: options.scopePath,
    minCyrillicRatio: options.minCyrillicRatio,
    minChars: options.minChars,
    scanMode: options.includeGitignored ? 'all' : 'tracked',
  });

  const items: TranslateDocResult[] = [];
  let translated = 0;
  let skippedUpToDate = 0;

  for (const candidate of candidates) {
    const result = await translateDocToGlobalCache({
      sourcePath: candidate.relativePath,
      cwd,
      projectSlug,
      force: options.force,
      dryRun: options.dryRun,
      provider: options.provider,
      model: options.model,
      metricsTrigger: 'batch_docs',
    });

    items.push(result);

    if (result.skipped && result.reason === 'up_to_date') {
      skippedUpToDate += 1;
    } else if (!result.skipped && result.reason === 'translated') {
      translated += 1;
    }
  }

  return {
    projectRoot: cwd,
    projectSlug,
    scannedMarkdown: candidates.length,
    withCyrillic: candidates.length,
    translated,
    skippedUpToDate,
    planned: options.dryRun ? candidates.length : translated + skippedUpToDate,
    items,
    candidates,
  };
}
