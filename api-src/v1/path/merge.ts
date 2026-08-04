import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  buildMergeTree,
  findMergeCandidates,
} from "../../../src/lib/path";
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
  withApiHandler,
} from "../../_lib/dataset";
import {
  clampPathLimit,
  clampString,
  guardPost,
  sanitizeSpecimens,
  sanitizeTree,
} from "../../_lib/security";

type MergeBody = {
  traitA?: string;
  traitB?: string;
  target?: string;
  includeTargetAsParent?: boolean;
  hideTerraria?: boolean;
  hideWorldTreeLocked?: boolean;
  hideWorldTreeBreedable?: boolean;
  limit?: number;
  specimens?: unknown;
  tree?: ShareTreeV1;
  name?: string;
};

export default withApiHandler(async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "POST only" }, req);
  }
  if (!(await guardPost(req, res, "post"))) return;

  const body = readBody<MergeBody>(req);
  const traitAName = clampString(body.traitA);
  const traitBName = clampString(body.traitB);
  const targetName = clampString(body.target);
  if (!traitAName || !traitBName || !targetName) {
    return sendJson(
      res,
      400,
      { error: "traitA, traitB, and target are required (species names)" },
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
  const traitA = resolvePalName(dataset, traitAName);
  const traitB = resolvePalName(dataset, traitBName);
  const target = resolvePalName(dataset, targetName);
  const unresolved = [
    !traitA ? `traitA: ${traitAName}` : null,
    !traitB ? `traitB: ${traitBName}` : null,
    !target ? `target: ${targetName}` : null,
  ].filter(Boolean);

  if (!traitA || !traitB || !target) {
    return sendJson(res, 404, { error: "Unknown species", unresolved }, req);
  }

  const options = {
    hideTerraria: body.hideTerraria ?? true,
    hideWorldTreeLocked: body.hideWorldTreeLocked ?? true,
    hideWorldTreeBreedable: body.hideWorldTreeBreedable ?? false,
    includeTargetAsParent: Boolean(body.includeTargetAsParent),
  };

  const limit = clampPathLimit(body.limit);
  const candidates = findMergeCandidates(
    dataset,
    traitA.index,
    traitB.index,
    target.index,
    options,
  ).slice(0, limit);

  const trees = candidates.map((candidate) => {
    const path = buildMergeTree(
      dataset,
      traitA.index,
      traitB.index,
      target.index,
      candidate,
      options,
    );
    return snapshotPathResult(path);
  });

  const specimens = normalizeSpecimens(specimenResult.specimens);
  const tree = treeResult.tree
    ? (treeResult.tree as ShareTreeV1)
    : trees[0]
      ? shareTreeFromPath(pathResultFromSnapshot(trees[0]), specimens)
      : undefined;

  const share: SharePayloadV1 = {
    v: 1,
    mode: "merge",
    a: traitA.name,
    b: traitB.name,
    t: target.name,
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
        candidateCount: candidates.length,
      },
      query: {
        traitA: { index: traitA.index, name: traitA.name, dex: traitA.dex },
        traitB: { index: traitB.index, name: traitB.name, dex: traitB.dex },
        target: { index: target.index, name: target.name, dex: target.dex },
      },
      trees,
      specimens,
      tree,
      viewUrl: buildViewUrl(share, siteOrigin(req)),
      share,
    },
    req,
  );
});
