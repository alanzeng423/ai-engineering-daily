import { chmod, readFile, readdir } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { atomicWriteJson, readJson } from "./atomic-json.mjs";

const COVERAGE_STATUSES = new Set(["success", "degraded", "failed"]);

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoDateTime(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function assertInside(parent, child, label) {
  const path = relative(parent, child);
  if (path === "" || path.startsWith("..") || isAbsolute(path)) {
    throw new Error(`${label} 必须位于 RUN_DIRECTORY 内`);
  }
}

async function readRetrievalIds(runDirectory) {
  const ids = new Set();
  for (const name of (await readdir(resolve(runDirectory, "retrievals"))).filter((item) => item.endsWith(".json"))) {
    const retrieval = await readJson(resolve(runDirectory, "retrievals", name));
    if (hasText(retrieval.batchId)) ids.add(retrieval.batchId);
  }
  return ids;
}

export function validateCoverageEntry(entry) {
  const errors = [];
  if (!hasText(entry?.id)) errors.push("覆盖条目 id 不能为空");
  if (!hasText(entry?.channel)) errors.push("覆盖条目 channel 不能为空");
  if (!COVERAGE_STATUSES.has(entry?.status)) errors.push("覆盖条目 status 不受支持");
  if (!isIsoDateTime(entry?.startedAt)) errors.push("覆盖条目 startedAt 必须是 ISO 时间");
  if (!isIsoDateTime(entry?.completedAt)) errors.push("覆盖条目 completedAt 必须是 ISO 时间");
  for (const key of ["planned", "attempted", "succeeded", "failed", "rawResults", "eligibleCandidates"]) {
    if (!Number.isInteger(entry?.[key]) || entry[key] < 0) {
      errors.push(`覆盖条目 ${key} 必须是非负整数`);
    }
  }
  if (Number.isInteger(entry?.attempted) && Number.isInteger(entry?.succeeded) && Number.isInteger(entry?.failed)) {
    if (entry.succeeded + entry.failed !== entry.attempted) {
      errors.push("覆盖条目 succeeded + failed 必须等于 attempted");
    }
  }
  if (!Array.isArray(entry?.retrievalIds) || entry.retrievalIds.length === 0) {
    errors.push("覆盖条目 retrievalIds 至少包含一项");
  }
  if (!Array.isArray(entry?.notes)) errors.push("覆盖条目 notes 必须是数组");
  return errors;
}

export async function appendSourceCoverage(runDirectoryInput, entryPathInput) {
  const runDirectory = resolve(runDirectoryInput);
  const entryPath = resolve(entryPathInput);
  assertInside(runDirectory, entryPath, "覆盖条目文件");
  if (!relative(runDirectory, entryPath).startsWith("coverage-entries/")) {
    throw new Error("覆盖条目文件必须位于 RUN_DIRECTORY/coverage-entries/ 内");
  }

  const manifest = await readJson(resolve(runDirectory, "manifest.json"));
  const coveragePath = resolve(runDirectory, "coverage.json");
  const coverage = await readJson(coveragePath);
  const entry = JSON.parse(await readFile(entryPath, "utf8"));
  const errors = validateCoverageEntry(entry);
  if (errors.length > 0) throw new Error(errors.join("；"));
  if (coverage.schemaVersion !== 1 || coverage.targetDate !== manifest.targetDate) {
    throw new Error("coverage.json 与 manifest.json 不一致");
  }
  if (!Array.isArray(coverage.entries)) throw new Error("coverage.json 的 entries 必须是数组");
  if (coverage.entries.some((item) => item.id === entry.id)) {
    throw new Error(`覆盖条目 id 已存在：${entry.id}`);
  }

  const retrievalIds = await readRetrievalIds(runDirectory);
  for (const id of entry.retrievalIds) {
    if (!retrievalIds.has(id)) throw new Error(`覆盖条目引用了不存在的 retrievalId：${id}`);
  }

  const next = {
    ...coverage,
    generatedAt: new Date().toISOString(),
    entries: [...coverage.entries, entry],
  };
  await atomicWriteJson(coveragePath, next);
  await chmod(entryPath, 0o444);
  return entry;
}

const entrypoint = process.argv[1] ? resolve(process.argv[1]) : null;
if (entrypoint === fileURLToPath(import.meta.url)) {
  const [runDirectory, entryPath] = process.argv.slice(2);
  if (!runDirectory || !entryPath) {
    console.error("用法：npm run research:coverage -- <RUN_DIRECTORY> <RUN_DIRECTORY/coverage-entries/entry.json>");
    process.exit(1);
  }
  try {
    const entry = await appendSourceCoverage(runDirectory, entryPath);
    console.log(`来源覆盖条目已原子追加：${entry.id}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
