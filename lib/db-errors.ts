/**
 * Recognises the Prisma errors that a check-then-write race can produce.
 *
 * Several admin routes read to validate (is this email taken? does this person
 * still have contract letters?) and then write. Between those two statements
 * another request can change the answer, so the constraint fires anyway. Left
 * unhandled that surfaces as an opaque 500; recognised, it becomes the same
 * message the pre-check would have produced.
 *
 * Matched structurally rather than with `instanceof`, because the generated
 * client's error classes are not the ones a route can import cheaply.
 */
function codeOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function targets(error: unknown): string[] {
  const meta = (error as { meta?: { target?: unknown } } | null)?.meta;
  const target = meta?.target;
  if (Array.isArray(target)) return target.filter((entry): entry is string => typeof entry === "string");
  return typeof target === "string" ? [target] : [];
}

/** P2002: unique constraint violated, and the field involved was `email`. */
export function isUniqueEmailViolation(error: unknown): boolean {
  return codeOf(error) === "P2002" && targets(error).some((field) => field.toLowerCase().includes("email"));
}

/** P2002: a concurrent request tried to appoint a second CEO. */
export function isUniqueCeoSingletonViolation(error: unknown): boolean {
  return codeOf(error) === "P2002" && targets(error).some((field) => field.toLowerCase().includes("ceosingletonkey"));
}

/** P2003: a foreign key still references this row — e.g. a contract letter. */
export function isForeignKeyViolation(error: unknown): boolean {
  return codeOf(error) === "P2003";
}

/** P2025: the row vanished between the read and the write. */
export function isRecordNotFound(error: unknown): boolean {
  return codeOf(error) === "P2025";
}
