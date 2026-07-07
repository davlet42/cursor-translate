import { basename, join, relative, resolve } from 'node:path';
import { resolveTranslateHome } from '../config/resolve-translate-home.js';

function toCacheRelativePath(sourceRelativePath: string): string {
  const dot = sourceRelativePath.lastIndexOf('.');
  if (dot === -1) {
    return `${sourceRelativePath}.en.md`;
  }
  return `${sourceRelativePath.slice(0, dot)}.en${sourceRelativePath.slice(dot)}`;
}

export function resolveGlobalCachePath(
  projectSlug: string,
  sourceFilePath: string,
  projectRoot?: string,
): string {
  const absoluteSource = resolve(sourceFilePath);
  const sourceRelative = projectRoot
    ? relative(resolve(projectRoot), absoluteSource)
    : basename(absoluteSource);

  const cacheRelative = toCacheRelativePath(sourceRelative);

  return join(resolveTranslateHome(), 'cache', projectSlug, cacheRelative);
}
