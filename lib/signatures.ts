import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Handwritten signatures used on issued documents.
 *
 * WHY THIS IS KEYED BY PERSON, NOT HARDCODED TO THE CEO
 * ----------------------------------------------------
 * Applying someone's signature to a document is a claim that *they* authorised
 * it. A contract letter can be released by the CEO or the Co-Founder, so
 * stamping the CEO's signature on every letter would put their name on
 * documents they never approved — a misrepresentation, and one that would be
 * very hard to unpick later given letters are regenerated on demand.
 *
 * So a signature is only ever rendered for the person the database records as
 * the releaser, and only for people who actually have one on file. Anyone
 * without one falls back to their typed name; no signature is ever substituted.
 *
 * WHY assets/ AND NOT public/
 * ---------------------------
 * Files under public/ are served to anyone on the internet with no auth check.
 * A real signature image is forgeable material, so it lives outside the served
 * tree and reaches the browser only inside a rendered PDF, behind the same
 * permission check as the letter itself. Do not move this into public/.
 */
const SIGNATURE_FILES: Record<string, string> = {
  "founder@qonicsystems.com": "founder.png",
};

const cache = new Map<string, Buffer | null>();

/**
 * The signature on file for an email address, or null if that person has none.
 *
 * Never throws: a missing or unreadable file degrades to a typed name rather
 * than failing the document render, because a letter that will not open is a
 * worse outcome than one without a handwritten signature.
 */
export function signatureFor(email: string | null | undefined): Buffer | null {
  if (!email) return null;
  const key = email.toLowerCase();
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const file = SIGNATURE_FILES[key];
  let buffer: Buffer | null = null;
  if (file) {
    try {
      buffer = readFileSync(join(process.cwd(), "assets", "signatures", file));
    } catch (error) {
      console.error(`Signature file missing for ${key}`, error);
    }
  }
  cache.set(key, buffer);
  return buffer;
}
