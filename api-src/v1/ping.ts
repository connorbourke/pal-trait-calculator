import type { VercelRequest, VercelResponse } from "@vercel/node";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const publicDir = join(process.cwd(), "public", "data");
  const dataDir = join(process.cwd(), "data");
  const publicData = existsSync(publicDir);
  const data = existsSync(dataDir);

  res.status(200).json({
    ok: true,
    ping: true,
    node: process.version,
    cwd: process.cwd(),
    hasDataDir: {
      publicData,
      data,
      files: publicData
        ? readdirSync(publicDir).slice(0, 20)
        : data
          ? readdirSync(dataDir).slice(0, 20)
          : [],
    },
    env: {
      hasApiKey: Boolean(process.env.PAL_API_KEY),
      hasUpstashUrl: Boolean(process.env.UPSTASH_REDIS_REST_URL),
      hasUpstashToken: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN),
      vercel: Boolean(process.env.VERCEL),
      vercelUrl: process.env.VERCEL_URL || null,
    },
  });
}
