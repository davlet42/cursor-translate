import { resolveTranslateHome } from './resolve-translate-home.js';

export function resolveCliBrand(): 'cursor-translate' | 'claude-translate' {
  const home = resolveTranslateHome();
  if (home.includes('.claude')) {
    return 'claude-translate';
  }
  return 'cursor-translate';
}
