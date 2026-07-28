import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { appendSourceCoverage } from "../scripts/append-source-coverage.mjs";

async function createRun(t) {
  const runDirectory = await mkdtemp(join(tmpdir(), "daily-source-coverage-"));
  t.after(() => rm(runDirectory, { recursive: true, force: true }));
  await mkdir(resolve(runDirectory, "retrievals"));
  await mkdir(resolve(runDirectory, "coverage-entries"));
  await writeFile(
    resolve(runDirectory, "manifest.json"),
    JSON.stringify({ targetDate: "2026-07-28" }),
  );
  await writeFile(
    resolve(runDirectory, "coverage.json"),
    JSON.stringify({ schemaVersion: 1, targetDate: "2026-07-28", entries: [] }),
  );
  await writeFile(
    resolve(runDirectory, "retrievals", "0001-social.json"),
    JSON.stringify({ batchId: "0001", targetDate: "2026-07-28" }),
  );
  return runDirectory;
}

function coverageEntry(overrides = {}) {
  return {
    id: "coverage-x-0001",
    channel: "x",
    status: "success",
    startedAt: "2026-07-29T01:30:00Z",
    completedAt: "2026-07-29T01:31:00Z",
    planned: 50,
    attempted: 50,
    succeeded: 50,
    failed: 0,
    rawResults: 100,
    eligibleCandidates: 12,
    retrievalIds: ["0001"],
    notes: [],
    ...overrides,
  };
}

test("atomically appends an immutable source coverage entry", async (t) => {
  const runDirectory = await createRun(t);
  const entryPath = resolve(runDirectory, "coverage-entries", "0001-x.json");
  await writeFile(entryPath, JSON.stringify(coverageEntry()));

  await appendSourceCoverage(runDirectory, entryPath);
  const coverage = JSON.parse(await readFile(resolve(runDirectory, "coverage.json"), "utf8"));
  assert.equal(coverage.entries.length, 1);
  assert.equal(coverage.entries[0].channel, "x");
});

test("rejects inconsistent account totals without mutating the ledger", async (t) => {
  const runDirectory = await createRun(t);
  const coveragePath = resolve(runDirectory, "coverage.json");
  const before = await readFile(coveragePath, "utf8");
  const entryPath = resolve(runDirectory, "coverage-entries", "broken.json");
  await writeFile(entryPath, JSON.stringify(coverageEntry({ succeeded: 49, failed: 0 })));

  await assert.rejects(() => appendSourceCoverage(runDirectory, entryPath), /必须等于 attempted/);
  assert.equal(await readFile(coveragePath, "utf8"), before);
});
