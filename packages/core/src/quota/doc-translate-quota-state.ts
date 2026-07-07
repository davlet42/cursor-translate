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

export async function isPromptTranslationBlocked(): Promise<boolean> {
  const state = await readDocTranslateQuotaState();
  return state !== null;
}

export async function shouldBackTranslateResponse(): Promise<boolean> {
  if (await isPromptTranslationBlocked()) {
    return false;
  }
  return true;
}
