import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveTranslateHome } from '../config/resolve-translate-home.js';

export interface DocTranslateQuotaState {
  exhaustedAt: string;
  reason: string;
}

const STATE_FILE = 'doc-translate-quota.json';

function statePath(): string {
  return join(resolveTranslateHome(), STATE_FILE);
}

export async function markDocTranslateQuotaExhausted(reason: string): Promise<void> {
  const payload: DocTranslateQuotaState = {
    exhaustedAt: new Date().toISOString(),
    reason,
  };
  await mkdir(resolveTranslateHome(), { recursive: true });
  await writeFile(statePath(), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export async function readDocTranslateQuotaState(): Promise<DocTranslateQuotaState | null> {
  try {
    const raw = await readFile(statePath(), 'utf8');
    return JSON.parse(raw) as DocTranslateQuotaState;
  } catch {
    return null;
  }
}

export async function clearDocTranslateQuotaState(): Promise<void> {
  try {
    await writeFile(statePath(), '', 'utf8');
  } catch {
    // optional state file
  }
}

// Subscription usage limits reset on their own, so the latch must expire:
// a permanently blocked state silently disables prompt/display translation
// until some doc translation happens to succeed and clear it.
const DEFAULT_QUOTA_BLOCK_TTL_MIN = 30;

function quotaBlockTtlMs(): number {
  const raw =
    process.env.CURSOR_TRANSLATE_QUOTA_TTL_MIN ?? process.env.CLAUDE_TRANSLATE_QUOTA_TTL_MIN;
  const parsed = Number(raw);
  const minutes = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_QUOTA_BLOCK_TTL_MIN;
  return minutes * 60_000;
}

export async function isPromptTranslationBlocked(): Promise<boolean> {
  const state = await readDocTranslateQuotaState();
  if (state === null) {
    return false;
  }

  const exhaustedAt = Date.parse(state.exhaustedAt);
  if (!Number.isFinite(exhaustedAt) || Date.now() - exhaustedAt > quotaBlockTtlMs()) {
    await clearDocTranslateQuotaState();
    return false;
  }

  return true;
}

export async function shouldBackTranslateResponse(): Promise<boolean> {
  if (await isPromptTranslationBlocked()) {
    return false;
  }
  return true;
}
