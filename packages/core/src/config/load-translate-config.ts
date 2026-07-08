import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  DEFAULT_CLAUDE_DOC_FALLBACK_MODEL,
  DEFAULT_CLAUDE_TRANSLATE_MODEL,
  DEFAULT_DOC_FALLBACK_MODEL,
  DEFAULT_TRANSLATE_MODEL,
  DEFAULT_TRANSLATE_PROVIDER,
} from '../constants/default-translate-model.constant.js';
import {
  DEFAULT_LAZY_READ_MAX_CHARS,
  DEFAULT_LAZY_READ_MAX_CHUNKS,
} from '../constants/default-lazy-read-limits.constant.js';
import { resolveTranslateHome } from './resolve-translate-home.js';
import {
  parseTranslateProvider,
  resolveDefaultProviderFromEnv,
  resolveProviderFromEnv,
} from '../translate/translate-provider.js';
import type { TranslateProvider } from '../translate/translate-provider.js';

export interface LoadedTranslateConfig {
  enabled: boolean;
  minCyrillicRatio: number;
  minCharsToTranslate: number;
  provider: TranslateProvider;
  model: string;
  docFallbackModel: string;
  promptTranslateEnabled: boolean;
  responseBackTranslate: boolean;
  shareSiblingCaches: boolean;
  lazyReadMaxChars: number;
  lazyReadMaxChunks: number;
  lazyReadHints: boolean;
  cacheIncremental: 'off' | 'section';
}

const DEFAULTS: LoadedTranslateConfig = {
  enabled: true,
  minCyrillicRatio: 0.15,
  minCharsToTranslate: 120,
  provider: DEFAULT_TRANSLATE_PROVIDER,
  model: DEFAULT_TRANSLATE_MODEL,
  docFallbackModel: DEFAULT_DOC_FALLBACK_MODEL,
  promptTranslateEnabled: true,
  responseBackTranslate: true,
  shareSiblingCaches: true,
  lazyReadMaxChars: DEFAULT_LAZY_READ_MAX_CHARS,
  lazyReadMaxChunks: DEFAULT_LAZY_READ_MAX_CHUNKS,
  lazyReadHints: true,
  cacheIncremental: 'section',
};

function parseYamlScalar(block: string, key: string): string | null {
  const match = block.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  if (!match) {
    return null;
  }
  return match[1].trim().replace(/^['"]|['"]$/g, '');
}

function parseNestedScalar(block: string, section: string, key: string): string | null {
  // Section body = consecutive indented or blank lines after "section:".
  // (A lazy [\s\S]*? with a multiline `$` lookahead only ever captured the
  // section's first line, silently dropping every later key.)
  const sectionMatch = block.match(
    new RegExp(`^${section}:[ \\t]*\\r?\\n((?:(?:[ \\t]+[^\\n]*)?\\r?\\n)*)`, 'm'),
  );
  if (!sectionMatch) {
    return null;
  }
  // Section lines are indented, so the key match must tolerate leading space
  // (parseYamlScalar anchors at line start and only fits top-level keys).
  const match = sectionMatch[1].match(new RegExp(`^\\s*${key}:\\s*(.+)$`, 'm'));
  if (!match) {
    return null;
  }
  return match[1].trim().replace(/^['"]|['"]$/g, '');
}

function parseBoolean(value: string | null, fallback: boolean): boolean {
  if (value === null) {
    return fallback;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return fallback;
}

function parseNumber(value: string | null, fallback: number): number {
  if (value === null) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveProvider(value: string | null): TranslateProvider {
  return (
    resolveProviderFromEnv() ??
    parseTranslateProvider(value) ??
    resolveDefaultProviderFromEnv() ??
    DEFAULTS.provider
  );
}

function defaultModelForProvider(provider: TranslateProvider): string {
  if (provider === 'claude-cli') {
    return process.env.CLAUDE_TRANSLATE_MODEL ?? DEFAULT_CLAUDE_TRANSLATE_MODEL;
  }
  return process.env.CURSOR_TRANSLATE_MODEL ?? DEFAULTS.model;
}

function defaultDocFallbackForProvider(provider: TranslateProvider): string {
  if (provider === 'claude-cli') {
    return process.env.CLAUDE_TRANSLATE_DOC_FALLBACK_MODEL ?? DEFAULT_CLAUDE_DOC_FALLBACK_MODEL;
  }
  return process.env.CURSOR_TRANSLATE_DOC_FALLBACK_MODEL ?? DEFAULTS.docFallbackModel;
}

export async function loadTranslateConfig(): Promise<LoadedTranslateConfig> {
  const configPath = join(resolveTranslateHome(), 'config.yaml');
  let raw: string;

  try {
    raw = await readFile(configPath, 'utf8');
  } catch {
    const provider = resolveProvider(null);
    return {
      ...DEFAULTS,
      provider,
      model: defaultModelForProvider(provider),
      docFallbackModel: defaultDocFallbackForProvider(provider),
    };
  }

  const enabled = parseBoolean(parseYamlScalar(raw, 'enabled'), DEFAULTS.enabled);
  const minCyrillicRatio = parseNumber(
    parseYamlScalar(raw, 'min_cyrillic_ratio'),
    DEFAULTS.minCyrillicRatio,
  );
  const minCharsToTranslate = parseNumber(
    parseYamlScalar(raw, 'min_chars_to_translate'),
    DEFAULTS.minCharsToTranslate,
  );
  const provider = resolveProvider(parseNestedScalar(raw, 'translator', 'provider'));
  const model =
    parseNestedScalar(raw, 'translator', 'model') ?? defaultModelForProvider(provider);
  const docFallbackModel =
    parseNestedScalar(raw, 'translator', 'doc_fallback_model') ??
    defaultDocFallbackForProvider(provider);
  const promptTranslateEnabled = parseBoolean(
    parseNestedScalar(raw, 'response', 'prompt_translate'),
    DEFAULTS.promptTranslateEnabled,
  );
  const responseBackTranslate = parseBoolean(
    parseNestedScalar(raw, 'response', 'back_translate'),
    DEFAULTS.responseBackTranslate,
  );
  const shareSiblingCaches = parseBoolean(
    parseNestedScalar(raw, 'cache', 'share_siblings'),
    DEFAULTS.shareSiblingCaches,
  );
  const lazyReadMaxChars = parseNumber(
    parseNestedScalar(raw, 'cache', 'lazy_read_max_chars'),
    DEFAULTS.lazyReadMaxChars,
  );
  const lazyReadMaxChunks = parseNumber(
    parseNestedScalar(raw, 'cache', 'lazy_read_max_chunks'),
    DEFAULTS.lazyReadMaxChunks,
  );
  const lazyReadHints = parseBoolean(
    parseNestedScalar(raw, 'cache', 'lazy_read_hints'),
    DEFAULTS.lazyReadHints,
  );
  const incrementalRaw = parseNestedScalar(raw, 'cache', 'incremental');
  const cacheIncremental =
    incrementalRaw === 'off' ? 'off' : incrementalRaw === 'section' ? 'section' : DEFAULTS.cacheIncremental;

  return {
    enabled,
    minCyrillicRatio,
    minCharsToTranslate,
    provider,
    model,
    docFallbackModel,
    promptTranslateEnabled,
    responseBackTranslate,
    shareSiblingCaches,
    lazyReadMaxChars,
    lazyReadMaxChunks,
    lazyReadHints,
    cacheIncremental,
  };
}
