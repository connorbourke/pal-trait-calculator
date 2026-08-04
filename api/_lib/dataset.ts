import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  assembleDataset,
  type DatasetParts,
} from "../../src/lib/breeding";
import type { BreedingDataset } from "../../src/lib/types";

let cached: BreedingDataset | null = null;

async function readJson<T>(file: string): Promise<T> {
  const path = join(process.cwd(), "public", "data", file);
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as T;
}

export async function getDataset(): Promise<BreedingDataset> {
  if (cached) return cached;
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
}

export function setCors(res: VercelResponse, req?: VercelRequest): void {
  const allowed = process.env.PAL_CORS_ORIGINS?.trim();
  if (!allowed || allowed === "*") {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else {
    const origin = typeof req?.headers.origin === "string" ? req.headers.origin : "";
    const list = allowed.split(",").map((s) => s.trim()).filter(Boolean);
    if (origin && list.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    } else if (list[0]) {
      // Non-browser clients don't send Origin; still advertise primary.
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
