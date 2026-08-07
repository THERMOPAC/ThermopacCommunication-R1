/**
 * Field-level merge semantics for design-workspace input-section saves.
 *
 * A save payload is merged OVER the existing section data key-by-key:
 *   - keys present in the payload overwrite the stored value;
 *   - keys absent from the payload are PRESERVED (a partial update can
 *     never erase the rest of the section);
 *   - a key explicitly set to null in the payload is DELETED from the
 *     section (the only way to remove a field).
 * Values are replaced whole (no deep merge) — arrays such as nozzle_rows
 * are always sent complete by the client.
 */
export function mergeSectionData(
  existing: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(existing ?? {}) };
  for (const [key, value] of Object.entries(incoming)) {
    if (value === null) delete merged[key];
    else merged[key] = value;
  }
  return merged;
}
