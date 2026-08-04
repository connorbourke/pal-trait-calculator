import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { sendJson } from "./dataset";

/** Max JSON body size we will accept (bytes of serialized body). */
export const MAX_BODY_BYTES = 128 * 1024;
/** Max breeding steps in an injected tree. */
export const MAX_TREE_STEPS = 20;
/** Max specimen cards per request. */
export const MAX_SPECIMENS = 30;
/** Max waypoints on a chain request. */
export const MAX_WAYPOINTS = 8;
/** Max path candidates returned. */
export const MAX_PATH_LIMIT = 10;
/** Default path candidates. */
export const DEFAULT_PATH_LIMIT = 5;
/** Soft cap on freeform strings (names, notes, roles). */
export const MAX_STRING_LEN = 200;
/** Longer notes / descriptions. */
export const MAX_NOTE_LEN = 500;

type LimitTier = "post" | "get" | "share";

const LIMITS: Record<
  LimitTier,
  { requests: number; window: `${number} s` | `${number} m` }
> = {
  post: { requests: 30, window: "1 m" },
  share: { requests: 40, window: "1 m" },
  get: { requests: 90, window: "1 m" },
};

type MemoryBucket = { count: number; resetAt: number };
const memoryBuckets = new Map<string, MemoryBucket>();

let upstashLimiters: Partial<Record<LimitTier, Ratelimit>> | null = null;

function getUpstashLimiters(): Partial<Record<LimitTier, Ratelimit>> | null {
  if (upstashLimiters) return upstashLimiters;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const redis = new Redis({ url, token });
  upstashLimiters = {
    post: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(
        LIMITS.post.requests,
        LIMITS.post.window,
      ),
      prefix: "pal-api:post",
      analytics: false,
    }),
    share: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(
        LIMITS.share.requests,
        LIMITS.share.window,
      ),
      prefix: "pal-api:share",
      analytics: false,
    }),
    get: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(LIMITS.get.requests, LIMITS.get.window),
      prefix: "pal-api:get",
      analytics: false,
    }),
  };
  return upstashLimiters;
}

function clientIp(req: VercelRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]!.trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].split(",")[0]!.trim();
  }
  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) return realIp.trim();
  return req.socket?.remoteAddress ?? "unknown";
}

function extractApiKey(req: VercelRequest): string | null {
  const headerKey = req.headers["x-api-key"];
  if (typeof headerKey === "string" && headerKey.trim()) {
    return headerKey.trim();
  }
  const auth = req.headers.authorization;
  if (typeof auth === "string") {
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

/**
 * Require API key on mutating / expensive routes.
 * - If `PAL_API_KEY` is set: Bearer or x-api-key must match.
 * - If unset on Vercel: fail closed (503).
 * - If unset locally: allow (dev convenience).
 */
export function requireApiKey(
  req: VercelRequest,
  res: VercelResponse,
): boolean {
  const expected = process.env.PAL_API_KEY?.trim();
  if (!expected) {
    if (process.env.VERCEL) {
      sendJson(res, 503, {
        error: "API key not configured",
        hint: "Set PAL_API_KEY in the Vercel project env.",
      }, req);
      return false;
    }
    return true;
  }

  const provided = extractApiKey(req);
  if (!provided || !timingSafeEqual(provided, expected)) {
    sendJson(res, 401, {
      error: "Unauthorized",
      hint: "Send Authorization: Bearer <PAL_API_KEY> or x-api-key: <PAL_API_KEY>.",
    }, req);
    return false;
  }
  return true;
}

async function memoryRateLimit(
  key: string,
  tier: LimitTier,
): Promise<{ success: boolean; remaining: number; reset: number }> {
  const { requests, window } = LIMITS[tier];
  const windowMs = windowToMs(window);
  const now = Date.now();
  const bucket = memoryBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: requests - 1, reset: now + windowMs };
  }
  if (bucket.count >= requests) {
    return { success: false, remaining: 0, reset: bucket.resetAt };
  }
  bucket.count += 1;
  return {
    success: true,
    remaining: requests - bucket.count,
    reset: bucket.resetAt,
  };
}

function windowToMs(window: string): number {
  const match = /^(\d+)\s*([sm])$/i.exec(window.trim());
  if (!match) return 60_000;
  const n = Number(match[1]);
  return match[2]!.toLowerCase() === "s" ? n * 1000 : n * 60_000;
}

/**
 * Rate-limit by IP (+ api key fingerprint when present).
 * Uses Upstash when configured; otherwise in-memory (per isolate).
 */
