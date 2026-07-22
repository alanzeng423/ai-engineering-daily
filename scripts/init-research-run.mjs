import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { stableJson } from "./digest-schema.mjs";

const targetDate = process.argv[2];
if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate ?? "")) {
  console.error("用法：npm run research:init -- YYYY-MM-DD");
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const now = new Date();
const parts = Object.fromEntries(
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(now)
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, part.value]),
);
const baseRunId = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}-${parts.minute}-${parts.second}+08-00`;
const dateDirectory = resolve(root, "research", "runs", targetDate);

let runId = baseRunId;
let runDirectory = resolve(dateDirectory, runId);
let suffix = 2;
while (true) {
  try {
    await mkdir(runDirectory, { recursive: false });
    break;
  } catch (error) {
    if (error.code !== "ENOENT" && error.code !== "EEXIST") throw error;
    if (error.code === "ENOENT") {
      await mkdir(dateDirectory, { recursive: true });
      continue;
    }
    runId = `${baseRunId}-${String(suffix).padStart(2, "0")}`;
    runDirectory = resolve(dateDirectory, runId);
    suffix += 1;
  }
}

await mkdir(resolve(runDirectory, "retrievals"), { recursive: true });
const common = { schemaVersion: 1, targetDate };
const manifest = {
  schemaVersion: 1,
  runId,
  automationId: "ai",
  targetDate,
  startedAt: now.toISOString(),
  finishedAt: null,
  status: "running",
  stage: "preflight",
  workspace: root,
  baseCommit: null,
  counts: {
    retrievalBatches: 0,
    rawDiscoveries: 0,
    normalizedCandidates: 0,
    verifiedCandidates: 0,
    scoredCandidates: 0,
    selectedItems: 0,
  },
  failure: null,
};

const files = {
  "manifest.json": manifest,
  "queries.json": { ...common, queries: [] },
  "candidates.json": { ...common, generatedAt: null, candidates: [] },
  "verification.json": { ...common, generatedAt: null, verifications: [] },
  "scores.json": { ...common, generatedAt: null, scores: [] },
  "selection.json": {
    ...common,
    generatedAt: null,
    constraints: {},
    selectedIds: [],
    rejected: [],
    unmetRequirements: [],
    notes: [],
  },
  "digest.json": null,
  "checks.json": {
    ...common,
    commands: [],
    git: { commitSha: null, pushed: false, remote: null, branch: null },
    deployment: {
      checkName: null,
      status: "pending",
      detailsUrl: null,
      url: "https://ai.alanzeng.com",
      httpStatus: null,
      verified: false,
      verifiedAt: null,
    },
  },
};

for (const [name, value] of Object.entries(files)) {
  await writeFile(resolve(runDirectory, name), stableJson(value), "utf8");
}
await writeFile(
  resolve(runDirectory, "events.ndjson"),
  `${JSON.stringify({ at: now.toISOString(), stage: "preflight", event: "run_initialized" })}\n`,
  "utf8",
);

console.log(runDirectory);
