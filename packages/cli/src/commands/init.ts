import { copyFile, mkdir, readFile, writeFile, chmod, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { setupShellPath } from './setup-shell-path.js';
import {
  resolveBundledCliEntry,
  resolveBundledMcpServer,
  resolveInitInstallRoot,
  resolveInitModuleDir,
} from '../helpers/resolve-init-paths.js';

const MODULE_DIR = resolveInitModuleDir();
const INSTALL_ROOT = resolveInitInstallRoot(MODULE_DIR);
const HOME = homedir();
const TRANSLATE_HOME = join(HOME, '.cursor', 'translate-proxy');
const USER_HOOKS = join(HOME, '.cursor', 'hooks.json');

const HOOK_SCRIPTS = [
  'translate-audit.sh',
  'translate-audit-response.sh',
  'translate-audit-read.sh',
  'translate-lazy-read.sh',
  'translate-audit-subagent-start.sh',
  'translate-audit-subagent-stop.sh',
  'translate-session.sh',
  'log-metrics.mjs',
] as const;

interface HookDefinition {
  event: string;
  script: string;
  matcher?: string;
  timeout: number;
}

const CURSOR_TRANSLATE_HOOKS: HookDefinition[] = [
  { event: 'preToolUse', script: 'translate-lazy-read.sh', matcher: 'Read', timeout: 600 },
  { event: 'beforeSubmitPrompt', script: 'translate-audit.sh', matcher: 'UserPromptSubmit', timeout: 5 },
  { event: 'afterAgentResponse', script: 'translate-audit-response.sh', timeout: 5 },
  { event: 'postToolUse', script: 'translate-audit-read.sh', matcher: 'Read', timeout: 5 },
  { event: 'subagentStart', script: 'translate-audit-subagent-start.sh', timeout: 5 },
  { event: 'subagentStop', script: 'translate-audit-subagent-stop.sh', timeout: 5 },
];

export interface InitOptions {
  dryRun?: boolean;
  skipHooks?: boolean;
  addPath?: boolean;
}

export interface InitResult {
  translateHome: string;
  created: string[];
  updated: string[];
  merged: string[];
  warnings: string[];
  pathSetup: {
    shellRcPath: string | null;
    added: boolean;
    alreadyPresent: boolean;
  } | null;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function installMcpWrapper(dryRun: boolean, created: string[], updated: string[]): Promise<void> {
  const mcpSource = resolveBundledMcpServer(INSTALL_ROOT);
  if (!mcpSource) {
    return;
  }

  const binDir = join(TRANSLATE_HOME, 'bin');
  const wrapperPath = join(binDir, 'cursor-translate-mcp');

  const wrapper = `#!/usr/bin/env bash
set -euo pipefail
exec node "${mcpSource}" "$@"
`;

  if (!dryRun) {
    await mkdir(binDir, { recursive: true });
    await writeFile(wrapperPath, wrapper, 'utf8');
    await chmod(wrapperPath, 0o755);
  }

  if (await exists(wrapperPath)) {
    updated.push(wrapperPath);
  } else {
    created.push(wrapperPath);
  }
}

async function installCliWrapper(dryRun: boolean, created: string[], updated: string[]): Promise<void> {
  const cliSource = resolveBundledCliEntry(MODULE_DIR);
  const binDir = join(TRANSLATE_HOME, 'bin');
  const wrapperPath = join(binDir, 'cursor-translate');

  if (!(await exists(cliSource))) {
    return;
  }

  const wrapper = `#!/usr/bin/env bash
set -euo pipefail
exec node "${cliSource}" "$@"
`;

  if (!dryRun) {
    await mkdir(binDir, { recursive: true });
    await writeFile(wrapperPath, wrapper, 'utf8');
    await chmod(wrapperPath, 0o755);
  }

  if (await exists(wrapperPath)) {
    updated.push(wrapperPath);
  } else {
    created.push(wrapperPath);
  }
}

async function ensureDir(path: string, dryRun: boolean): Promise<void> {
  if (dryRun) {
    return;
  }
  await mkdir(path, { recursive: true });
}

async function copyTemplate(
  from: string,
  to: string,
  dryRun: boolean,
  created: string[],
): Promise<void> {
  if (await exists(to)) {
    return;
  }
  if (!dryRun) {
    await copyFile(from, to);
  }
  created.push(to);
}

async function installHookAsset(
  filename: string,
  dryRun: boolean,
  created: string[],
  updated: string[],
): Promise<void> {
  const from = join(INSTALL_ROOT, 'plugin', 'hooks', filename);
  const to = join(TRANSLATE_HOME, 'hooks', filename);
  const dest = filename.endsWith('.mjs')
    ? join(TRANSLATE_HOME, filename)
    : to;

  if (!(await exists(from))) {
    return;
  }

  const had = await exists(dest);
  if (!dryRun) {
    await copyFile(from, dest);
    if (filename.endsWith('.sh')) {
      await chmod(dest, 0o755);
    }
    if (filename.endsWith('.mjs')) {
      await chmod(dest, 0o755);
    }
  }

  if (had) {
    updated.push(dest);
  } else {
    created.push(dest);
  }
}

function hookCommand(script: string): string {
  if (script.endsWith('.mjs')) {
    return join(TRANSLATE_HOME, script);
  }
  return join(TRANSLATE_HOME, 'hooks', script);
}

function isCursorTranslateHook(hook: unknown, scriptName: string): boolean {
  if (typeof hook !== 'object' || hook === null) {
    return false;
  }
  const command = String((hook as { command?: string }).command ?? '');
  return command.includes(scriptName);
}

async function mergeUserHooks(dryRun: boolean, merged: string[], warnings: string[]): Promise<void> {
  let existing: Record<string, unknown> = { version: 1, hooks: {} };

  if (await exists(USER_HOOKS)) {
    try {
      const raw = await readFile(USER_HOOKS, 'utf8');
      existing = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      warnings.push(`Could not parse ${USER_HOOKS}; will not overwrite.`);
      return;
    }
  }

  const hooks = (existing.hooks as Record<string, unknown[]>) ?? {};
  let changed = false;

  for (const def of CURSOR_TRANSLATE_HOOKS) {
    const list = hooks[def.event] ?? [];
    const already = list.some((h) => isCursorTranslateHook(h, def.script));

    if (already) {
      continue;
    }

    const entry: Record<string, unknown> = {
      command: hookCommand(def.script),
      timeout: def.timeout,
    };
    if (def.matcher) {
      entry.matcher = def.matcher;
    }

    hooks[def.event] = [...list, entry];
    changed = true;
  }

  if (!changed) {
    merged.push(`${USER_HOOKS} (all cursor-translate hooks present)`);
    return;
  }

  existing.hooks = hooks;

  if (!dryRun) {
    await writeFile(USER_HOOKS, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');
  }
  merged.push(USER_HOOKS);
}

export async function runInit(options: InitOptions = {}): Promise<InitResult> {
  const dryRun = options.dryRun ?? false;
  const created: string[] = [];
  const updated: string[] = [];
  const merged: string[] = [];
  const warnings: string[] = [];

  await ensureDir(TRANSLATE_HOME, dryRun);
  await ensureDir(join(TRANSLATE_HOME, 'cache'), dryRun);
  await ensureDir(join(TRANSLATE_HOME, 'hooks'), dryRun);

  await copyTemplate(
    join(INSTALL_ROOT, 'templates', 'config.yaml'),
    join(TRANSLATE_HOME, 'config.yaml'),
    dryRun,
    created,
  );

  await copyTemplate(
    join(INSTALL_ROOT, 'plugin', 'glossary.default.yaml'),
    join(TRANSLATE_HOME, 'glossary.yaml'),
    dryRun,
    created,
  );

  for (const script of HOOK_SCRIPTS) {
    await installHookAsset(script, dryRun, created, updated);
  }

  await installCliWrapper(dryRun, created, updated);
  await installMcpWrapper(dryRun, created, updated);

  await copyTemplate(
    join(INSTALL_ROOT, 'templates', 'cursor-translate-rules.example.md'),
    join(TRANSLATE_HOME, 'cursor-translate-rules.example.md'),
    dryRun,
    created,
  );

  if (!options.skipHooks) {
    await mergeUserHooks(dryRun, merged, warnings);
  }

  let pathSetup: InitResult['pathSetup'] = null;
  if (options.addPath) {
    const pathResult = await setupShellPath(dryRun);
    pathSetup = {
      shellRcPath: pathResult.shellRcPath,
      added: pathResult.added,
      alreadyPresent: pathResult.alreadyPresent,
    };
  }

  return {
    translateHome: TRANSLATE_HOME,
    created,
    updated,
    merged,
    warnings,
    pathSetup,
  };
}
