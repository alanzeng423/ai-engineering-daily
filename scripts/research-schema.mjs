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
const COVERAGE_STATUSES = new Set(["success", "degraded", "failed"]);
const DATE_STATUSES = new Set(["eligible", "ineligible", "unresolved"]);
const REQUIRED_COVERAGE_CHANNELS = [
  "x",
  "official",
  "chinese-media",
  "open-web",
  "papers",
  "recall-sentinel",
];

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
    coverage,
    retrievals,
    candidates,
    verification,
    scores,
    selection,
    digest,
    checks,
    deploymentVerification,
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
    ["coverage.json", coverage],
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

  const coverageItems = Array.isArray(coverage?.entries) ? coverage.entries : [];
  if (!Array.isArray(coverage?.entries)) errors.push("coverage.entries 必须是数组");
  uniqueIds(coverageItems, "id", "coverage.entries", errors);
  for (const [index, entry] of coverageItems.entries()) {
    if (!hasText(entry.channel)) errors.push(`coverage.entries[${index}].channel 不能为空`);
    if (!COVERAGE_STATUSES.has(entry.status)) {
      errors.push(`coverage.entries[${index}].status 不受支持`);
    }
    if (!isIsoDateTime(entry.startedAt)) {
      errors.push(`coverage.entries[${index}].startedAt 必须是 ISO 时间`);
    }
    if (!isIsoDateTime(entry.completedAt)) {
      errors.push(`coverage.entries[${index}].completedAt 必须是 ISO 时间`);
    }
    for (const key of ["planned", "attempted", "succeeded", "failed", "rawResults", "eligibleCandidates"]) {
      if (!Number.isInteger(entry[key]) || entry[key] < 0) {
        errors.push(`coverage.entries[${index}].${key} 必须是非负整数`);
      }
    }
    if (
      Number.isInteger(entry.attempted) &&
      Number.isInteger(entry.succeeded) &&
      Number.isInteger(entry.failed) &&
      entry.succeeded + entry.failed !== entry.attempted
    ) {
      errors.push(`coverage.entries[${index}] 的 succeeded + failed 必须等于 attempted`);
    }
    if (!Array.isArray(entry.retrievalIds) || entry.retrievalIds.length === 0) {
      errors.push(`coverage.entries[${index}].retrievalIds 至少包含一项`);
    } else {
      for (const id of entry.retrievalIds) {
        if (!retrievalIds.has(id)) {
          errors.push(`coverage.entries[${index}] 引用了不存在的 retrievalId: ${id}`);
        }
      }
    }
    if (!Array.isArray(entry.notes)) errors.push(`coverage.entries[${index}].notes 必须是数组`);
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
    if (complete && !hasText(candidate.eventId)) {
      errors.push(`candidates[${index}].eventId 在完整运行中不能为空`);
    }
    if (complete && (!Array.isArray(candidate.discoveredVia) || candidate.discoveredVia.length === 0)) {
      errors.push(`candidates[${index}].discoveredVia 在完整运行中至少包含一项`);
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
    if (!DATE_STATUSES.has(item.dateStatus)) {
      errors.push(`verification[${index}].dateStatus 不受支持`);
    } else if (item.dateEligible !== (item.dateStatus === "eligible")) {
      errors.push(`verification[${index}].dateEligible 必须与 dateStatus 一致`);
    }
    if (!Array.isArray(item.dateEvidence)) {
      errors.push(`verification[${index}].dateEvidence 必须是数组`);
    }
    if (!Array.isArray(item.provenanceAttempts)) {
      errors.push(`verification[${index}].provenanceAttempts 必须是数组`);
    }
    if (complete && item.dateStatus === "eligible" && item.dateEvidence?.length === 0) {
      errors.push(`verification[${index}] 日期合格时必须记录 dateEvidence`);
    }
    if (complete && item.dateStatus === "unresolved" && item.provenanceAttempts?.length < 2) {
      errors.push(`verification[${index}] 日期未决时必须至少完成 2 次一手溯源尝试`);
    }
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
  const selectedEventIds = new Set();
  for (const id of selectedIds) {
    const eventId = candidateItems.find((candidate) => candidate.id === id)?.eventId;
    if (!eventId) continue;
    if (selectedEventIds.has(eventId)) {
      errors.push(`同一事件不得重复入选：${eventId}`);
    }
    selectedEventIds.add(eventId);
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
    const latestCoverageByChannel = new Map();
    for (const entry of coverageItems) latestCoverageByChannel.set(entry.channel, entry);
    for (const channel of REQUIRED_COVERAGE_CHANNELS) {
      const entry = latestCoverageByChannel.get(channel);
      if (!entry) {
        errors.push(`完整运行缺少来源覆盖记录：${channel}`);
      } else if (entry.status === "failed") {
        errors.push(`完整运行的来源渠道失败：${channel}`);
      }
    }
    const unmetRequirements = Array.isArray(selection?.unmetRequirements)
      ? selection.unmetRequirements
      : [];
    if (!Array.isArray(selection?.unmetRequirements)) {
      errors.push("完整运行的 selection.unmetRequirements 必须是数组");
    }
    for (const [channel, entry] of latestCoverageByChannel) {
      if (
        REQUIRED_COVERAGE_CHANNELS.includes(channel) &&
        entry.status === "degraded" &&
        !unmetRequirements.some((requirement) =>
          typeof requirement === "string" && requirement.toLowerCase().includes(channel.toLowerCase()),
        )
      ) {
        errors.push(`降级来源必须在 selection.unmetRequirements 明确记录：${channel}`);
      }
    }
    const xEntries = coverageItems.filter((entry) => entry.channel === "x");
    const latestX = xEntries.at(-1);
    if (latestX?.eligibleCandidates === 0 && xEntries.length < 2) {
      errors.push("X 目标日期候选为 0 时必须至少重试一次并保存第二条覆盖记录");
    }
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
    if (manifest.runType === "historical-backfill") {
      for (const required of ["catalog:build", "npm test"]) {
        if (!successfulCommands.some((item) => item.command?.includes(required))) {
          errors.push(`checks.commands 缺少成功记录: ${required}`);
        }
      }
    } else {
      if (!successfulCommands.some((item) => item.command?.includes("digest:validate"))) {
        errors.push("checks.commands 缺少成功记录: digest:validate");
      }
      const transactionSucceeded = successfulCommands.some((item) =>
        item.command?.includes("digest:transaction")
      );
      if (transactionSucceeded) {
        if (!successfulCommands.some((item) => item.command?.includes("digest:finalize"))) {
          errors.push("checks.commands 缺少成功记录: digest:finalize");
        }
      } else {
        for (const required of ["digest:publish", "npm test"]) {
          if (!successfulCommands.some((item) => item.command?.includes(required))) {
            errors.push(`checks.commands 缺少成功记录: ${required}`);
          }
        }
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
    if ((manifest.protocolVersion ?? 1) >= 2) {
      if (!successfulCommands.some((item) => item.command?.includes("deployment:verify"))) {
        errors.push("protocolVersion 2 完整运行必须由 deployment:verify 成功收尾");
      }
      if (
        checks.deployment?.verificationMethod !== "scripts/verify-deployment.mjs" ||
        checks.deployment?.evidenceFile !== "deployment-verification.json"
      ) {
        errors.push("protocolVersion 2 部署状态必须来自确定性验证脚本");
      }
      if (!isObject(deploymentVerification)) {
        errors.push("protocolVersion 2 缺少 deployment-verification.json");
      } else {
        if (
          deploymentVerification.status !== "success" ||
          deploymentVerification.targetDate !== targetDate ||
          deploymentVerification.commitSha !== checks.git?.commitSha
        ) {
          errors.push("deployment-verification.json 与目标日期或 Git 提交不一致");
        }
        if (
          deploymentVerification.check?.status !== "completed" ||
          deploymentVerification.check?.conclusion !== "success" ||
          !isIsoDateTime(deploymentVerification.check?.completedAt)
        ) {
          errors.push("deployment-verification.json 缺少真实完成且成功的 Cloudflare Check");
        }
        if (
          deploymentVerification.production?.root?.httpStatus !== 200 ||
          deploymentVerification.production?.root?.matched !== true ||
          deploymentVerification.production?.today?.httpStatus !== 200 ||
          deploymentVerification.production?.today?.matched !== true
        ) {
          errors.push("deployment-verification.json 缺少正式域名 root/today 内容匹配证据");
        }
        if (
          !isIsoDateTime(deploymentVerification.completedAt) ||
          !isIsoDateTime(manifest.finishedAt) ||
          Date.parse(deploymentVerification.check?.completedAt) > Date.parse(deploymentVerification.completedAt) ||
          Date.parse(deploymentVerification.completedAt) > Date.parse(manifest.finishedAt)
        ) {
          errors.push("部署 Check、正式域名验证与 run 完成时间顺序不合法");
        }
      }
    }
  }

  return errors;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readOptionalJson(path) {
  try {
    return await readJson(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
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
    coverage: await readJson(resolve(root, "coverage.json")),
    retrievals,
    candidates: await readJson(resolve(root, "candidates.json")),
    verification: await readJson(resolve(root, "verification.json")),
    scores: await readJson(resolve(root, "scores.json")),
    selection: await readJson(resolve(root, "selection.json")),
    digest: await readJson(resolve(root, "digest.json")),
    checks: await readJson(resolve(root, "checks.json")),
    deploymentVerification: await readOptionalJson(resolve(root, "deployment-verification.json")),
  };

  return {
    artifacts,
    retrievalFiles,
    errors: validateResearchArtifacts(artifacts, options),
  };
}
