export type FailLevel = "error" | "warning" | "none";

export function parseFailLevel(value: string): FailLevel {
  if (value === "error" || value === "warning" || value === "none") return value;
  throw new Error(`Invalid --fail-on "${value}". Expected error, warning, or none.`);
}

export function parseInteger(
  value: string,
  option: string,
  range: { min: number; max?: number },
): number {
  if (!/^-?\d+$/.test(value)) {
    throw new Error(`Invalid ${option} "${value}". Expected an integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < range.min || (range.max != null && parsed > range.max)) {
    const expected = range.max == null ? `at least ${range.min}` : `${range.min}-${range.max}`;
    throw new Error(`Invalid ${option} "${value}". Expected ${expected}.`);
  }
  return parsed;
}
