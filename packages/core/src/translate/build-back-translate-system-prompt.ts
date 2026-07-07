import { DEFAULT_BACK_TRANSLATE_SYSTEM_PROMPT } from '../constants/default-back-translate-system-prompt.constant.js';

export function buildBackTranslateSystemPrompt(customRules?: string | null): string {
  const trimmed = customRules?.trim();
  if (!trimmed) {
    return DEFAULT_BACK_TRANSLATE_SYSTEM_PROMPT;
  }

  return `${DEFAULT_BACK_TRANSLATE_SYSTEM_PROMPT}

Project-specific rules (override or extend the defaults above when they conflict):
${trimmed}`;
}
