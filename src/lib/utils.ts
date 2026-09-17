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

export function generateSlug(length = 8): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const byte of bytes) out += SLUG_ALPHABET[byte % SLUG_ALPHABET.length];
  return out;
}
