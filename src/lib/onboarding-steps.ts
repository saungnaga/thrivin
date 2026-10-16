/**
 * Definisi langkah onboarding yang WAJIB (A2) — satu tempat, dipakai UI dan gate.
 *
 * Sebelum ini "selesai" cuma berarti `localStorage` di browser (S0 B-5): state
 * onboarding tidak punya representasi server, dan `create-order` menerima
 * `onboarding` apa pun dari body. Di sini langkah-langkahnya didefinisikan
 * eksplisit (mirror wizard: langkah 1 = intro, 9 = checkout, 2–8 = data) supaya
 * server bisa memutuskan sendiri "sudah lengkap atau belum".
 *
 * Validasi memakai konstanta dari `validate-onboarding.ts` (satu sumber), lalu
 * gate memvalidasi ULANG profil gabungan dengan `validateOnboardingProfile()`
 * saat order mau dibuat — data yang tersimpan bisa saja sudah tidak valid.
 */
import { normalizePhone } from "./phone.ts";
import {
  ACTIVITY_LEVELS,
  AGE_RANGE,
  COMMUNICATION_STYLES,
  GENDERS,
  HEIGHT_RANGE,
  WEIGHT_RANGE,
  WORKOUT_LOCATIONS,
  validateOnboardingProfile,
} from "./validate-onboarding.ts";
import type { OnboardingProfile } from "./onboarding-store.ts";

export const INTRO_STEP = 1;
export const CHECKOUT_STEP = 9;
/** Langkah yang isinya menentukan kelengkapan profil (wizard: "Langkah 1–7 dari 7"). */
export const REQUIRED_STEPS: readonly number[] = [2, 3, 4, 5, 6, 7, 8];

/** Field yang dikumpulkan tiap langkah. Langkah 9 (checkout) tidak menyimpan data profil. */
export const STEP_FIELDS: Record<number, readonly string[]> = {
  2: ["name"],
  3: ["gender", "age"],
  4: ["height", "weight"],
  5: ["activityLevel", "workoutLocation"],
  6: ["programFocus"],
  7: ["biggestChallenge"],
  8: ["communicationStyle", "whatsappNumber"],
};

const MAX_NAME = 60;
const MAX_TEXT = 200;

export interface StepValidation {
  ok: boolean;
  errors: string[];
  data: Record<string, unknown>;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v === null || v === undefined ? "" : String(v).trim();
}

function isIntInRange(v: unknown, r: { min: number; max: number }): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  return rounded >= r.min && rounded <= r.max ? rounded : null;
}

function enumOrNull(v: unknown, allowed: readonly string[]): string | null {
  const s = str(v);
  return allowed.includes(s) ? s : null;
}

/**
 * Validasi input SATU langkah. Tanpa nilai wajib → gagal (supaya langkah kosong
 * tidak bisa "menghitung" sebagai selesai).
 */
