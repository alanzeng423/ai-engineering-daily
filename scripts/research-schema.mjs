import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { validateDigest } from "./digest-schema.mjs";
import { validateBaseline } from "./catalog-schema.mjs";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_STATUSES = new Set(["running", "failed", "completed"]);
const RUN_STAGES = new Set([
  "preflight",
  "discovery",
  "verification",
  "scoring",
  "selection",
  "editing",
  "validation",
  "publishing",
  "deployment",
  "completed",
]);
const RETRIEVAL_KINDS = new Set(["search", "feed", "api", "source", "repository", "social"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isIsoDateTime(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function uniqueIds(items, key, label, errors) {
  const ids = new Set();
  for (const [index, item] of items.entries()) {
    const id = item?.[key];
    if (!hasText(id)) {
      errors.push(`${label}[${index}].${key} 不能为空`);
    } else if (ids.has(id)) {
      errors.push(`${label} 中存在重复 ${key}: ${id}`);
    } else {
      ids.add(id);
    }
  }
  return ids;
}

export function validateResearchArtifacts(artifacts, options = {}) {
  const { complete = false } = options;
  const errors = [];
  const {
    manifest,
    queries,
    retrievals,
    candidates,
    verification,
    scores,
    selection,
    digest,
    checks,
  } = artifacts;

  if (!isObject(manifest)) return ["manifest.json 必须是 JSON 对象"];
  if (manifest.schemaVersion !== 1) errors.push("manifest.schemaVersion 必须为 1");
  if (!hasText(manifest.runId)) errors.push("manifest.runId 不能为空");
  if (!DATE_PATTERN.test(manifest.targetDate ?? "")) {
    errors.push("manifest.targetDate 必须是 YYYY-MM-DD");
  }
  if (!isIsoDateTime(manifest.startedAt)) errors.push("manifest.startedAt 必须是 ISO 时间");
  if (!ISO_STATUSES.has(manifest.status)) errors.push("manifest.status 不受支持");
  if (!RUN_STAGES.has(manifest.stage)) errors.push("manifest.stage 不受支持");
  if (complete) {
    if (manifest.status !== "completed") errors.push("完整运行的 manifest.status 必须为 completed");
    if (manifest.stage !== "completed") errors.push("完整运行的 manifest.stage 必须为 completed");
    if (!isIsoDateTime(manifest.finishedAt)) errors.push("完整运行必须记录 manifest.finishedAt");
  }

  const targetDate = manifest.targetDate;
  const ledgers = [
    ["queries.json", queries],
    ["candidates.json", candidates],
    ["verification.json", verification],
    ["scores.json", scores],
    ["selection.json", selection],
    ["checks.json", checks],
  ];
  for (const [name, ledger] of ledgers) {
    if (!isObject(ledger)) {
      errors.push(`${name} 必须是 JSON 对象`);
      continue;
    }
    if (ledger.schemaVersion !== 1) errors.push(`${name} 的 schemaVersion 必须为 1`);
    if (ledger.targetDate !== targetDate) errors.push(`${name} 的 targetDate 与 manifest 不一致`);
  }

  const queryItems = Array.isArray(queries?.queries) ? queries.queries : [];
  if (!Array.isArray(queries?.queries)) errors.push("queries.queries 必须是数组");
  const queryIds = uniqueIds(queryItems, "id", "queries", errors);
  for (const [index, query] of queryItems.entries()) {
    if (!isIsoDateTime(query.executedAt)) errors.push(`queries[${index}].executedAt 必须是 ISO 时间`);
    if (!hasText(query.query)) errors.push(`queries[${index}].query 不能为空`);
    if (!Array.isArray(query.retrievalIds)) errors.push(`queries[${index}].retrievalIds 必须是数组`);
  }

  const retrievalItems = Array.isArray(retrievals) ? retrievals : [];
  const retrievalIds = uniqueIds(retrievalItems, "batchId", "retrievals", errors);
  for (const [index, retrieval] of retrievalItems.entries()) {
    if (retrieval.schemaVersion !== 1) errors.push(`retrievals[${index}].schemaVersion 必须为 1`);
    if (retrieval.targetDate !== targetDate) errors.push(`retrievals[${index}].targetDate 不一致`);
    if (!RETRIEVAL_KINDS.has(retrieval.kind)) errors.push(`retrievals[${index}].kind 不受支持`);
    if (!isIsoDateTime(retrieval.requestedAt)) errors.push(`retrievals[${index}].requestedAt 必须是 ISO 时间`);
    if (!isIsoDateTime(retrieval.completedAt)) errors.push(`retrievals[${index}].completedAt 必须是 ISO 时间`);
    if (!isObject(retrieval.request)) errors.push(`retrievals[${index}].request 必须是对象`);
    if (!isObject(retrieval.response)) errors.push(`retrievals[${index}].response 必须是对象`);
    if (!Array.isArray(retrieval.results)) errors.push(`retrievals[${index}].results 必须是数组`);
  }
  for (const [index, query] of queryItems.entries()) {
    for (const id of query.retrievalIds ?? []) {
      if (!retrievalIds.has(id)) errors.push(`queries[${index}] 引用了不存在的 retrievalId: ${id}`);
    }
  }

  const candidateItems = Array.isArray(candidates?.candidates) ? candidates.candidates : [];
  if (!Array.isArray(candidates?.candidates)) errors.push("candidates.candidates 必须是数组");
  const candidateIds = uniqueIds(candidateItems, "id", "candidates", errors);
  for (const [index, candidate] of candidateItems.entries()) {
    if (!hasText(candidate.title)) errors.push(`candidates[${index}].title 不能为空`);
    if (!isHttpsUrl(candidate.url)) errors.push(`candidates[${index}].url 必须是 HTTPS 链接`);
    if (!Array.isArray(candidate.retrievalIds) || candidate.retrievalIds.length === 0) {
      errors.push(`candidates[${index}].retrievalIds 至少包含一项`);
    } else {
      for (const id of candidate.retrievalIds) {
        if (!retrievalIds.has(id)) errors.push(`candidates[${index}] 引用了不存在的 retrievalId: ${id}`);
      }
    }
    for (const id of candidate.queryIds ?? []) {
      if (!queryIds.has(id)) errors.push(`candidates[${index}] 引用了不存在的 queryId: ${id}`);
    }
  }

  const verificationItems = Array.isArray(verification?.verifications)
    ? verification.verifications
    : [];
  if (!Array.isArray(verification?.verifications)) errors.push("verification.verifications 必须是数组");
  const verifiedIds = uniqueIds(verificationItems, "candidateId", "verification", errors);
  for (const [index, item] of verificationItems.entries()) {
    if (!candidateIds.has(item.candidateId)) {
      errors.push(`verification[${index}] 引用了不存在的 candidateId: ${item.candidateId}`);
    }
    if (!isIsoDateTime(item.checkedAt)) errors.push(`verification[${index}].checkedAt 必须是 ISO 时间`);
    if (typeof item.accessible !== "boolean") errors.push(`verification[${index}].accessible 必须是布尔值`);
    if (typeof item.dateEligible !== "boolean") errors.push(`verification[${index}].dateEligible 必须是布尔值`);
    if (!Array.isArray(item.evidence)) errors.push(`verification[${index}].evidence 必须是数组`);
    if (!Array.isArray(item.rejectionReasons)) {
      errors.push(`verification[${index}].rejectionReasons 必须是数组`);
    }
  }

  const scoreItems = Array.isArray(scores?.scores) ? scores.scores : [];
  if (!Array.isArray(scores?.scores)) errors.push("scores.scores 必须是数组");
  const scoredIds = uniqueIds(scoreItems, "candidateId", "scores", errors);
  const scoreById = new Map();
  for (const [index, item] of scoreItems.entries()) {
    scoreById.set(item.candidateId, item);
    if (!candidateIds.has(item.candidateId)) {
      errors.push(`scores[${index}] 引用了不存在的 candidateId: ${item.candidateId}`);
    }
    if (!isIsoDateTime(item.scoredAt)) errors.push(`scores[${index}].scoredAt 必须是 ISO 时间`);
    if (item.total !== null && (!Number.isFinite(item.total) || item.total < 0 || item.total > 100)) {
      errors.push(`scores[${index}].total 必须为 0–100 或 null`);
    }
    if (typeof item.passed !== "boolean") errors.push(`scores[${index}].passed 必须是布尔值`);
    if (!isObject(item.breakdown) && item.total !== null) {
      errors.push(`scores[${index}].breakdown 在已评分时必须是对象`);
    }
    if (item.total === null && !hasText(item.notScoredReason)) {
      errors.push(`scores[${index}] 未评分时必须记录 notScoredReason`);
    }
  }

  const selectedIds = Array.isArray(selection?.selectedIds) ? selection.selectedIds : [];
  const rejectedItems = Array.isArray(selection?.rejected) ? selection.rejected : [];
  if (!Array.isArray(selection?.selectedIds)) errors.push("selection.selectedIds 必须是数组");
  if (!Array.isArray(selection?.rejected)) errors.push("selection.rejected 必须是数组");
  const selectedSet = new Set(selectedIds);
  if (selectedSet.size !== selectedIds.length) errors.push("selection.selectedIds 不得重复");
  const rejectedIds = uniqueIds(rejectedItems, "candidateId", "selection.rejected", errors);
  for (const id of selectedIds) {
    if (!candidateIds.has(id)) errors.push(`selection 引用了不存在的入选 candidateId: ${id}`);
    const score = scoreById.get(id);
    if (!score || score.total < 70 || !score.passed) {
      errors.push(`入选候选 ${id} 必须完成评分且达到 70 分`);
    }
  }
  for (const [index, rejected] of rejectedItems.entries()) {
    if (!candidateIds.has(rejected.candidateId)) {
      errors.push(`selection.rejected[${index}] 引用了不存在的 candidateId`);
    }
    if (!Array.isArray(rejected.reasons) || rejected.reasons.length === 0) {
      errors.push(`selection.rejected[${index}].reasons 至少包含一项`);
    }
  }

  if (complete) {
    if (retrievalItems.length === 0) errors.push("完整运行至少要有一条 retrieval 记录");
    if (candidateItems.length === 0) errors.push("完整运行至少要有一条候选记录");
    for (const id of candidateIds) {
      if (!verifiedIds.has(id)) errors.push(`候选 ${id} 缺少 verification 记录`);
      if (!scoredIds.has(id)) errors.push(`候选 ${id} 缺少 score 或未评分原因`);
      if (!selectedSet.has(id) && !rejectedIds.has(id)) {
        errors.push(`候选 ${id} 未记录最终入选或淘汰决定`);
      }
      if (selectedSet.has(id) && rejectedIds.has(id)) {
        errors.push(`候选 ${id} 同时出现在入选和淘汰列表`);
      }
    }
  }

  if (!isObject(digest)) {
    if (complete) errors.push("digest.json 必须保存最终发布对象");
  } else {
    const isHistoricalBackfill = manifest.runType === "historical-backfill";
    const digestErrors = isHistoricalBackfill ? validateBaseline(digest) : validateDigest(digest);
    errors.push(...digestErrors.map((error) => `digest.json: ${error}`));
    if (!isHistoricalBackfill && digest.date !== targetDate) {
      errors.push("digest.json 的 date 与 targetDate 不一致");
    }
    if (digest.items?.length !== selectedIds.length) {
      errors.push("digest.json 条目数必须与 selection.selectedIds 一致");
    }
    const selectedUrls = selectedIds
      .map((id) => candidateItems.find((candidate) => candidate.id === id)?.url)
      .filter(Boolean)
      .map((url) => url.replace(/\/$/, ""));
    const digestUrls = (digest.items ?? []).map((item) => item.url.replace(/\/$/, ""));
    for (const url of selectedUrls) {
      if (!digestUrls.includes(url)) errors.push(`digest.json 缺少入选 URL: ${url}`);
    }
  }

  if (!Array.isArray(checks?.commands)) errors.push("checks.commands 必须是数组");
  if (complete) {
    const successfulCommands = (checks.commands ?? []).filter((item) => item.exitCode === 0);
    const requiredCommands =
      manifest.runType === "historical-backfill"
        ? ["catalog:build", "npm test"]
        : ["digest:validate", "digest:publish", "npm test"];
    for (const required of requiredCommands) {
      if (!successfulCommands.some((item) => item.command?.includes(required))) {
        errors.push(`checks.commands 缺少成功记录: ${required}`);
      }
    }
    if (!checks.git?.pushed || !hasText(checks.git?.commitSha)) {
      errors.push("完整运行必须记录成功 Git 推送及 commitSha");
    }
    if (
      checks.deployment?.status !== "success" ||
      checks.deployment?.httpStatus !== 200 ||
      checks.deployment?.verified !== true
    ) {
      errors.push("完整运行必须记录成功部署及正式域名 HTTP 200 验证");
    }
  }

  return errors;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function readResearchRun(runDirectory, options = {}) {
  const root = resolve(runDirectory);
  const retrievalDirectory = resolve(root, "retrievals");
  const retrievalFiles = (await readdir(retrievalDirectory))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const retrievals = [];
  for (const name of retrievalFiles) {
    retrievals.push(await readJson(resolve(retrievalDirectory, name)));
  }

  const artifacts = {
    manifest: await readJson(resolve(root, "manifest.json")),
    queries: await readJson(resolve(root, "queries.json")),
    retrievals,
    candidates: await readJson(resolve(root, "candidates.json")),
    verification: await readJson(resolve(root, "verification.json")),
    scores: await readJson(resolve(root, "scores.json")),
    selection: await readJson(resolve(root, "selection.json")),
    digest: await readJson(resolve(root, "digest.json")),
    checks: await readJson(resolve(root, "checks.json")),
  };

  return {
    artifacts,
    retrievalFiles,
    errors: validateResearchArtifacts(artifacts, options),
  };
}
