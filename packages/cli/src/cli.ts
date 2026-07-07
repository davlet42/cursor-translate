#!/usr/bin/env node
import { runInit } from './commands/init.js';
import { shellPathHint } from './commands/setup-shell-path.js';
import { runDoc } from './commands/doc.js';
import { runDocs } from './commands/docs.js';
import { runResolve } from './commands/resolve.js';
import { runHookResolve } from './commands/hook-resolve.js';
import { runBackfillCosts } from './commands/backfill-costs.js';
import { runPrompt } from './commands/prompt.js';
import { runAgent } from './commands/agent.js';

const args = process.argv.slice(2);
const command = args[0];

async function main(): Promise<void> {
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  switch (command) {
    case 'init':
      await handleInit(args.slice(1));
      break;
    case 'doc':
      await runDoc(args.slice(1));
      break;
    case 'docs':
      await runDocs(args.slice(1));
      break;
    case 'resolve':
      await runResolve(args[1], args.slice(2));
      break;
    case 'hook-resolve':
      await runHookResolve();
      break;
    case 'prompt':
      await runPrompt(args.slice(1));
      break;
    case 'agent':
      await runAgent(args.slice(1));
      break;
    case 'report':
      if (args.slice(1).includes('--backfill-costs')) {
        await runBackfillCosts(args.slice(1).filter((a) => a !== '--backfill-costs'));
        break;
      }
      await handleReport(args.slice(1));
      break;
    case 'backfill-costs':
      await runBackfillCosts(args.slice(1));
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exitCode = 1;
  }
}

async function handleInit(initArgs: string[]): Promise<void> {
  const dryRun = initArgs.includes('--dry-run');
  const skipHooks = initArgs.includes('--skip-hooks');
  const addPath = initArgs.includes('--path');

  const result = await runInit({ dryRun, skipHooks, addPath });

  console.log('cursor-translate init');
  console.log(`  home: ${result.translateHome}`);
  console.log(`  cli: ${result.translateHome}/bin/cursor-translate`);
  if (result.created.length) {
    console.log('  created:');
    for (const p of result.created) {
      console.log(`    - ${p}`);
    }
  }
  if (result.updated.length) {
    console.log('  updated:');
    for (const p of result.updated) {
      console.log(`    - ${p}`);
    }
  }
  if (result.merged.length) {
    console.log('  merged:');
    for (const p of result.merged) {
      console.log(`    - ${p}`);
    }
  }
  if (result.warnings.length) {
    console.log('  warnings:');
    for (const w of result.warnings) {
      console.log(`    - ${w}`);
    }
  }
  if (result.pathSetup) {
    if (result.pathSetup.alreadyPresent) {
      console.log(`  path: already in ${result.pathSetup.shellRcPath ?? 'shell rc'}`);
    } else if (result.pathSetup.added) {
      console.log(`  path: added to ${result.pathSetup.shellRcPath}`);
      console.log(`  ${shellPathHint(result.pathSetup.shellRcPath)}`);
    }
  } else if (!dryRun) {
    console.log('  tip: re-run with --path to add cursor-translate to your shell PATH');
  }
  console.log('');
  console.log('Phase 0c measures: user_prompt, agent_response, file_read, subagent_task, subagent_summary');
  console.log('Translate tier default model: gpt-5.4-nano-none (Cursor subscription via agent CLI)');
  console.log('Doc fallback on quota: composer-2.5');
  console.log('Lazy read: preToolUse Read hook rewrites path to EN cache (translate on miss/stale)');
  console.log('Phase 2: cursor-translate prompt / agent (CLI wrapper for RU↔EN)');
  console.log('Phase 3: MCP tools translate + resolve_doc (enable plugin mcp.json after init --path)');
  console.log('  Optional: ln -sf "$(pwd)/plugin" ~/.cursor/plugins/local/cursor-translate');
}

async function handleReport(reportArgs: string[]): Promise<void> {
  const { runReport, formatReport } = await import('./commands/report.js');
  const result = await runReport(reportArgs);
  console.log(formatReport(result));
}

function printHelp(): void {
  console.log(`cursor-translate — token-saving RU→EN layer for Cursor

Usage:
  cursor-translate init [--dry-run] [--skip-hooks] [--path]
  cursor-translate doc <file> [--project slug] [--force] [--dry-run]
  cursor-translate docs [path] [--project slug] [--force] [--dry-run]
      [--include-gitignored] [--min-cyrillic-ratio 0.05] [--min-chars 80]
  cursor-translate resolve <file> [--json] [--project slug] [--force]
  cursor-translate hook-resolve                    (stdin JSON → preToolUse Read)
  cursor-translate prompt "<text>" [--json] [--force] [--stdin]
  cursor-translate agent [agent flags] -- "<prompt>" [--json] [--no-back-translate]
  cursor-translate report [--days 7] [--backfill-costs] [--project slug]
  cursor-translate backfill-costs [--project slug] [--dry-run]

Docs: https://github.com/davlet42/cursor-translate
`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
