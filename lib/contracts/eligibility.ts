import type { ContractStatus } from "@/lib/generated/prisma/enums";

/**
 * A contract becomes accepted only when its subject has acknowledged it. This
 * preserves the existing lifecycle name while giving delivery one shared,
 * unambiguous eligibility rule.
 */
export const ACCEPTED_CONTRACT_STATUS = "ACKNOWLEDGED" as const;

export function hasAcceptedContract(letters: ReadonlyArray<{ status: ContractStatus }>): boolean {
  return letters.some((letter) => letter.status === ACCEPTED_CONTRACT_STATUS);
}
