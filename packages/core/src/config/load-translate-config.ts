import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  DEFAULT_DOC_FALLBACK_MODEL,
  DEFAULT_TRANSLATE_MODEL,
  DEFAULT_TRANSLATE_PROVIDER,
} from '../constants/default-translate-model.constant.js';
import { resolveTranslateHome } from './resolve-translate-home.js';
import type { TranslateProvider } from '../cache/translate-doc-to-global-cache.js';

export interface LoadedTranslateConfig {
  enabled: boolean;
  minCyrillicRatio: number;
  minCharsToTranslate: number;
  provider: TranslateProvider;
  model: string;
  docFallbackModel: string;
  promptTranslateEnabled: boolean;
  responseBackTranslate: boolean;
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
};

function parseYamlScalar(block: string, key: string): string | null {
  const match = block.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  if (!match) {
    return null;
  }
  return match[1].trim().replace(/^['"]|['"]$/g, '');
}

function parseNestedScalar(block: string, section: string, key: string): string | null {
  const sectionMatch = block.match(new RegExp(`^${section}:\\n([\\s\\S]*?)(?=^[a-zA-Z_]+:|$)`, 'm'));
  if (!sectionMatch) {
    return null;
  }
  return parseYamlScalar(sectionMatch[1], key);
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
  if (value === 'openai' || value === 'cursor-cli') {
    return value;
  }
  return DEFAULTS.provider;
}

export async function loadTranslateConfig(): Promise<LoadedTranslateConfig> {
  const configPath = join(resolveTranslateHome(), 'config.yaml');
  let raw: string;

  try {
    raw = await readFile(configPath, 'utf8');
  } catch {
    return { ...DEFAULTS };
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
    parseNestedScalar(raw, 'translator', 'model') ??
    process.env.CURSOR_TRANSLATE_MODEL ??
    DEFAULTS.model;
  const docFallbackModel =
    parseNestedScalar(raw, 'translator', 'doc_fallback_model') ??
    process.env.CURSOR_TRANSLATE_DOC_FALLBACK_MODEL ??
    DEFAULTS.docFallbackModel;
  const promptTranslateEnabled = parseBoolean(
    parseNestedScalar(raw, 'response', 'prompt_translate'),
    DEFAULTS.promptTranslateEnabled,
  );
  const responseBackTranslate = parseBoolean(
    parseNestedScalar(raw, 'response', 'back_translate'),
    DEFAULTS.responseBackTranslate,
  );

  return {
    enabled,
    minCyrillicRatio,
    minCharsToTranslate,
    provider,
    model,
    docFallbackModel,
    promptTranslateEnabled,
    responseBackTranslate,
  };
}
