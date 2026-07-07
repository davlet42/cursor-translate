#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { TranslateMcpDirection } from './enums/translate-mcp-direction.enum.js';
import { runResolveDocTool, runTranslateTool } from './tools/mcp-translate-tools.js';

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function createServer(): McpServer {
  const server = new McpServer({
    name: 'cursor-translate',
    version: '0.1.0',
  });

  server.registerTool(
    'translate',
    {
      description:
        'Translate prose RU↔EN using the cheap nano tier. Preserves code, paths, task IDs, and glossary terms. Use ru_en before reasoning in English; en_ru for user-facing replies.',
      inputSchema: {
        text: z.string().min(1).describe('Text to translate'),
        direction: z
          .enum([TranslateMcpDirection.RU_EN, TranslateMcpDirection.EN_RU])
          .default(TranslateMcpDirection.RU_EN)
          .describe('ru_en = Russian prompt to English; en_ru = agent reply to Russian'),
        force: z
          .boolean()
          .optional()
          .describe('Translate even when breakeven heuristics would skip'),
        project_slug: z
          .string()
          .optional()
          .describe('Project slug for glossary/rules (defaults to git repo name from cwd)'),
      },
    },
    async ({ text, direction, force, project_slug: projectSlug }) => {
      try {
        const result = await runTranslateTool({
          text,
          direction,
          force,
          projectSlug,
        });

        return {
          content: [
            {
              type: 'text',
              text: formatJson(result),
            },
          ],
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: 'text', text: `translate failed: ${message}` }],
        };
      }
    },
  );

  server.registerTool(
    'resolve_doc',
    {
      description:
        'Resolve a Cyrillic markdown file to its English cache path (translate on miss/stale). For Cloud Agents without lazy Read hook — call before using doc content, or set include_body=true.',
      inputSchema: {
        file_path: z.string().min(1).describe('Path to .md/.mdx file (relative or absolute)'),
        project_slug: z.string().optional().describe('Override project slug for cache key'),
        force: z.boolean().optional().describe('Force re-translate even when cache is fresh'),
        include_body: z
          .boolean()
          .optional()
          .describe('Include file contents from readPath in the response'),
      },
    },
    async ({ file_path: filePath, project_slug: projectSlug, force, include_body: includeBody }) => {
      try {
        const result = await runResolveDocTool({
          filePath,
          projectSlug,
          force,
          includeBody,
        });

        return {
          content: [
            {
              type: 'text',
              text: formatJson(result),
            },
          ],
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: 'text', text: `resolve_doc failed: ${message}` }],
        };
      }
    },
  );

  return server;
}

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
