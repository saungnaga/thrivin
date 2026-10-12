/**
 * Minimal in-process fixed-window rate limiter (L-5 / B-2).
 *
 * Both public Scalev endpoints (create-order, webhook) are unauthenticated, so
 * they need a cost ceiling per client. Scope is deliberately the process: good
 * enough for a single Next.js instance and enough to stop a naive flood.
 *
 * ponytail: in-memory, per-instance — upgrade to Redis/Upstash the moment the
 * app runs more than one instance.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 5000;

export interface RateLimitRule {
  /** Stable key, e.g. `create-order:ip:1.2.3.4`. */
  key: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function checkRateLimit(
  { key, limit, windowMs }: RateLimitRule,
  now: number = Date.now()
): RateLimitResult {
  // ponytail: cheap full sweep keeps the map from growing unbounded; swap for
  // an LRU if key cardinality ever gets high.
  if (buckets.size > MAX_KEYS) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  return { ok: true, remaining: limit - bucket.count, retryAfterSeconds: 0 };
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

/** Rate limit on IP and (optionally) on the submitter's phone number. */
export function limitRequest(
  req: Request,
  scope: string,
  opts: { ipLimit: number; phoneLimit?: number; phone?: string | null; windowMs?: number }
): RateLimitResult {
  const windowMs = opts.windowMs ?? 60_000;
  const rules: RateLimitRule[] = [
    { key: `${scope}:ip:${clientIp(req)}`, limit: opts.ipLimit, windowMs },
  ];
  if (opts.phoneLimit && opts.phone) {
    rules.push({ key: `${scope}:phone:${opts.phone}`, limit: opts.phoneLimit, windowMs });
  }

  let last: RateLimitResult = { ok: true, remaining: Number.MAX_SAFE_INTEGER, retryAfterSeconds: 0 };
  for (const rule of rules) {
    const result = checkRateLimit(rule);
    if (!result.ok) return result;
    last = result;
  }
  return last;
}