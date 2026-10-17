/**
 * F-W4-1c — worker cancel order Scalev saat TTL retire (kartu t_1d1cf77f).
 *
 * Masalah yang ditutup: satu nomor bisa punya DUA link bayar hidup (order lama
 * belum dibayar yang ditinggalkan + order baru setelah TTL), jadi pelanggan bisa
 * membayar dua kali dan mendapat dua aktivasi. Mitigasinya: order basi
 * DIBATALKAN di Scalev (`POST /v3/orders/change-status`, `status=canceled`)
 * SEBELUM order pengganti boleh terbit.
 *
 * Batas modul ini:
 * - hanya HTTP + klasifikasi hasil; state DB dipindahkan lewat RPC
 *   (`claim_checkout_cancel` / `record_checkout_cancel_result`) supaya tidak ada
 *   panggilan Scalev dari SQL.
 * - `ids` WAJIB canonical UUIDv7 (`orderData.id`), bukan nomor order bisnis.
 * - hasil yang tidak terdaftar TIDAK dipetakan berdasarkan kelas HTTP: default
 *   TAHAN (`cancel_pending` + retry) — lihat M-5.
 * - nol PII di log: hanya id klaim/order, status HTTP, dan jumlah id.
 *
 * ponytail: retry/backoff/budget = konstanta (M-1); jadikan parameter kalau ops
 * butuh tuning. Breaker 401 hidup di memori proses — cukup untuk mencegah badai
 * 401 antar-request; kalau nanti butuh lintas-proses, pindahkan ke tabel/Redis.
 */
import { redactError } from "./onboarding-store.ts";
import {
  claimCheckoutCancel,
  listPendingCancels,
  recordCheckoutCancelResult,
  type CancelClaim,
} from "./checkout-gate.ts";

export const CANCEL_PATH = "/v3/orders/change-status";
/** M-1: 5 detik per HTTP call. */
export const CANCEL_TIMEOUT_MS = 5000;
/** M-1: 3 attempt total per batch (1 awal + 2 retry). */
export const CANCEL_MAX_ATTEMPTS = 3;
/** M-1: backoff bounded 250 ms lalu 1 detik. */
export const CANCEL_BACKOFF_MS = [250, 1000];
/** M-1: budget total jalur checkout 15 detik. */
export const CANCEL_BUDGET_MS = 15000;
/** Cooldown breaker 401: cukup lama untuk berhenti membentur, cukup pendek untuk pulih. */
export const BREAKER_COOLDOWN_MS = 60_000;

const SCALEV_API_BASE = process.env.SCALEV_API_BASE_URL || "https://api.scalev.com";

export type CancelVerdict = "success" | "transient" | "terminal" | "unauthorized";

export interface CancelClassification {
  verdict: CancelVerdict;
  /** Nol PII: deskripsi kelas hasil, bukan badan response. */
  detail: string;
}

/**
 * Verifikasi body cancel (B-1.3): setiap ID yang DIKIRIM wajib muncul di `data[]`
 * dengan `status` tepat `"canceled"`. Response parsial = bukan sukses.
 */
export function verifyCancelResponse(
  body: unknown,
  sentIds: string[]
): { ok: boolean; detail: string } {
  const rows = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(rows)) return { ok: false, detail: "cancel response tanpa data[]" };
  const byId = new Map<string, string>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const id = (row as { id?: unknown }).id;
    if (typeof id === "string" && id) byId.set(id, String((row as { status?: unknown }).status ?? ""));
  }
  const missing = sentIds.filter((id) => !byId.has(id));
  if (missing.length > 0) return { ok: false, detail: `data[] tidak memuat ${missing.length}/${sentIds.length} id` };
  const wrong = sentIds.filter((id) => byId.get(id) !== "canceled");
  if (wrong.length > 0) return { ok: false, detail: `${wrong.length}/${sentIds.length} id tidak berstatus canceled` };
  return { ok: true, detail: `${sentIds.length} id terverifikasi canceled` };
}

/**
 * Kelas hasil cancel (tabel B-3 + M-5). Sengaja TIDAK memakai kelas HTTP
 * (4xx/5xx) sebagai tebakan: status yang tidak terdaftar ⇒ TAHAN.
 */
