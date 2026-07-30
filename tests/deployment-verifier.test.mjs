import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import {
  inspectRenderedPage,
  parseGitHubRepository,
  selectCheckRun,
  verifyDeployment,
} from "../scripts/verify-deployment.mjs";

const commitSha = "a".repeat(40);

async function fixture(t) {
  const root = await mkdtemp(resolve(tmpdir(), "deployment-verifier-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runDirectory = resolve(root, "research", "runs", "2026-07-29", "run-001");
  await mkdir(runDirectory, { recursive: true });
  await mkdir(resolve(root, "content"), { recursive: true });
  await writeFile(
    resolve(runDirectory, "manifest.json"),
    JSON.stringify({
      schemaVersion: 1,
      protocolVersion: 2,
      targetDate: "2026-07-29",
      status: "running",
      stage: "deployment",
      finishedAt: null,
      failure: null,
    }),
  );
  await writeFile(
    resolve(runDirectory, "checks.json"),
    JSON.stringify({
      schemaVersion: 1,
      targetDate: "2026-07-29",
      commands: [],
      git: { pushed: true, commitSha, remote: "origin", branch: "main" },
      deployment: { status: "pending", verified: false },
    }),
  );
  await writeFile(resolve(runDirectory, "events.ndjson"), "");
  await writeFile(
    resolve(root, "content", "latest.json"),
    JSON.stringify({
      schemaVersion: 1,
      issue: 9,
      date: "2026-07-29",
      overview: "当天概览",
      items: [{ title: "确定性部署验证", url: "https://example.com/item" }],
    }),
  );
  await writeFile(
    resolve(root, "content", "catalog.json"),
    JSON.stringify({ schemaVersion: 1, total: 2, items: [{}, {}] }),
  );
  return { root, runDirectory };
}

function response(html, status = 200) {
  return { status, text: async () => html };
}

test("parses common GitHub origin formats", () => {
  assert.equal(parseGitHubRepository("git@github.com:owner/repo.git"), "owner/repo");
  assert.equal(parseGitHubRepository("https://github.com/owner/repo.git"), "owner/repo");
});

test("selects only the named check for the exact commit", () => {
  const selected = selectCheckRun(
    [
      { id: 1, name: "other", head_sha: commitSha },
      { id: 2, name: "Workers Builds: ai-engineering-daily", head_sha: "b".repeat(40) },
      { id: 3, name: "Workers Builds: ai-engineering-daily", head_sha: commitSha },
    ],
    commitSha,
  );
  assert.equal(selected.id, 3);
});

test("checks rendered article counts and required text", () => {
  const result = inspectRenderedPage(
    "<article></article><article></article>2026-07-29 确定性部署验证",
    { articleCount: 2, texts: ["2026-07-29", "确定性部署验证"] },
  );
  assert.equal(result.matched, true);
});

test("writes a successful attestation only after a completed successful check", async (t) => {
  const { root, runDirectory } = await fixture(t);
  const check = {
    id: 42,
    name: "Workers Builds: ai-engineering-daily",
    head_sha: commitSha,
    status: "completed",
    conclusion: "success",
    details_url: "https://dash.cloudflare.com/build/42",
    started_at: "2026-07-30T01:00:00.000Z",
    completed_at: "2026-07-30T01:01:00.000Z",
  };
  const htmlByUrl = new Map([
    ["https://ai.alanzeng.com", "<article></article><article></article>2026-07-29 确定性部署验证"],
    ["https://ai.alanzeng.com/today", "<article></article>2026-07-29 当天概览 确定性部署验证"],
  ]);
  const result = await verifyDeployment({
    root,
    runDirectory,
    commitSha,
    repository: "owner/repo",
    timeoutMs: 0,
    intervalMs: 0,
    getCheckRuns: async () => [check],
    fetchImpl: async (url) => response(htmlByUrl.get(url)),
    now: () => new Date("2026-07-30T01:02:00.000Z"),
  });
  assert.equal(result.status, "success");
  const manifest = JSON.parse(await readFile(resolve(runDirectory, "manifest.json"), "utf8"));
  const checks = JSON.parse(await readFile(resolve(runDirectory, "checks.json"), "utf8"));
  const evidence = JSON.parse(
    await readFile(resolve(runDirectory, "deployment-verification.json"), "utf8"),
  );
  assert.equal(manifest.status, "completed");
  assert.equal(checks.deployment.checkStatus, "completed");
  assert.equal(checks.deployment.verificationMethod, "scripts/verify-deployment.mjs");
  assert.equal(evidence.check.completedAt, check.completed_at);
  assert.equal(evidence.production.root.articleCount, 2);
  assert.equal(evidence.attempts.length, 1);
  assert.ok(checks.commands.some((item) => item.command.includes("deployment:verify")));
});

test("marks the run failed when the check never completes", async (t) => {
  const { root, runDirectory } = await fixture(t);
  await assert.rejects(
    verifyDeployment({
      root,
      runDirectory,
      commitSha,
      repository: "owner/repo",
      timeoutMs: 0,
      intervalMs: 0,
      getCheckRuns: async () => [{
        id: 42,
        name: "Workers Builds: ai-engineering-daily",
        head_sha: commitSha,
        status: "in_progress",
        conclusion: null,
      }],
      fetchImpl: async () => {
        throw new Error("production should not be queried before check success");
      },
    }),
    /未完成/,
  );
  const manifest = JSON.parse(await readFile(resolve(runDirectory, "manifest.json"), "utf8"));
  const checks = JSON.parse(await readFile(resolve(runDirectory, "checks.json"), "utf8"));
  assert.equal(manifest.status, "failed");
  assert.equal(manifest.failure.code, "cloudflare_check_timeout");
  assert.equal(checks.deployment.status, "cloudflare_check_timeout");
  assert.equal(checks.deployment.checkStatus, "in_progress");
  assert.equal(checks.deployment.checkRunId, 42);
  assert.equal(checks.deployment.verified, false);
});
