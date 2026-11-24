/**
 * The single row a query must return (an insert's `returning()`, a lookup by a key that was just checked).
 * Missing means a bug, not bad input, so it fails loudly instead of continuing with undefined.
 */
export function one<T>(rows: readonly T[], what = "row"): T {
  const row = rows[0];
  if (row === undefined) throw new Error(`Expected one ${what}, got none`);
  return row;
}

/** A value that must exist (a loader hit for a foreign key the database guarantees). */
export function present<T>(value: T | null | undefined, what = "value"): T {
  if (value === null || value === undefined) throw new Error(`Expected ${what} to exist`);
  return value;
}