export function classifyCancelResponse(
  status: number,
  body: unknown,
  sentIds: string[]
): CancelClassification {
  if (!Number.isFinite(status)) return { verdict: "transient", detail: "timeout/network" };
  if (status === 401) return { verdict: "unauthorized", detail: "401 credential/scope" };
  if (status >= 200 && status < 300) {
    // 2xx parsial/malformed tetap TAHAN (M-5) — bukan sukses, bukan terminal.
    const verified = verifyCancelResponse(body, sentIds);
    return verified.ok
      ? { verdict: "success", detail: verified.detail }
      : { verdict: "transient", detail: `2xx tak terverifikasi: ${verified.detail}` };
  }
  if (status === 400 || status === 403) return { verdict: "terminal", detail: `${status} terminal` };
  if (status === 404 || status === 409) {
    // "already canceled" hanya sah kalau BODY-nya membuktikan target sudah canceled.
    const verified = verifyCancelResponse(body, sentIds);
    return verified.ok
      ? { verdict: "success", detail: `${status} terverifikasi canceled` }
      : { verdict: "terminal", detail: `${status} tanpa bukti canceled` };
  }
  if (status === 429 || status >= 500) return { verdict: "transient", detail: `${status} transient` };
  // 3xx, 408, 425, 499, dan status tak terdaftar lainnya ⇒ default TAHAN (M-5).
  return { verdict: "transient", detail: `status tak terdaftar ${status} ⇒ tahan` };
}

// ── Circuit breaker 401 (B-3) ────────────────────────────────────────────────
let breakerOpenedAt: number | null = null;

export function cancelBreakerOpen(now: number = Date.now()): boolean {
  return breakerOpenedAt !== null && now - breakerOpenedAt < BREAKER_COOLDOWN_MS;
}
export function openCancelBreaker(now: number = Date.now()): void {
  breakerOpenedAt = now;
}
export function resetCancelBreaker(): void {
  breakerOpenedAt = null;
}

export interface CancelRunResult {
  /** Baris yang berhasil dilease worker ini (termasuk yang tanpa canonical ID). */
  attempted: number;
  retired: number;
  pending: number;
  failed: number;
  latePayment: number;
  /** Semua baris yang perlu dicancel selesai & terverifikasi ⇒ replacement boleh. */
  resolvedAll: boolean;
  /** 401: berhenti total, jangan klasifikasikan per nomor. */
  circuitOpen: boolean;
  /** Key cancel belum dipasang ⇒ fail-closed, NOL panggilan Scalev. */
  unconfigured: boolean;
}

