import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  backTranslateResponse,
  resolveDocForRead,
  translateUserPrompt,
} from '@cursor-translate/core';
import { TranslateMcpDirection } from '../enums/translate-mcp-direction.enum.js';

export interface TranslateToolInput {
  text: string;
  direction: TranslateMcpDirection;
  force?: boolean;
  projectSlug?: string;
}

export interface TranslateToolOutput {
  text: string;
  skipped: boolean;
  reason: string;
  modelUsed: string | null;
  usedFallback: boolean;
  direction: TranslateMcpDirection;
}

export async function runTranslateTool(input: TranslateToolInput): Promise<TranslateToolOutput> {
  if (input.direction === TranslateMcpDirection.EN_RU) {
    const result = await backTranslateResponse({
      text: input.text,
      projectSlug: input.projectSlug,
      force: input.force,
    });

    return {
      text: result.text,
      skipped: result.skipped,
      reason: result.reason,
      modelUsed: result.modelUsed ?? null,
      usedFallback: result.usedFallback ?? false,
      direction: input.direction,
    };
  }

  const result = await translateUserPrompt({
    text: input.text,
    projectSlug: input.projectSlug,
    force: input.force,
  });

  return {
    text: result.text,
    skipped: result.skipped,
    reason: result.reason,
    modelUsed: result.modelUsed ?? null,
    usedFallback: result.usedFallback ?? false,
    direction: input.direction,
  };
}

export interface ResolveDocToolInput {
  filePath: string;
  projectSlug?: string;
  force?: boolean;
  includeBody?: boolean;
}

export interface ResolveDocToolOutput {
  sourcePath: string;
  readPath: string;
  cachePath: string | null;
  action: string;
  projectSlug: string;
  translateModel: string | null;
  body?: string;
}

export async function runResolveDocTool(input: ResolveDocToolInput): Promise<ResolveDocToolOutput> {
  const absolutePath = resolve(input.filePath);
  const result = await resolveDocForRead({
    sourcePath: absolutePath,
    cwd: dirname(absolutePath),
    projectSlug: input.projectSlug,
    force: input.force,
  });

  const output: ResolveDocToolOutput = {
    sourcePath: result.sourcePath,
    readPath: result.readPath,
    cachePath: result.cachePath,
    action: result.action,
    projectSlug: result.projectSlug,
    translateModel: result.translateModel ?? null,
  };

  if (input.includeBody && result.readPath !== result.sourcePath) {
    output.body = await readFile(result.readPath, 'utf8');
  } else if (input.includeBody) {
    output.body = await readFile(result.sourcePath, 'utf8');
  }

  return output;
}
