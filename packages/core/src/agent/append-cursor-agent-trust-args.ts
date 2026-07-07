const TRUST_FLAGS = new Set(['--trust', '--yolo', '-f']);

export function appendCursorAgentTrustArgs(args: string[]): string[] {
  if (process.env.CURSOR_AGENT_SKIP_TRUST === '1') {
    return args;
  }

  if (args.some((arg) => TRUST_FLAGS.has(arg))) {
    return args;
  }

  return ['--trust', ...args];
}