export interface CancelRunOptions {
  phone?: string;
  claimIds?: string[];
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

async function sendCancelRequest(
  ids: string[],
  fetchImpl: typeof fetch
): Promise<{ status: number; body: unknown }> {
  const apiKey = process.env.SCALEV_CANCEL_API_KEY || "";
  try {
    const res = await fetchImpl(`${SCALEV_API_BASE}${CANCEL_PATH}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ ids, status: "canceled", by: "thrivin-checkout-ttl" }),
      signal: AbortSignal.timeout(CANCEL_TIMEOUT_MS),
    } as RequestInit);
    const raw = await res.text().catch(() => "");
    let body: unknown = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = null; // body tak terbaca ⇒ M-5: TAHAN, dan JANGAN di-log apa adanya
    }
    return { status: res.status, body };
  } catch (err) {
    console.warn("[checkout-cancel] timeout/network:", redactError(err));
    return { status: Number.NaN, body: null };
  }
}

function alertOps(line: string): void {
  // Alert = baris log ber-prefix tetap; sisa sistem membaca log ini (pola sama
  // dengan promo reconcile). Isinya HANYA id + status, tidak pernah PII.
  console.error(`[checkout-cancel][ALERT] ${line}`);
}

/**
 * Cancel semua order basi milik satu nomor (atau daftar claim id eksplisit).
 * Idempotent: baris yang sudah `retired`/dibayar tidak ikut; attempt baru butuh
 * lease `cancel_claimed_until` (M-3).
 */
export async function cancelStaleOrders(opts: CancelRunOptions = {}): Promise<CancelRunResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? (() => Date.now());
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const empty: CancelRunResult = {
    attempted: 0,
    retired: 0,
    pending: 0,
    failed: 0,
    latePayment: 0,
    resolvedAll: false,
    circuitOpen: false,
    unconfigured: false,
  };

  if (cancelBreakerOpen(now())) {
    alertOps("circuit breaker 401 AKTIF — cancel dilewati (fail-closed, cek credential/scope)");
    return { ...empty, circuitOpen: true };
  }
  if (!process.env.SCALEV_CANCEL_API_KEY) {
    alertOps("SCALEV_CANCEL_API_KEY belum dipasang — cancel DITAHAN, nol panggilan Scalev");
    return { ...empty, unconfigured: true };
  }

  const pendingRows = opts.claimIds?.length
    ? opts.claimIds.map((id) => ({ claimId: id, scalevOrderUuid: null as string | null }))
    : await listPendingCancels(opts.phone || "");
  if (pendingRows.length === 0) return { ...empty, resolvedAll: true };

  // Lease attempt per baris (M-3). Baris yang tidak bisa diklaim (pegang worker
  // lain / sudah dibayar / status berubah / masih backoff) tidak ikut dikirim.
  const claimed: CancelClaim[] = [];
  for (const row of pendingRows) {
    const claim = await claimCheckoutCancel(row.claimId);
    if (claim.status === "claimed") claimed.push(claim);
  }
  if (claimed.length === 0) return { ...empty, pending: pendingRows.length };

  // V-5: laporan dihitung dari KEADAAN yang dikembalikan RPC, bukan dari niat
  // worker. RPC bisa menjawab `late_payment` (baris dibayar di tengah attempt)
  // atau `not_found` (baris sudah dipindahkan pihak lain), dan `resolvedAll`
  // hanya boleh true kalau tidak ada sisa yang belum terverifikasi.
  const tally = { retired: 0, pending: 0, failed: 0, latePayment: 0 };
  const record = async (
    claimId: string,
    result: "retired" | "cancel_pending" | "cancel_failed",
    error?: string
  ): Promise<void> => {
    const r = await recordCheckoutCancelResult(claimId, result, error);
    if (r.status === "late_payment") {
      tally.latePayment++;
      return;
    }
    if (r.state === "retired") tally.retired++;
    else if (r.state === "cancel_failed") tally.failed++;
    // `recorded`+cancel_pending, `not_found` (baris sudah pindah state), dan
    // error pencatatan ⇒ semua tetap "belum terverifikasi": fail-closed, jangan
    // pernah melaporkan resolvedAll dari tebakan.
    else tally.pending++;
  };
  const result = (attempted: number): CancelRunResult => ({
    ...empty,
    attempted,
    retired: tally.retired,
    pending: tally.pending,
    failed: tally.failed,
    latePayment: tally.latePayment,
    resolvedAll: tally.pending === 0 && tally.failed === 0,
  });

  // V-2: HANYA baris yang canonical ID-nya benar-benar ikut dikirim yang boleh
  // dicap `retired`. Baris tanpa canonical ID tidak pernah diminta dibatalkan
  // Scalev, jadi `retired` di situ = sukses palsu ⇒ penjaga per-nomor terbuka
  // dan order kedua lahir di belakang link lama yang masih hidup. Catat satu per
  // satu sebagai `cancel_failed` (kontrak B-1.4: antrean owner, bukan ID tebakan).
  const withId = claimed.filter((c) => !!c.scalevOrderUuid);
  const withoutId = claimed.filter((c) => !c.scalevOrderUuid);
  for (const claim of withoutId) {
    await record(claim.claimId, "cancel_failed", "missing_canonical_order_id");
  }
  if (withoutId.length > 0) {
    alertOps(
      `${withoutId.length}/${claimed.length} baris cancel tanpa canonical ID — antrean rekonsiliasi owner`
    );
  }

  const ids = withId.map((c) => String(c.scalevOrderUuid));
  if (ids.length === 0) return result(claimed.length);

  const startedAt = now();
  let last: CancelClassification = { verdict: "transient", detail: "belum dicoba" };
  for (let attempt = 1; attempt <= CANCEL_MAX_ATTEMPTS; attempt++) {
    if (now() - startedAt > CANCEL_BUDGET_MS) {
      last = { verdict: "transient", detail: "budget cancel habis" };
      break;
    }
    const res = await sendCancelRequest(ids, fetchImpl);
    const verdict = classifyCancelResponse(res.status, res.body, ids);
    last = verdict;
    console.warn(
      `[checkout-cancel] attempt ${attempt}/${CANCEL_MAX_ATTEMPTS} status=${Number.isFinite(res.status) ? res.status : "network"} ids=${ids.length} ⇒ ${verdict.verdict} (${verdict.detail})`
    );

    if (verdict.verdict === "success") {
      for (const claim of withId) await record(claim.claimId, "retired");
      return result(claimed.length);
    }
    if (verdict.verdict === "unauthorized") {
      // 401 = alarm global + breaker; TIDAK mengunci/mengklasifikasikan per nomor.
      openCancelBreaker(now());
      for (const claim of withId) await record(claim.claimId, "cancel_pending", "cancel_401");
      alertOps("401 dari Scalev — breaker dibuka, cek credential/scope (tidak ada nomor yang dikunci)");
      return { ...result(claimed.length), circuitOpen: true };
    }
    if (verdict.verdict === "terminal") {
      for (const claim of withId) await record(claim.claimId, "cancel_failed", verdict.detail);
      alertOps(
        `${withId.length} cancel GAGAL terminal (${verdict.detail}) — antrean rekonsiliasi owner; checkout ditahan`
      );
      return result(claimed.length);
    }
    if (attempt < CANCEL_MAX_ATTEMPTS) await sleep(CANCEL_BACKOFF_MS[attempt - 1] ?? 0);
  }

  // Budget/attempt habis pada hasil transient: tinggalkan `cancel_pending` +
  // jejak retry, dan JANGAN cetak order baru (fail-closed).
  for (const claim of withId) {
    await record(claim.claimId, "cancel_pending", last.detail);
  }
  alertOps(`${withId.length} cancel masih pending (${last.detail}) — retry berikutnya lewat sweep/checkout`);
  return result(claimed.length);
}
