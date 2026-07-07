const CYRILLIC_REGEX = /[А-Яа-яЁё]/g;

export function countCyrillicRatio(text: string): number {
  if (text.length === 0) {
    return 0;
  }

  const matches = text.match(CYRILLIC_REGEX);
  return (matches?.length ?? 0) / text.length;
}
