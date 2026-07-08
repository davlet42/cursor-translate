import { spawnSync } from 'node:child_process';

export interface RunClaudePrintOptions {
  claudeBinary?: string;
  model: string;
  systemPrompt: string;
  prompt: string;
  timeoutMs?: number;
}

export interface RunClaudePrintResult {
  text: string;
  // Actual cost reported by claude -p (total_cost_usd); null when the JSON
  // envelope could not be parsed and we fell back to treating stdout as text.
  costUsd: number | null;
}

// --safe-mode keeps subscription (OAuth) auth working while disabling hooks,
// plugins, MCP, skills, and CLAUDE.md discovery; --bare would drop OAuth.
// JSON output carries total_cost_usd so metrics can record real spend.
export function buildClaudePrintArgs(model: string, systemPrompt: string): string[] {
  return [
    '--print',
    '--safe-mode',
    '--no-session-persistence',
    '--tools',
    '',
    '--output-format',
    'json',
    '--model',
    model,
    '--system-prompt',
    systemPrompt,
  ];
}

function parsePrintEnvelope(stdout: string): RunClaudePrintResult | null {
  try {
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    if (typeof parsed.result !== 'string') {
      return null;
    }
    return {
      text: parsed.result.trim(),
      costUsd: typeof parsed.total_cost_usd === 'number' ? parsed.total_cost_usd : null,
    };
  } catch {
    return null;
  }
}

export function runClaudePrint(options: RunClaudePrintOptions): RunClaudePrintResult {
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

  const stdout = result.stdout?.trim();
  if (!stdout) {
    throw new Error('Claude CLI returned empty translation');
  }

  const envelope = parsePrintEnvelope(stdout);
  const text = envelope?.text ?? stdout;
  if (!text) {
    throw new Error('Claude CLI returned empty translation');
  }

  return envelope ?? { text, costUsd: null };
}
