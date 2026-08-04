import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  getDataset,
  handleOptions,
  sendJson,
  withApiHandler,
} from "../_lib/dataset";

export default withApiHandler(async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (handleOptions(req, res)) return;
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "GET only" }, req);
  }

  const dataset = await getDataset();
  return sendJson(
    res,
    200,
    {
      ok: true,
      service: "pal-trait-calculator-api",
      release: dataset.meta.release,
      auth: {
        postRequiresApiKey: true,
        headers: [
          "Authorization: Bearer <PAL_API_KEY>",
          "x-api-key: <PAL_API_KEY>",
        ],
      },
      limits: {
        postPerMinute: 30,
        sharePerMinute: 40,
        getPerMinute: 90,
        maxBodyBytes: 131072,
        maxTreeSteps: 20,
        maxSpecimens: 30,
        maxPathLimit: 10,
      },
      endpoints: [
        "GET /api/v1/health",
        "GET /api/v1/pals?q=",
        "POST /api/v1/path/merge",
        "POST /api/v1/path/chain",
        "POST /api/v1/share",
        "GET /schema/share-v1.json",
      ],
    },
    req,
  );
});
