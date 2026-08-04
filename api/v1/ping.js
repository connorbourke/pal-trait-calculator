module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  res.status(200).json({
    ok: true,
    ping: true,
    node: process.version,
    cwd: process.cwd(),
    hasDataDir: (() => {
      try {
        const fs = require("fs");
        const path = require("path");
        return {
          publicData: fs.existsSync(path.join(process.cwd(), "public", "data")),
          data: fs.existsSync(path.join(process.cwd(), "data")),
          files: fs.existsSync(path.join(process.cwd(), "public", "data"))
            ? fs.readdirSync(path.join(process.cwd(), "public", "data")).slice(0, 20)
            : fs.existsSync(path.join(process.cwd(), "data"))
              ? fs.readdirSync(path.join(process.cwd(), "data")).slice(0, 20)
              : [],
        };
      } catch (e) {
        return { error: String(e && e.message ? e.message : e) };
      }
    })(),
    env: {
      hasApiKey: Boolean(process.env.PAL_API_KEY),
      hasUpstashUrl: Boolean(process.env.UPSTASH_REDIS_REST_URL),
      hasUpstashToken: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN),
      vercel: Boolean(process.env.VERCEL),
      vercelUrl: process.env.VERCEL_URL || null,
    },
  });
};
