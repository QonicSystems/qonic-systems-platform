import { ROLE } from "@/lib/auth/roles";

/**
 * A CEO is the one super-admin principal for a Qonic workspace. Persisting a
 * shared, unique value for that account makes the rule database-enforced as
 * well as checked by the People APIs, including concurrent requests.
 */
export const CEO_SINGLETON_KEY = "ceo";
export const CEO_ALREADY_ASSIGNED_MESSAGE = "Only one CEO & Founder account is allowed in Qonic Systems.";
export const CEO_TRANSFER_ONLY_MESSAGE = "Only the current CEO can transfer the CEO role to another person.";
export const CEO_TRANSFER_ACTIVE_PERSON_MESSAGE = "The CEO role can only be transferred to an active person.";
export const CEO_TRANSFER_EXISTING_PERSON_MESSAGE = "Create the person with a non-CEO role first, then the current CEO can transfer the CEO role to them.";

export function ceoSingletonValue(roleKey: string): string | null {
  return roleKey === ROLE.CEO ? CEO_SINGLETON_KEY : null;
}

export function mayTransferCeo(actorId: string, currentCeoId: string | null | undefined): boolean {
  return Boolean(currentCeoId) && actorId === currentCeoId;
}
