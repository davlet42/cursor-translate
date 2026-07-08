import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const HOME = mkdtempSync(join(tmpdir(), 'ct-config-test-'));
process.env.CURSOR_TRANSLATE_HOME = HOME;
delete process.env.CURSOR_TRANSLATE_PROVIDER;
delete process.env.CLAUDE_TRANSLATE_PROVIDER;

const { loadTranslateConfig } = await import(
  '../packages/core/dist/config/load-translate-config.js'
);

describe('loadTranslateConfig — nested YAML sections', () => {
  it('parses keys beyond the first line of a section (regression)', async () => {
    writeFileSync(
      join(HOME, 'config.yaml'),
      [
        'enabled: true',
        '',
        'min_cyrillic_ratio: 0.2',
        '',
        'translator:',
        '  provider: claude-cli',
        '  model: custom-model-name',
        '  doc_fallback_model: custom-fallback',
        '',
        'response:',
        '  user_language: ru',
        '  prompt_translate: true',
        '  back_translate: false',
        '',
        'cache:',
        '  location: global',
        '  dir: ~/.cursor/translate-proxy/cache',
        '  ttl_days: 30',
        '  share_siblings: false',
        '',
        'hooks:',
        '  audit_enabled: true',
        '',
      ].join('\n'),
      'utf8',
    );

    const config = await loadTranslateConfig();

    assert.equal(config.provider, 'claude-cli', 'translator.provider (line 1 of section)');
    assert.equal(config.model, 'custom-model-name', 'translator.model (line 2 of section)');
    assert.equal(
      config.docFallbackModel,
      'custom-fallback',
      'translator.doc_fallback_model (line 3 of section)',
    );
    assert.equal(config.responseBackTranslate, false, 'response.back_translate (line 3)');
    assert.equal(config.shareSiblingCaches, false, 'cache.share_siblings (line 4)');
    assert.equal(config.minCyrillicRatio, 0.2, 'top-level key still parsed');
  });
});
