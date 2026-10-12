/**
 * Server-side validation for the onboarding profile (B-2).
 * The wizard validates in the browser; that is UX, not a control. Anything
 * outside these ranges/enums is rejected with 400 before it reaches the store,
 * Supabase, or a third party.
 */
import type { OnboardingProfile } from "./onboarding-store";

export const GENDERS = ["Laki-laki", "Perempuan"] as const;
export const ACTIVITY_LEVELS = [
  "Sedentari",
  "Ringan",
  "Moderat",
  "Aktif",
  "Sangat Aktif",
] as const;
export const WORKOUT_LOCATIONS = [
  "Di Rumah",
  "Di Gym",
  "Luar Ruangan",
  "Fleksibel",
] as const;
export const COMMUNICATION_STYLES = [
  "Santai & Akrab",
  "Tegas & Terarah",
  "Lembut & Empatik",
] as const;

export const AGE_RANGE = { min: 13, max: 100 };
export const WEIGHT_RANGE = { min: 30, max: 250 };
export const HEIGHT_RANGE = { min: 120, max: 240 };

const MAX_FOCUS_ITEMS = 8;
const MAX_TEXT = 200;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  profile?: OnboardingProfile;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function inRange(n: number, r: { min: number; max: number }): boolean {
  return n >= r.min && n <= r.max;
}

export function validateOnboardingProfile(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (input === null || input === undefined) return { ok: true, errors: [] };
  if (typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: ["onboarding must be an object"] };
  }

  const raw = input as Record<string, unknown>;
  const profile: OnboardingProfile = {};

  const age = num(raw.age);
  if (age === null || !inRange(age, AGE_RANGE)) {
    errors.push(`age must be a number between ${AGE_RANGE.min} and ${AGE_RANGE.max}`);
  } else {
    profile.age = Math.round(age);
  }

  const weight = num(raw.weight);
  if (weight === null || !inRange(weight, WEIGHT_RANGE)) {
    errors.push(`weight must be a number between ${WEIGHT_RANGE.min} and ${WEIGHT_RANGE.max}`);
  } else {
    profile.weight = Math.round(weight);
  }

  const height = num(raw.height);
  if (height === null || !inRange(height, HEIGHT_RANGE)) {
    errors.push(`height must be a number between ${HEIGHT_RANGE.min} and ${HEIGHT_RANGE.max}`);
  } else {
    profile.height = Math.round(height);
  }

  const enums: Array<[keyof OnboardingProfile, readonly string[]]> = [
    ["gender", GENDERS],
    ["activityLevel", ACTIVITY_LEVELS],
    ["workoutLocation", WORKOUT_LOCATIONS],
    ["communicationStyle", COMMUNICATION_STYLES],
  ];
  for (const [field, allowed] of enums) {
    const value = raw[field as string];
    if (value === null || value === undefined || value === "") continue;
    const str = String(value);
    if (!allowed.includes(str)) {
      errors.push(`${String(field)} must be one of: ${allowed.join(", ")}`);
      continue;
    }
    (profile as Record<string, unknown>)[field as string] = str;
  }

  const focus = raw.programFocus;
  if (focus !== null && focus !== undefined && focus !== "") {
    const items = (Array.isArray(focus) ? focus : String(focus).split(","))
      .map((v) => String(v).trim())
      .filter(Boolean);
    if (items.length > MAX_FOCUS_ITEMS) {
      errors.push(`programFocus accepts at most ${MAX_FOCUS_ITEMS} items`);
    } else {
      profile.programFocus = items.map((v) => v.slice(0, MAX_TEXT));
    }
  }

  if (raw.biggestChallenge !== null && raw.biggestChallenge !== undefined && raw.biggestChallenge !== "") {
    profile.biggestChallenge = String(raw.biggestChallenge).trim().slice(0, MAX_TEXT);
  }

  return errors.length ? { ok: false, errors } : { ok: true, errors: [], profile };
}