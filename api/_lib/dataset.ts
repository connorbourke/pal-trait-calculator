import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  assembleDataset,
  type DatasetParts,
} from "../../src/lib/breeding";
import type { BreedingDataset } from "../../src/lib/types";

let cached: BreedingDataset | null = null;
let inflight: Promise<BreedingDataset> | null = null;

function staticBaseUrl(): string | null {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return null;
}

async function readJsonFile<T>(file: string): Promise<T | null> {
  const candidates = [
    join(process.cwd(), "public", "data", file),
    join(process.cwd(), "data", file),
  ];
  for (const path of candidates) {
    try {
      await access(path);
      const raw = await readFile(path, "utf8");
      return JSON.parse(raw) as T;
    } catch {
      // try next candidate
    }
  }
  return null;
}

async function readJsonHttp<T>(file: string, base: string): Promise<T> {
  const url = `${base.replace(/\/$/, "")}/data/${file}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url} (${res.status})`);
  }
  return (await res.json()) as T;
}

async function readJson<T>(file: string): Promise<T> {
  const fromDisk = await readJsonFile<T>(file);
  if (fromDisk != null) return fromDisk;

  const base = staticBaseUrl();
  if (base) return readJsonHttp<T>(file, base);

  throw new Error(
    `Dataset file not found: ${file} (no local public/data and no VERCEL_URL)`,
  );
}

export async function getDataset(): Promise<BreedingDataset> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    const parts: DatasetParts = {
      meta: await readJson("meta.json"),
      pals: await readJson("pals.json"),
      combos: await readJson("combos.json"),
      byChild: await readJson("by-child.json"),
      byParent: await readJson("by-parent.json"),
      specialGenders: await readJson("special-genders.json"),
      mutationPassives: await readJson("mutation-passives.json"),
      minStepEdges: await readJson("min-steps.json"),
    };
    cached = assembleDataset(parts);
    return cached;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export function setCors(res: VercelResponse, req?: VercelRequest): void {
  const allowed = process.env.PAL_CORS_ORIGINS?.trim();
  if (!allowed || allowed === "*") {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else {
    const origin =
      typeof req?.headers.origin === "string" ? req.headers.origin : "";
    const list = allowed.split(",").map((s) => s.trim()).filter(Boolean);
    if (origin && list.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    } else if (list[0]) {
      res.setHeader("Access-Control-Allow-Origin", list[0]);
      res.setHeader("Vary", "Origin");
    }
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-api-key",
  );
  res.setHeader("Access-Control-Max-Age", "86400");
}

export function sendJson(
  res: VercelResponse,
  status: number,
  data: unknown,
  req?: VercelRequest,
): void {
  setCors(res, req);
  res.status(status).json(data);
}

export function handleOptions(req: VercelRequest, res: VercelResponse): boolean {
  if (req.method === "OPTIONS") {
    setCors(res, req);
    res.status(204).end();
    return true;
  }
  return false;
}

export function siteOrigin(req: VercelRequest): string {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  const proto = (req.headers["x-forwarded-proto"] as string) ?? "http";
  if (host) return `${proto}://${host}`;
  return "http://localhost:3000";
}

export function readBody<T>(req: VercelRequest): T {
  return (req.body ?? {}) as T;
}

/** Wrap handlers so uncaught errors return JSON instead of FUNCTION_INVOCATION_FAILED. */
export function withApiHandler(
  handler: (req: VercelRequest, res: VercelResponse) => Promise<void> | void,
) {
  return async (req: VercelRequest, res: VercelResponse) => {
    try {
      await handler(req, res);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[api]", message, err);
      if (!res.headersSent) {
        sendJson(res, 500, { error: "Internal server error", message }, req);
      }
    }
  };
}
