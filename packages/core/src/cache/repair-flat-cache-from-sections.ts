import { mkdir, access, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ActiveCacheIncrementalMode } from '../markdown/split-for-incremental-cache.js';
import { splitForIncrementalCache } from '../markdown/split-for-incremental-cache.js';
import type { DocCacheMeta } from './doc-cache-meta.interface.js';
import { formatDocCache, parseDocCache } from './parse-doc-cache.js';
import {
  assembleSectionTranslatedBody,
  readSectionSidecar,
  resolveSectionSidecarPath,
} from './section-doc-cache.js';

export async function writeFlatDocCacheAtomic(cachePath: string, content: string): Promise<void> {
  await mkdir(dirname(cachePath), { recursive: true });
  const tmpPath = `${cachePath}.${process.pid}.tmp`;
  await writeFile(tmpPath, content, 'utf8');
  await rename(tmpPath, cachePath);
}

export async function flatCacheMatchesSha(cachePath: string, sourceSha256: string): Promise<boolean> {
  try {
    const raw = await readFile(cachePath, 'utf8');
    const parsed = parseDocCache(raw);
    return Boolean(parsed && parsed.meta.sourceSha256 === sourceSha256);
  } catch {
    return false;
  }
}

export async function repairFlatCacheFromSections(
  cachePath: string,
  sourceRaw: string,
  meta: DocCacheMeta,
  incrementalMode: ActiveCacheIncrementalMode = meta.incremental ?? 'block',
): Promise<boolean> {
  if (await flatCacheMatchesSha(cachePath, meta.sourceSha256)) {
    return true;
  }

  const sections = splitForIncrementalCache(sourceRaw, incrementalMode);
  if (!sections.length) {
    return false;
  }

  const sidecar = await readSectionSidecar(cachePath);
  if (!sidecar.size) {
    return false;
  }

  for (const section of sections) {
    if (!sidecar.has(section.sectionKey)) {
      return false;
    }
  }

  const body = assembleSectionTranslatedBody(sections, sidecar);
  await writeFlatDocCacheAtomic(cachePath, formatDocCache(meta, body));
  return true;
}

export async function sidecarExists(cachePath: string): Promise<boolean> {
  try {
    await access(resolveSectionSidecarPath(cachePath));
    return true;
  } catch {
    return false;
  }
}
