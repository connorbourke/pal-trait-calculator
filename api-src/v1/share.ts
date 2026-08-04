import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  buildViewUrl,
  compactSharePayload,
  type SharePayloadV1,
} from "../../src/lib/share";
import { normalizeSpecimens } from "../../src/lib/specimens";
import {
  handleOptions,
  readBody,
  sendJson,
  siteOrigin,
  withApiHandler,
} from "../_lib/dataset";
import {
  clampString,
  guardPost,
  MAX_STRING_LEN,
  sanitizeSpecimens,
  sanitizeTree,
} from "../_lib/security";

export default withApiHandler(async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "POST only" }, req);
  }
  if (!(await guardPost(req, res, "share"))) return;

  const body = readBody<SharePayloadV1>(req);
  if (body?.v !== 1 || (body.mode !== "merge" && body.mode !== "chain")) {
    return sendJson(
      res,
      400,
      { error: "Expected SharePayloadV1 { v:1, mode, t, ... }" },
      req,
    );
  }

  const t = clampString(body.t, MAX_STRING_LEN);
  if (!t) {
    return sendJson(res, 400, { error: "t (target species name) is required" }, req);
  }

  const treeResult = sanitizeTree(body.tree);
  if (treeResult.error) {
    return sendJson(res, 400, { error: treeResult.error }, req);
  }
  const specimenResult = sanitizeSpecimens(body.specimens);
  if (specimenResult.error) {
    return sendJson(res, 400, { error: specimenResult.error }, req);
  }

  const share = compactSharePayload({
    v: 1,
    mode: body.mode,
    t,
    a: clampString(body.a),
    b: clampString(body.b),
    s: clampString(body.s),
    w: Array.isArray(body.w)
      ? body.w
          .map((x) => clampString(x))
          .filter((x): x is string => Boolean(x))
          .slice(0, 8)
      : undefined,
    itp: Boolean(body.itp),
    name: clampString(body.name, MAX_STRING_LEN),
    tree: treeResult.tree as SharePayloadV1["tree"],
    specimens: normalizeSpecimens(specimenResult.specimens),
  });

  return sendJson(
    res,
    200,
    {
      share,
      viewUrl: buildViewUrl(share, siteOrigin(req)),
    },
    req,
  );
});
