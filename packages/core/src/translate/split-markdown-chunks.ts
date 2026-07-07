export function splitMarkdownChunks(text: string, maxChunkChars: number): string[] {
  if (text.length <= maxChunkChars) {
    return [text];
  }

  const sections = text.split(/(?=^## )/m);
  const chunks: string[] = [];
  let current = '';

  for (const section of sections) {
    if (`${current}${section}`.length > maxChunkChars && current) {
      chunks.push(current);
      current = section;
      continue;
    }
    current += section;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.flatMap((chunk) =>
    chunk.length > maxChunkChars
      ? chunk.match(new RegExp(`.{1,${maxChunkChars}}`, 'gs')) ?? [chunk]
      : [chunk],
  );
}
