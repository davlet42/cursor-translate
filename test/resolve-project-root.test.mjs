import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { resolveProjectRoot } from '../packages/core/dist/project/resolve-project-root.js';

describe('resolveProjectRoot', () => {
  it('returns git root from cwd inside repo', () => {
    const cwd = process.cwd();
    const root = resolveProjectRoot(cwd);
    assert.equal(root, execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim());
  });

  it('resolves git root from hintPath when cwd is outside repo', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'ct-resolve-'));
    try {
      const nestedDir = join(tempRoot, 'outside');
      execSync('git init', { cwd: tempRoot });
      execSync(`mkdir -p "${nestedDir}"`);

      const readme = join(tempRoot, 'README.md');
      writeFileSync(readme, '# test\n');

      const homeLike = join(tempRoot, 'fake-home');
      execSync(`mkdir -p "${homeLike}"`);

      const root = resolveProjectRoot(homeLike, readme);
      assert.equal(realpathSync(root), realpathSync(tempRoot));
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('falls back to cwd when no git repo', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'ct-nogit-'));
    try {
      const root = resolveProjectRoot(tempRoot);
      assert.equal(root, tempRoot);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
