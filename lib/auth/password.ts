import { randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";

// OWASP baseline for argon2id: 19 MiB, 2 iterations, 1 lane.
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

/**
 * A real hash of a throwaway value, computed once on first use. Verifying against
 * it when no user matches keeps the failure path the same cost as the success
 * path, so response timing cannot reveal which emails are registered.
 *
 * It must be a genuine argon2 hash — a hand-written constant would fail to parse
 * and return immediately, which is exactly the timing signal we are removing.
 */
let dummyHashPromise: Promise<string> | undefined;

function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hash(randomBytes(32).toString("hex"), OPTIONS);
  return dummyHashPromise;
}

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password, OPTIONS);
  } catch {
    // A malformed stored hash must read as "wrong password", never as an error
    // that leaks that the account exists.
    return false;
  }
}

/** Burn equivalent CPU when no account matched, to flatten the timing signal. */
export async function verifyDummyPassword(password: string): Promise<void> {
  try {
    await verify(await getDummyHash(), password, OPTIONS);
  } catch {
    // Expected to fail; we only want the work done.
  }
}

export const MINIMUM_PASSWORD_LENGTH = 12;

export function describePasswordProblem(password: string): string | undefined {
  if (password.length < MINIMUM_PASSWORD_LENGTH) return `Password must be at least ${MINIMUM_PASSWORD_LENGTH} characters.`;
  if (!/[a-z]/.test(password)) return "Password must include a lowercase letter.";
  if (!/[A-Z]/.test(password)) return "Password must include an uppercase letter.";
  if (!/[0-9]/.test(password)) return "Password must include a number.";
  return undefined;
}
