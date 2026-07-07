import { spawnSync } from 'node:child_process';
import { appendCursorAgentTrustArgs } from './append-cursor-agent-trust-args.js';

export interface RunCursorAgentOptions {
  agentBinary?: string;
  args: string[];
  prompt: string;
}

export interface RunCursorAgentResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function runCursorAgent(options: RunCursorAgentOptions): RunCursorAgentResult {
  const agent = options.agentBinary ?? process.env.CURSOR_AGENT_BIN ?? 'agent';
  const args = appendCursorAgentTrustArgs([...options.args]);

  if (!args.includes('--print')) {
    args.push('--print');
  }
  if (!args.includes('--output-format')) {
    args.push('--output-format', 'text');
  }

  args.push('-p', options.prompt);

  const result = spawnSync(agent, args, {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    timeout: 60 * 60 * 1000,
  });

  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.status ?? 1,
  };
}
