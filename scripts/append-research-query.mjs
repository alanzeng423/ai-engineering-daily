import { chmod, readFile, readdir } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { atomicWriteJson, readJson } from "./atomic-json.mjs";

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
  const retrievalDirectory = resolve(runDirectory, "retrievals");
  const ids = new Set();
  for (const name of (await readdir(retrievalDirectory)).filter((item) => item.endsWith(".json"))) {
    const retrieval = await readJson(resolve(retrievalDirectory, name));
    if (hasText(retrieval.batchId)) ids.add(retrieval.batchId);
  }
  return ids;
}

export async function appendResearchQuery(runDirectoryInput, entryPathInput) {
  const runDirectory = resolve(runDirectoryInput);
  const entryPath = resolve(entryPathInput);
  assertInside(runDirectory, entryPath, "查询条目文件");
  const entryRelativePath = relative(runDirectory, entryPath);
  if (!entryRelativePath.startsWith("query-entries/")) {
    throw new Error("查询条目文件必须位于 RUN_DIRECTORY/query-entries/ 内");
  }

  const manifest = await readJson(resolve(runDirectory, "manifest.json"));
  const queriesPath = resolve(runDirectory, "queries.json");
  const queries = await readJson(queriesPath);
  const entry = JSON.parse(await readFile(entryPath, "utf8"));

  if (queries.schemaVersion !== 1 || queries.targetDate !== manifest.targetDate) {
    throw new Error("queries.json 与 manifest.json 不一致");
  }
  if (!Array.isArray(queries.queries)) throw new Error("queries.json 的 queries 必须是数组");
  if (!hasText(entry.id)) throw new Error("查询条目 id 不能为空");
  if (!isIsoDateTime(entry.executedAt)) throw new Error("查询条目 executedAt 必须是 ISO 时间");
  if (!hasText(entry.query)) throw new Error("查询条目 query 不能为空");
  if (!hasText(entry.language)) throw new Error("查询条目 language 不能为空");
  if (!hasText(entry.scope)) throw new Error("查询条目 scope 不能为空");
  if (!Array.isArray(entry.retrievalIds) || entry.retrievalIds.length === 0) {
    throw new Error("查询条目 retrievalIds 至少包含一项");
  }
  if (queries.queries.some((item) => item.id === entry.id)) {
    throw new Error(`查询条目 id 已存在：${entry.id}`);
  }

  const retrievalIds = await readRetrievalIds(runDirectory);
  for (const id of entry.retrievalIds) {
    if (!retrievalIds.has(id)) throw new Error(`查询条目引用了不存在的 retrievalId：${id}`);
  }

  const next = { ...queries, queries: [...queries.queries, entry] };
  await atomicWriteJson(queriesPath, next);
  const installed = await readJson(queriesPath);
  const last = installed.queries.at(-1);
  if (last?.id !== entry.id || installed.queries.length !== queries.queries.length + 1) {
    throw new Error("查询条目写入后的追加校验失败");
  }
  await chmod(entryPath, 0o444);
  return last;
}

const entrypoint = process.argv[1] ? resolve(process.argv[1]) : null;
if (entrypoint === fileURLToPath(import.meta.url)) {
  const [runDirectory, entryPath] = process.argv.slice(2);
  if (!runDirectory || !entryPath) {
    console.error("用法：npm run research:query -- <RUN_DIRECTORY> <RUN_DIRECTORY/query-entries/entry.json>");
    process.exit(1);
  }

  try {
    const entry = await appendResearchQuery(runDirectory, entryPath);
    console.log(`查询条目已原子追加：${entry.id}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