export function validateStepInput(step: number, input: unknown): StepValidation {
  if (!REQUIRED_STEPS.includes(step)) {
    return { ok: false, errors: [`step ${step} tidak menyimpan data profil`], data: {} };
  }
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: ["data langkah harus objek"], data: {} };
  }
  const raw = input as Record<string, unknown>;
  const errors: string[] = [];
  const data: Record<string, unknown> = {};

  if (step === 2) {
    const name = str(raw.name);
    if (!name) errors.push("name wajib diisi");
    else data.name = name.slice(0, MAX_NAME);
  }

  if (step === 3) {
    const gender = enumOrNull(raw.gender, GENDERS);
    if (!gender) errors.push(`gender harus salah satu: ${GENDERS.join(", ")}`);
    else data.gender = gender;
    const age = isIntInRange(raw.age, AGE_RANGE);
    if (age === null) errors.push(`age harus ${AGE_RANGE.min}-${AGE_RANGE.max}`);
    else data.age = age;
  }

  if (step === 4) {
    const height = isIntInRange(raw.height, HEIGHT_RANGE);
    if (height === null) errors.push(`height harus ${HEIGHT_RANGE.min}-${HEIGHT_RANGE.max}`);
    else data.height = height;
    const weight = isIntInRange(raw.weight, WEIGHT_RANGE);
    if (weight === null) errors.push(`weight harus ${WEIGHT_RANGE.min}-${WEIGHT_RANGE.max}`);
    else data.weight = weight;
  }

  if (step === 5) {
    const activity = enumOrNull(raw.activityLevel, ACTIVITY_LEVELS);
    if (!activity) errors.push(`activityLevel harus salah satu: ${ACTIVITY_LEVELS.join(", ")}`);
    else data.activityLevel = activity;
    const location = enumOrNull(raw.workoutLocation, WORKOUT_LOCATIONS);
    if (!location) errors.push(`workoutLocation harus salah satu: ${WORKOUT_LOCATIONS.join(", ")}`);
    else data.workoutLocation = location;
  }

  if (step === 6) {
    const focus = (Array.isArray(raw.programFocus) ? raw.programFocus : str(raw.programFocus).split(","))
      .map((v) => str(v))
      .filter(Boolean)
      .slice(0, 8)
      .map((v) => v.slice(0, MAX_TEXT));
    if (focus.length === 0) errors.push("programFocus minimal 1 pilihan");
    else data.programFocus = focus;
  }

  if (step === 7) {
    const challenge = str(raw.biggestChallenge);
    if (!challenge) errors.push("biggestChallenge wajib diisi");
    else data.biggestChallenge = challenge.slice(0, MAX_TEXT);
  }

  if (step === 8) {
    const style = enumOrNull(raw.communicationStyle, COMMUNICATION_STYLES);
    if (!style) errors.push(`communicationStyle harus salah satu: ${COMMUNICATION_STYLES.join(", ")}`);
    else data.communicationStyle = style;
    const phone = normalizePhone(raw.whatsappNumber);
    if (!phone) errors.push("whatsappNumber tidak valid");
    else data.whatsappNumber = phone;
  }

  return { ok: errors.length === 0, errors, data };
}

export interface ProgressSteps {
  [step: string]: Record<string, unknown> | undefined;
}

/**
 * Kelengkapan dari data yang TERSIMPAN di server (bukan dari klaim client).
 * `invalidSteps` = langkah yang ada tapi isinya tidak lagi lolos validasi.
 */
export function checkRequiredSteps(steps: unknown): {
  complete: boolean;
  missingSteps: number[];
  invalidSteps: Array<{ step: number; errors: string[] }>;
} {
  const map: ProgressSteps = (steps && typeof steps === "object" ? steps : {}) as ProgressSteps;
  const missingSteps: number[] = [];
  const invalidSteps: Array<{ step: number; errors: string[] }> = [];

  for (const step of REQUIRED_STEPS) {
    const value = map[String(step)];
    if (!value) {
      missingSteps.push(step);
      continue;
    }
    const validation = validateStepInput(step, value);
    if (!validation.ok) invalidSteps.push({ step, errors: validation.errors });
  }

  return {
    complete: missingSteps.length === 0 && invalidSteps.length === 0,
    missingSteps,
    invalidSteps,
  };
}

/**
 * Gabungkan langkah 2–8 jadi satu profil, lalu validasi dengan validator profil
 * yang sudah dipakai jalur checkout (satu aturan, bukan dua).
 */
export function mergedProfileFromSteps(steps: unknown): {
  ok: boolean;
  errors: string[];
  profile: OnboardingProfile | null;
  name: string | null;
  phone: string | null;
} {
  const map: ProgressSteps = (steps && typeof steps === "object" ? steps : {}) as ProgressSteps;
  const merged: Record<string, unknown> = {};
  for (const step of REQUIRED_STEPS) {
    Object.assign(merged, map[String(step)] || {});
  }

  const errors: string[] = [];
  const name = str(merged.name);
  if (!name) errors.push("name wajib diisi");
  const phone = normalizePhone(merged.whatsappNumber);

  const { name: _n, whatsappNumber: _p, ...profileFields } = merged;
  const validated = validateOnboardingProfile(profileFields);
  if (!validated.ok) errors.push(...validated.errors);

  return {
    ok: errors.length === 0,
    errors,
    profile: validated.ok ? validated.profile || null : null,
    name: name || null,
    phone,
  };
}
