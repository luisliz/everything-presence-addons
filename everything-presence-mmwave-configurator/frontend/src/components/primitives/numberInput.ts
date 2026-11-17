const NUMBER_PATTERN = /^[-+]?(\d+\.?\d*|\.\d+)$/;

/** Parses what a user typed (comma or dot decimals); null while the text is not a complete number. */
export function parseNumberInput(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  return NUMBER_PATTERN.test(normalized) ? Number(normalized) : null;
}

export function clampNumber(value: number, min?: number, max?: number): number {
  return Math.min(
    max ?? Number.POSITIVE_INFINITY,
    Math.max(min ?? Number.NEGATIVE_INFINITY, value),
  );
}

export function isInRange(value: number, min?: number, max?: number): boolean {
  return clampNumber(value, min, max) === value;
}

export function formatNumber(value: number, step?: number): string {
  const decimals =
    step === undefined ? 3 : (String(step).split('.')[1]?.length ?? 0);
  return String(Number(value.toFixed(decimals)));
}
