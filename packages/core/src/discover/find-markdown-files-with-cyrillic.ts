import { execSync } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { countCyrillicRatio } from '../detect/count-cyrillic-ratio.js';

const HARD_IGNORE_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  '.next',
  'build',
  'vendor',
  'graphify-out',
]);

const TRACKED_ONLY_EXTRA_IGNORE_DIRS = new Set(['.cursor']);

export type MarkdownScanMode = 'tracked' | 'all';

export interface FindMarkdownOptions {
  rootDir: string;
  minCyrillicRatio?: number;
  minChars?: number;
  scopePath?: string;
  /** `tracked` = git ls-files only (default). `all` = filesystem walk incl. gitignored/private. */
  scanMode?: MarkdownScanMode;
}

export interface MarkdownCandidate {
  absolutePath: string;
  relativePath: string;
  cyrillicRatio: number;
  charCount: number;
}

function listMarkdownViaGit(rootDir: string): string[] | null {
  try {
    const output = execSync('git ls-files -z -- "*.md" ":(glob)**/*.md"', {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output.split('\0').filter((p) => p.endsWith('.md'));
  } catch {
    return null;
  }
}

function shouldSkipDir(name: string, scanMode: MarkdownScanMode): boolean {
  if (HARD_IGNORE_DIRS.has(name)) {
    return true;
  }
  if (scanMode === 'tracked' && TRACKED_ONLY_EXTRA_IGNORE_DIRS.has(name)) {
    return true;
  }
  return false;
}

async function walkMarkdownFiles(
  dir: string,
  rootDir: string,
  results: string[],
  scanMode: MarkdownScanMode,
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const absolute = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (shouldSkipDir(entry.name, scanMode)) {
        continue;
      }
      if (scanMode === 'tracked' && entry.name.startsWith('.')) {
        continue;
      }
      await walkMarkdownFiles(absolute, rootDir, results, scanMode);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.md') && !entry.name.endsWith('.en.md')) {
      results.push(relative(rootDir, absolute));
    }
  }
}

function isInScope(relativePath: string, scopePath?: string): boolean {
  if (!scopePath) {
    return true;
  }
  const normalizedScope = scopePath.replace(/^\.\//, '').replace(/\/$/, '');
  return relativePath === normalizedScope || relativePath.startsWith(`${normalizedScope}/`);
}

async function isMarkdownCandidate(
  absolutePath: string,
  minCyrillicRatio: number,
  minChars: number,
): Promise<MarkdownCandidate | null> {
  const fileStat = await stat(absolutePath);
  if (!fileStat.isFile()) {
    return null;
  }

  const content = await readFile(absolutePath, 'utf8');
  if (content.length < minChars) {
    return null;
  }

  const cyrillicRatio = countCyrillicRatio(content);
  if (cyrillicRatio < minCyrillicRatio) {
    return null;
  }

  return {
    absolutePath,
    relativePath: absolutePath,
    cyrillicRatio,
    charCount: content.length,
  };
}

async function collectRelativePaths(
  rootDir: string,
  scopeDir: string,
  scanMode: MarkdownScanMode,
  scopePath?: string,
): Promise<string[]> {
  let paths: string[];

  if (scanMode === 'all') {
    const walked: string[] = [];
    await walkMarkdownFiles(scopeDir, rootDir, walked, 'all');
    paths = walked;
  } else {
    const gitPaths = listMarkdownViaGit(rootDir);
    if (gitPaths) {
      paths = gitPaths.filter((path) => !path.endsWith('.en.md'));
    } else {
      const walked: string[] = [];
      await walkMarkdownFiles(scopeDir, rootDir, walked, 'tracked');
      paths = walked;
    }
  }

  return paths.filter((path) => isInScope(path, scopePath));
}

export async function findMarkdownFilesWithCyrillic(
  options: FindMarkdownOptions,
): Promise<MarkdownCandidate[]> {
  const rootDir = resolve(options.rootDir);
  const scopeDir = options.scopePath ? resolve(rootDir, options.scopePath) : rootDir;
  const minCyrillicRatio = options.minCyrillicRatio ?? 0.05;
  const minChars = options.minChars ?? 80;
  const scanMode = options.scanMode ?? 'tracked';

  const relativePaths = await collectRelativePaths(rootDir, scopeDir, scanMode, options.scopePath);

  const candidates: MarkdownCandidate[] = [];

  for (const rel of relativePaths) {
    const absolutePath = resolve(rootDir, rel);
    const candidate = await isMarkdownCandidate(absolutePath, minCyrillicRatio, minChars);
    if (!candidate) {
      continue;
    }
    candidates.push({
      ...candidate,
      relativePath: rel,
    });
  }

  return candidates.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}
