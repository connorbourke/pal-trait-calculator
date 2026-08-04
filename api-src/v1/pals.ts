import type { VercelRequest, VercelResponse } from "@vercel/node";
import { searchPals } from "../../src/lib/breeding";
import {
  getDataset,
  handleOptions,
  sendJson,
  withApiHandler,
} from "../_lib/dataset";
import { clampString, guardGet } from "../_lib/security";

export default withApiHandler(async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (handleOptions(req, res)) return;
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "GET only" }, req);
  }
  if (!(await guardGet(req, res))) return;

  const q = clampString(req.query.q, 80) ?? "";
  const limitRaw =
    typeof req.query.limit === "string" ? Number(req.query.limit) : 20;
  const limit = Math.max(1, Math.min(limitRaw || 20, 50));

  const dataset = await getDataset();
  const pals = searchPals(dataset.pals, q)
    .slice(0, limit)
    .map((p) => ({
      index: p.index,
      name: p.name,
      dex: p.dex,
      internalName: p.internalName,
      rarity: p.rarity,
      breedingPower: p.breedingPower,
      isTerraria: p.isTerraria,
      isWorldTreeLocked: p.isWorldTreeLocked,
      isWorldTreeBreedable: p.isWorldTreeBreedable,
    }));

  return sendJson(
    res,
    200,
    {
      meta: { release: dataset.meta.release, count: pals.length },
      pals,
    },
    req,
  );
});