export async function enforceRateLimit(
  req: VercelRequest,
  res: VercelResponse,
  tier: LimitTier,
): Promise<boolean> {
  const ip = clientIp(req);
  const keyHint = extractApiKey(req)?.slice(0, 8) ?? "anon";
  const id = `${tier}:${ip}:${keyHint}`;

  const limiters = getUpstashLimiters();
  const limiter = limiters?.[tier];

  let success: boolean;
  let remaining: number;
  let reset: number;

  if (limiter) {
    const result = await limiter.limit(id);
    success = result.success;
    remaining = result.remaining;
    reset = result.reset;
  } else {
    const result = await memoryRateLimit(id, tier);
    success = result.success;
    remaining = result.remaining;
    reset = result.reset;
  }

  res.setHeader("X-RateLimit-Limit", String(LIMITS[tier].requests));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, remaining)));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(reset / 1000)));

  if (!success) {
    const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
    res.setHeader("Retry-After", String(retryAfter));
    sendJson(res, 429, {
      error: "Rate limit exceeded",
      retryAfterSeconds: retryAfter,
    }, req);
    return false;
  }
  return true;
}

/** Reject oversized request bodies early. */
export function enforceBodySize(
  req: VercelRequest,
  res: VercelResponse,
): boolean {
  const lenHeader = req.headers["content-length"];
  if (typeof lenHeader === "string") {
    const len = Number(lenHeader);
    if (Number.isFinite(len) && len > MAX_BODY_BYTES) {
      sendJson(res, 413, {
        error: "Payload too large",
        maxBytes: MAX_BODY_BYTES,
      }, req);
      return false;
    }
  }

  if (req.body != null) {
    try {
      const size = Buffer.byteLength(JSON.stringify(req.body), "utf8");
      if (size > MAX_BODY_BYTES) {
        sendJson(res, 413, {
          error: "Payload too large",
          maxBytes: MAX_BODY_BYTES,
        }, req);
        return false;
      }
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" }, req);
      return false;
    }
  }
  return true;
}

export function clampPathLimit(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_PATH_LIMIT;
  return Math.max(1, Math.min(Math.floor(n), MAX_PATH_LIMIT));
}

export function clampString(
  value: unknown,
  max = MAX_STRING_LEN,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

export function clampStringArray(
  value: unknown,
  maxItems: number,
  maxLen = MAX_STRING_LEN,
): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (out.length >= maxItems) break;
    const s = clampString(item, maxLen);
    if (s) out.push(s);
  }
  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function sanitizeTreePal(value: unknown): unknown {
  if (typeof value === "string") {
    return clampString(value) ?? "";
  }
  if (!isPlainObject(value)) return null;
  const species = clampString(value.species);
  if (!species) return null;
  const out: Record<string, unknown> = { species };
  const internalName = clampString(value.internalName);
  if (internalName) out.internalName = internalName;
  const nickname = clampString(value.nickname);
  if (nickname) out.nickname = nickname;
  if (
    value.gender === "male" ||
    value.gender === "female" ||
    value.gender === "unknown"
  ) {
    out.gender = value.gender;
  }
  if (typeof value.level === "number" && Number.isFinite(value.level)) {
    out.level = Math.max(0, Math.min(100, Math.floor(value.level)));
  }
  if (Array.isArray(value.passives)) {
    out.passives = value.passives.slice(0, 8).map((p) => {
      if (typeof p === "string") return clampString(p) ?? "";
      if (!isPlainObject(p)) return null;
      const name = clampString(p.name);
      if (!name) return null;
      const passive: Record<string, unknown> = { name };
      if (p.rank === "rainbow" || (typeof p.rank === "number" && Math.abs(p.rank) <= 3)) {
        passive.rank = p.rank;
      }
      const description = clampString(p.description, MAX_NOTE_LEN);
      if (description) passive.description = description;
      return passive;
    }).filter(Boolean);
  }
  const specimenId = clampString(value.specimenId, 80);
  if (specimenId) out.specimenId = specimenId;
  for (const key of ["owner", "where", "guild", "element"] as const) {
    const v = clampString(value[key]);
    if (v) out[key] = v;
  }
  if (typeof value.alpha === "boolean") out.alpha = value.alpha;
  if (typeof value.stars === "number" && Number.isFinite(value.stars)) {
    out.stars = Math.max(0, Math.min(5, value.stars));
  }
  if (typeof value.rank === "number" && Number.isFinite(value.rank)) {
    out.rank = Math.max(0, Math.min(5, value.rank));
  }
  if (isPlainObject(value.ivs)) {
    out.ivs = sanitizeNumberMap(value.ivs, ["hp", "attack", "defense"], 0, 100);
  }
  if (isPlainObject(value.stats)) {
    out.stats = sanitizeNumberMap(
      value.stats,
      ["hp", "attack", "defense", "workSpeed"],
      0,
      1_000_000,
    );
  }
  return out;
}

