import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Pal } from "../../../src/lib/types";
import { findChainCandidates } from "../../../src/lib/path";
import {
  pathResultFromSnapshot,
  snapshotPathResult,
} from "../../../src/lib/savedPaths";
import {
  buildViewUrl,
  resolvePalName,
  shareTreeFromPath,
  type SharePayloadV1,
  type ShareTreeV1,
} from "../../../src/lib/share";
import { normalizeSpecimens } from "../../../src/lib/specimens";
import {
  getDataset,
  handleOptions,
  readBody,
  sendJson,
  siteOrigin,
} from "../../_lib/dataset";
import {
  clampPathLimit,
  clampString,
  clampStringArray,
  guardPost,
  MAX_WAYPOINTS,
  sanitizeSpecimens,
  sanitizeTree,
} from "../../_lib/security";

type ChainBody = {
  start?: string;
  target?: string;
  waypoints?: string[];
  includeTargetAsParent?: boolean;
  hideTerraria?: boolean;
  hideWorldTreeLocked?: boolean;
  hideWorldTreeBreedable?: boolean;
  limit?: number;
  specimens?: unknown;
  tree?: ShareTreeV1;
  name?: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "POST only" }, req);
  }
  if (!(await guardPost(req, res, "post"))) return;

  const body = readBody<ChainBody>(req);
  const startName = clampString(body.start);
  const targetName = clampString(body.target);
  if (!startName || !targetName) {
    return sendJson(
      res,
      400,
      { error: "start and target are required (species names)" },
      req,
    );
  }

  const treeResult = sanitizeTree(body.tree);
  if (treeResult.error) {
    return sendJson(res, 400, { error: treeResult.error }, req);
  }
  const specimenResult = sanitizeSpecimens(body.specimens);
  if (specimenResult.error) {
    return sendJson(res, 400, { error: specimenResult.error }, req);
  }

  const dataset = await getDataset();
  const start = resolvePalName(dataset, startName);
  const target = resolvePalName(dataset, targetName);
  const unresolved: string[] = [];
  if (!start) unresolved.push(`start: ${startName}`);
  if (!target) unresolved.push(`target: ${targetName}`);

  const waypointNames = clampStringArray(body.waypoints, MAX_WAYPOINTS);
  const waypointPals: Pal[] = [];
  for (const name of waypointNames) {
    const pal = resolvePalName(dataset, name);
    if (pal) waypointPals.push(pal);
    else unresolved.push(`waypoint: ${name}`);
  }

  if (!start || !target) {
    return sendJson(res, 404, { error: "Unknown species", unresolved }, req);
  }

  const options = {
    hideTerraria: body.hideTerraria ?? true,
    hideWorldTreeLocked: body.hideWorldTreeLocked ?? true,
    hideWorldTreeBreedable: body.hideWorldTreeBreedable ?? false,
    includeTargetAsParent: Boolean(body.includeTargetAsParent),
  };

  const limit = clampPathLimit(body.limit);
  const routes = findChainCandidates(
    dataset,
    start.index,
    waypointPals.map((p) => p.index),
    target.index,
    options,
  )
    .slice(0, limit)
    .map((path) => snapshotPathResult(path));

  const specimens = normalizeSpecimens(specimenResult.specimens);
  const tree = treeResult.tree
    ? (treeResult.tree as ShareTreeV1)
    : routes[0]
      ? shareTreeFromPath(pathResultFromSnapshot(routes[0]), specimens)
      : undefined;

  const share: SharePayloadV1 = {
    v: 1,
    mode: "chain",
    s: start.name,
    t: target.name,
    w: waypointPals.map((p) => p.name),
    itp: options.includeTargetAsParent || undefined,
    specimens: specimens.length ? specimens : undefined,
    tree,
    name: clampString(body.name),
  };

  return sendJson(
    res,
    200,
    {
      meta: {
        note: "Passives/IVs are not simulated — specimen fields are display-only. Prefer posting `tree` when you already have the step table.",
        release: dataset.meta.release,
        routeCount: routes.length,
        unresolved: unresolved.length ? unresolved : undefined,
      },
      query: {
        start: { index: start.index, name: start.name, dex: start.dex },
        target: { index: target.index, name: target.name, dex: target.dex },
        waypoints: waypointPals.map((p) => ({
          index: p.index,
          name: p.name,
          dex: p.dex,
        })),
      },
      routes,
      specimens,
      tree,
      viewUrl: buildViewUrl(share, siteOrigin(req)),
      share,
    },
    req,
  );
}
