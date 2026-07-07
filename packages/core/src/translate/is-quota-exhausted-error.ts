const QUOTA_PATTERNS = [
  /rate\s*limit/i,
  /usage\s*limit/i,
  /quota/i,
  /too many requests/i,
  /\b429\b/,
  /exceeded.*usage/i,
  /included\s*api\s*usage/i,
  /billing/i,
  /spend\s*limit/i,
];

export function isQuotaExhaustedError(message: string): boolean {
  return QUOTA_PATTERNS.some((pattern) => pattern.test(message));
}