function sanitizeNumberMap(
  value: Record<string, unknown>,
  keys: string[],
  min: number,
  max: number,
): Record<string, number> | undefined {
  const out: Record<string, number> = {};
  for (const key of keys) {
    const n = value[key];
    if (typeof n === "number" && Number.isFinite(n)) {
      out[key] = Math.max(min, Math.min(max, n));
    }
  }
  return Object.keys(out).length ? out : undefined;
}

export function sanitizeTree(value: unknown): {
  tree?: Record<string, unknown>;
  error?: string;
} {
  if (value == null) return {};
  if (!isPlainObject(value)) return { error: "tree must be an object" };
  if (!Array.isArray(value.steps)) return { error: "tree.steps is required" };
  if (value.steps.length === 0) return { error: "tree.steps must not be empty" };
  if (value.steps.length > MAX_TREE_STEPS) {
    return { error: `tree.steps exceeds max of ${MAX_TREE_STEPS}` };
  }

  const steps: unknown[] = [];
  for (const step of value.steps) {
    if (!isPlainObject(step)) {
      return { error: "each tree step must be an object" };
    }
    const from = sanitizeTreePal(step.from);
    const partner = sanitizeTreePal(step.partner);
    const child = sanitizeTreePal(step.child);
    if (!from || !partner || !child) {
      return { error: "tree step from/partner/child are required" };
    }
    const next: Record<string, unknown> = { from, partner, child };
    if (
      step.role === "chain" ||
      step.role === "branch-a" ||
      step.role === "branch-b" ||
      step.role === "merge" ||
      step.role === "finish"
    ) {
      next.role = step.role;
    }
    if (typeof step.pool === "string") {
      const pool = clampString(step.pool, 40);
      if (pool) next.pool = pool;
    } else if (typeof step.pool === "number" && Number.isFinite(step.pool)) {
      next.pool = Math.max(0, Math.min(100, step.pool));
    }
    const note = clampString(step.note, MAX_NOTE_LEN);
    if (note) next.note = note;
    steps.push(next);
  }

  const tree: Record<string, unknown> = { steps };
  if (value.kind === "chain" || value.kind === "merge") tree.kind = value.kind;
  const summary = clampString(value.summary, MAX_NOTE_LEN);
  if (summary) tree.summary = summary;
  if (isPlainObject(value.merge)) {
    const left = sanitizeTreePal(value.merge.left);
    const right = sanitizeTreePal(value.merge.right);
    const child = sanitizeTreePal(value.merge.child);
    if (left && right && child) tree.merge = { left, right, child };
  }
  return { tree };
}

export function sanitizeSpecimens(value: unknown): {
  specimens: unknown[];
  error?: string;
} {
  if (value == null) return { specimens: [] };
  if (!Array.isArray(value)) return { specimens: [], error: "specimens must be an array" };
  if (value.length > MAX_SPECIMENS) {
    return {
      specimens: [],
      error: `specimens exceeds max of ${MAX_SPECIMENS}`,
    };
  }
  const specimens: unknown[] = [];
  for (const item of value) {
    if (!isPlainObject(item)) continue;
    const species = clampString(item.species);
    if (!species) continue;
    const pal = sanitizeTreePal({ ...item, species });
    if (pal && typeof pal === "object") {
      const role = clampString(item.role, 40);
      if (role) (pal as Record<string, unknown>).role = role;
      specimens.push(pal);
    }
  }
  return { specimens };
}

/** Shared gate for expensive POST handlers. */
export async function guardPost(
  req: VercelRequest,
  res: VercelResponse,
  tier: LimitTier = "post",
): Promise<boolean> {
  if (!enforceBodySize(req, res)) return false;
  if (!requireApiKey(req, res)) return false;
  if (!(await enforceRateLimit(req, res, tier))) return false;
  return true;
}

/** Shared gate for public GET handlers. */
export async function guardGet(
  req: VercelRequest,
  res: VercelResponse,
): Promise<boolean> {
  return enforceRateLimit(req, res, "get");
}
