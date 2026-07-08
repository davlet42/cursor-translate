export type TranslateProvider = 'cursor-cli' | 'openai' | 'claude-cli';

export function parseTranslateProvider(
  value: string | null | undefined,
): TranslateProvider | null {
  if (value === 'cursor-cli' || value === 'openai' || value === 'claude-cli') {
    return value;
  }
  return null;
}

export function resolveProviderFromEnv(): TranslateProvider | null {
  return (
    parseTranslateProvider(process.env.CURSOR_TRANSLATE_PROVIDER) ??
    parseTranslateProvider(process.env.CLAUDE_TRANSLATE_PROVIDER)
  );
}

// Lowest-priority default, below config.yaml. Front-end CLIs (e.g. the
// claude-translate wrapper) set this so running without init still picks
// the right provider.
export function resolveDefaultProviderFromEnv(): TranslateProvider | null {
  return parseTranslateProvider(process.env.CURSOR_TRANSLATE_DEFAULT_PROVIDER);
}
