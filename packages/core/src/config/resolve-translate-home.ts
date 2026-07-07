import { homedir } from 'node:os';
import { join } from 'node:path';

export function resolveTranslateHome(): string {
  return process.env.CURSOR_TRANSLATE_HOME ?? join(homedir(), '.cursor', 'translate-proxy');
}
