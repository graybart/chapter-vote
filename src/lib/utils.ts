import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Normalize a GTID for comparison/storage: digits only. */
export function normalizeGtid(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

const SLUG_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // unambiguous

/**
 * NOTE: this is the ONLY use of randomness in the app, and it never touches
 * a vote outcome — it just makes the voter link hard to guess. Vote counting
 * (src/lib/irv.ts) is a pure function of the ballots, with no draws or
 * coin-flips: an unbreakable tie is reported, never resolved by chance.
 */

export function generateSlug(length = 8): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const byte of bytes) out += SLUG_ALPHABET[byte % SLUG_ALPHABET.length];
  return out;
}
