// Sanitize before storing or transmitting chat, including recognizable pasted credentials.
// Arbitrary unlabeled secrets cannot be reliably identified: never solicit credentials.
export function redactSecrets(text: string): string {
  return text
    .replace(
      /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g,
      '[REDACTED KEY]',
    )
    .replace(/\b(?:sk-[\w-]{12,}|gh[pousr]_[\w]{20,}|AKIA[A-Z0-9]{16})\b/g, '[REDACTED]')
    .replace(/\bBearer\s+[\w.+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(
      /((?:api[_ -]?key|access[_ -]?token|token|password|passwd|secret|credential)["']?\s*(?:=|:|\bis\b)\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;]+)/gi,
      '$1[REDACTED]',
    )
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[REDACTED]@');
}
