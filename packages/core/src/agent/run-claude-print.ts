import { spawnSync } from 'node:child_process';

export interface RunClaudePrintOptions {
  claudeBinary?: string;
  model: string;
  systemPrompt: string;
  prompt: string;
  timeoutMs?: number;
}

// --safe-mode keeps subscription (OAuth) auth working while disabling hooks,
// plugins, MCP, skills, and CLAUDE.md discovery; --bare would drop OAuth.
export function buildClaudePrintArgs(model: string, systemPrompt: string): string[] {
  return [
    '--print',
    '--safe-mode',
    '--no-session-persistence',
    '--tools',
    '',
    '--output-format',
    'text',
    '--model',
    model,
    '--system-prompt',
    systemPrompt,
  ];
}

export function runClaudePrint(options: RunClaudePrintOptions): string {
  const claude = options.claudeBinary ?? process.env.CLAUDE_TRANSLATE_BIN ?? 'claude';
  const args = buildClaudePrintArgs(options.model, options.systemPrompt);

  const result = spawnSync(claude, args, {
    encoding: 'utf8',
    input: options.prompt,
    maxBuffer: 20 * 1024 * 1024,
    timeout: options.timeoutMs ?? 10 * 60 * 1000,
    env: { ...process.env, CLAUDE_TRANSLATE_HOP: '1' },
  });

  if (result.error) {
    throw new Error(`Claude CLI failed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.trim() || result.stdout?.trim() || 'unknown error';
    throw new Error(`Claude CLI exited ${result.status}: ${stderr}`);
  }

  const content = result.stdout?.trim();
  if (!content) {
    throw new Error('Claude CLI returned empty translation');
  }

  return content;
}
