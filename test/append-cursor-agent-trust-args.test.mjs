import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { appendCursorAgentTrustArgs } from '../packages/core/dist/agent/append-cursor-agent-trust-args.js';

describe('appendCursorAgentTrustArgs', () => {
  const originalSkip = process.env.CURSOR_AGENT_SKIP_TRUST;

  after(() => {
    if (originalSkip === undefined) {
      delete process.env.CURSOR_AGENT_SKIP_TRUST;
    } else {
      process.env.CURSOR_AGENT_SKIP_TRUST = originalSkip;
    }
  });

  it('prepends --trust when missing', () => {
    const result = appendCursorAgentTrustArgs(['--print', '--mode', 'ask']);
    assert.deepEqual(result, ['--trust', '--print', '--mode', 'ask']);
  });

  it('does not duplicate when --trust present', () => {
    const result = appendCursorAgentTrustArgs(['--trust', '--print']);
    assert.deepEqual(result, ['--trust', '--print']);
  });

  it('does not duplicate when --yolo present', () => {
    const result = appendCursorAgentTrustArgs(['--yolo', '--print']);
    assert.deepEqual(result, ['--yolo', '--print']);
  });

  it('skips when CURSOR_AGENT_SKIP_TRUST=1', () => {
    process.env.CURSOR_AGENT_SKIP_TRUST = '1';
    const result = appendCursorAgentTrustArgs(['--print']);
    assert.deepEqual(result, ['--print']);
  });
});
