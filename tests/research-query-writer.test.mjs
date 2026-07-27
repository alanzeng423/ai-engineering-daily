import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { appendResearchQuery } from "../scripts/append-research-query.mjs";

async function createRun(t) {
  const runDirectory = await mkdtemp(join(tmpdir(), "daily-query-writer-"));
  t.after(() => rm(runDirectory, { recursive: true, force: true }));
  await mkdir(resolve(runDirectory, "retrievals"));
  await mkdir(resolve(runDirectory, "query-entries"));
  await writeFile(
    resolve(runDirectory, "manifest.json"),
    JSON.stringify({ targetDate: "2026-07-21" }),
  );
  await writeFile(
    resolve(runDirectory, "queries.json"),
    JSON.stringify({ schemaVersion: 1, targetDate: "2026-07-21", queries: [] }),
  );
  await writeFile(
    resolve(runDirectory, "retrievals", "0001-search.json"),
    JSON.stringify({ batchId: "0001", targetDate: "2026-07-21" }),
  );
  return runDirectory;
}

function queryEntry(overrides = {}) {
  return {
    id: "query-0001",
    executedAt: "2026-07-22T01:31:00Z",
    query: "agent reliability",
    language: "en",
    scope: "official engineering sources",
    retrievalIds: ["0001"],
    ...overrides,
  };
}

test("atomically appends a validated immutable query entry", async (t) => {
  const runDirectory = await createRun(t);
  const entryPath = resolve(runDirectory, "query-entries", "0001.json");
  await writeFile(entryPath, JSON.stringify(queryEntry()));

  await appendResearchQuery(runDirectory, entryPath);
  const queries = JSON.parse(await readFile(resolve(runDirectory, "queries.json"), "utf8"));
  assert.equal(queries.queries.length, 1);
  assert.deepEqual(queries.queries[0], queryEntry());
  assert.deepEqual(JSON.parse(await readFile(entryPath, "utf8")), queryEntry());
});

test("leaves queries.json untouched when the entry JSON is malformed", async (t) => {
  const runDirectory = await createRun(t);
  const queriesPath = resolve(runDirectory, "queries.json");
  const before = await readFile(queriesPath, "utf8");
  const entryPath = resolve(runDirectory, "query-entries", "broken.json");
  await writeFile(entryPath, '{"id":"query-0001"]');

  await assert.rejects(() => appendResearchQuery(runDirectory, entryPath));
  assert.equal(await readFile(queriesPath, "utf8"), before);
  assert.equal(await readFile(entryPath, "utf8"), '{"id":"query-0001"]');
});

test("rejects missing retrieval references without a partial ledger write", async (t) => {
  const runDirectory = await createRun(t);
  const queriesPath = resolve(runDirectory, "queries.json");
  const before = await readFile(queriesPath, "utf8");
  const entryPath = resolve(runDirectory, "query-entries", "missing.json");
  await writeFile(entryPath, JSON.stringify(queryEntry({ retrievalIds: ["9999"] })));

  await assert.rejects(
    () => appendResearchQuery(runDirectory, entryPath),
    /不存在的 retrievalId/,
  );
  assert.equal(await readFile(queriesPath, "utf8"), before);
});
