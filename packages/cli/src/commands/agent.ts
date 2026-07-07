import {
  backTranslateResponse,
  runCursorAgent,
  translateUserPrompt,
} from '@cursor-translate/core';

export async function runAgent(args: string[]): Promise<void> {
  const dashIndex = args.indexOf('--');
  if (dashIndex < 0) {
    throw new Error(
      'Usage: cursor-translate agent [agent flags] -- "<prompt>" [--json] [--force] [--no-back-translate] [--project slug]',
    );
  }

  const agentArgs = args.slice(0, dashIndex);
  const tailArgs = args.slice(dashIndex + 1);
  const json = tailArgs.includes('--json');
  const force = tailArgs.includes('--force');
  const noBackTranslate = tailArgs.includes('--no-back-translate');
  const projectIdx = tailArgs.indexOf('--project');
  const projectSlug = projectIdx >= 0 ? tailArgs[projectIdx + 1] : undefined;

  const promptParts = tailArgs.filter(
    (a, i) =>
      !a.startsWith('--') &&
      i !== projectIdx + 1 &&
      a !== '--json' &&
      a !== '--force' &&
      a !== '--no-back-translate',
  );
  const prompt = promptParts.join(' ').trim();

  if (!prompt) {
    throw new Error('Prompt after -- is required');
  }

  const translateIn = await translateUserPrompt({
    text: prompt,
    projectSlug,
    force,
  });

  if (process.env.CURSOR_TRANSLATE_VERBOSE === '1') {
    console.error(
      `cursor-translate agent: prompt ${translateIn.skipped ? `skipped (${translateIn.reason})` : `translated via ${translateIn.modelUsed}`}`,
    );
  }

  const agentResult = runCursorAgent({
    args: agentArgs,
    prompt: translateIn.text,
  });

  if (agentResult.exitCode !== 0) {
    if (agentResult.stderr.trim()) {
      console.error(agentResult.stderr.trim());
    }
    process.exitCode = agentResult.exitCode;
    return;
  }

  const agentText = agentResult.stdout.trimEnd();
  let finalText = agentText;

  if (!noBackTranslate) {
    const translateOut = await backTranslateResponse({
      text: agentText,
      projectSlug,
      force,
    });
    finalText = translateOut.text;

    if (process.env.CURSOR_TRANSLATE_VERBOSE === '1') {
      console.error(
        `cursor-translate agent: response ${translateOut.skipped ? `skipped (${translateOut.reason})` : `back-translated via ${translateOut.modelUsed}`}`,
      );
    }
  }

  if (json) {
    console.log(
      JSON.stringify(
        {
          promptOriginal: prompt,
          promptTranslated: translateIn.text,
          promptSkipped: translateIn.skipped,
          promptReason: translateIn.reason,
          agentStdout: agentText,
          responseFinal: finalText,
          backTranslateSkipped: noBackTranslate,
        },
        null,
        2,
      ),
    );
    return;
  }

  process.stdout.write(finalText);
  if (!finalText.endsWith('\n')) {
    process.stdout.write('\n');
  }
}
