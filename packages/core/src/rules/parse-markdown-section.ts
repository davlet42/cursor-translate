export function parseMarkdownSection(markdown: string, sectionTitle: string): string | null {
  const normalizedTitle = sectionTitle.trim().toLowerCase();
  const headingPattern = new RegExp(
    `^#{1,6}\\s+${escapeRegExp(sectionTitle)}\\s*$`,
    'im',
  );
  const match = markdown.match(headingPattern);
  if (!match || match.index === undefined) {
    return null;
  }

  const start = match.index + match[0].length;
  const rest = markdown.slice(start);
  const nextHeading = rest.search(/^#{1,6}\s+\S/m);
  const body = nextHeading === -1 ? rest : rest.slice(0, nextHeading);

  const content = body.trim();
  if (!content) {
    return null;
  }

  if (normalizedTitle === 'cursor-translate') {
    return content;
  }

  return content;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
