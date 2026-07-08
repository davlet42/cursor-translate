import { resolveDocForRead } from '@cursor-translate/core';

export interface ResolveCliOptions {
  json?: boolean;
  cwd?: string;
  projectSlug?: string;
  force?: boolean;
}

export async function runResolve(fileArg: string | undefined, args: string[]): Promise<void> {
  const json = args.includes('--json');
  const force = args.includes('--force');
  const projectIndex = args.indexOf('--project');
  const projectSlug = projectIndex >= 0 ? args[projectIndex + 1] : undefined;

  if (!fileArg) {
    throw new Error('Usage: cursor-translate resolve <file> [--json] [--project slug] [--force]');
  }

  const result = await resolveDocForRead({
    sourcePath: fileArg,
    projectSlug,
    force,
  });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('cursor-translate resolve');
  console.log(`  source: ${result.sourcePath}`);
  console.log(`  read: ${result.readPath}`);
  console.log(`  action: ${result.action}`);
  console.log(`  sha256: ${result.sourceSha256}`);
  if (result.cachePath) {
    console.log(`  cache: ${result.cachePath}`);
  }
  if (result.translateModel) {
    console.log(`  model: ${result.translateModel}`);
  }
  if (result.usedFallback) {
    console.log('  fallback: true');
  }
}

export async function runResolveFromHookInput(
  hookInput: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const toolInput = (hookInput.tool_input ?? hookInput) as Record<string, unknown>;
  const filePath =
    (toolInput.path as string | undefined) ??
    (toolInput.file_path as string | undefined) ??
    (toolInput.target as string | undefined);

  if (!filePath) {
    return { permission: 'allow' };
  }

  const result = await resolveDocForRead({ sourcePath: filePath });

  if (result.readPath === result.sourcePath) {
    if (result.action === 'quota_exhausted') {
      return {
        permission: 'allow',
        agent_message:
          'cursor-translate: included API quota exhausted; reading Russian source without translation.',
      };
    }
    if (result.action === 'lazy_deferred' && result.userHint) {
      return {
        permission: 'allow',
        agent_message: result.userHint,
      };
    }
    return { permission: 'allow' };
  }

  return {
    permission: 'allow',
    updated_input: {
      ...toolInput,
      path: result.readPath,
    },
    agent_message: `cursor-translate: lazy ${result.action} — read English cache instead of Russian source.`,
  };
}
