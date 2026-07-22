import assert from "node:assert/strict";
import test from "node:test";

import { validateResearchArtifacts } from "../scripts/research-schema.mjs";

function completeRun() {
  const targetDate = "2026-07-21";
  const candidate = {
    id: "candidate-001",
    title: "用执行轨迹改进长任务中的故障恢复能力",
    url: "https://example.com/agent-reliability",
    canonicalUrl: "https://example.com/agent-reliability",
    source: "Example Engineering",
    sourceType: "blog",
    author: "Example Team",
    discoveredAt: "2026-07-22T01:31:00Z",
    queryIds: ["query-001"],
    retrievalIds: ["retrieval-001"],
  };
  const digest = {
    schemaVersion: 1,
    issue: 1,
    date: targetDate,
    generatedAt: "2026-07-22T01:45:00Z",
    overview: "本期集中讨论可靠的智能系统如何进入真实软件工程流程，并给出可以复核的工程证据。",
    items: [
      {
        category: "Agent 可靠性",
        sourceType: "blog",
        source: "Example Engineering",
        publishedAt: targetDate,
        readTime: "8 min",
        title: candidate.title,
        summary: "文章分析长任务中故障暴露位置与真正根因不一致的问题，并通过结构化轨迹回放定位关键步骤。实验给出了恢复成功率和额外运行成本。",
        why: "它为生产 Agent 的故障诊断、自动恢复与回归测试提供了可复用的工程方法。",
        url: candidate.url,
        tags: ["故障恢复", "执行轨迹"],
      },
    ],
  };
  return {
    manifest: {
      schemaVersion: 1,
      runId: "2026-07-22T09-30-00+08-00",
      targetDate,
      startedAt: "2026-07-22T01:30:00Z",
      finishedAt: "2026-07-22T01:50:00Z",
      status: "completed",
      stage: "completed",
    },
    queries: {
      schemaVersion: 1,
      targetDate,
      queries: [
        {
          id: "query-001",
          executedAt: "2026-07-22T01:31:00Z",
          query: "agent reliability",
          retrievalIds: ["retrieval-001"],
        },
      ],
    },
    retrievals: [
      {
        schemaVersion: 1,
        targetDate,
        batchId: "retrieval-001",
        kind: "search",
        requestedAt: "2026-07-22T01:31:00Z",
        completedAt: "2026-07-22T01:31:01Z",
        request: { query: "agent reliability" },
        response: { status: "success" },
        results: [{ title: candidate.title, url: candidate.url }],
      },
    ],
    candidates: { schemaVersion: 1, targetDate, candidates: [candidate] },
    verification: {
      schemaVersion: 1,
      targetDate,
      verifications: [
        {
          candidateId: candidate.id,
          checkedAt: "2026-07-22T01:35:00Z",
          accessible: true,
          dateEligible: true,
          evidence: [{ claim: "给出恢复成功率", locator: "Results" }],
          rejectionReasons: [],
        },
      ],
    },
    scores: {
      schemaVersion: 1,
      targetDate,
      scores: [
        {
          candidateId: candidate.id,
          scoredAt: "2026-07-22T01:40:00Z",
          total: 86,
          passed: true,
          breakdown: {
            authorityOriginality: 18,
            technicalDepth: 22,
            novelty: 17,
            evidence: 16,
            practicalValue: 13,
          },
        },
      ],
    },
    selection: {
      schemaVersion: 1,
      targetDate,
      selectedIds: [candidate.id],
      rejected: [],
    },
    digest,
    checks: {
      schemaVersion: 1,
      targetDate,
      commands: [
        { command: "npm run digest:validate -- content/inbox/2026-07-21.json", exitCode: 0 },
        { command: "npm run digest:publish -- content/inbox/2026-07-21.json", exitCode: 0 },
        { command: "npm test", exitCode: 0 },
      ],
      git: { pushed: true, commitSha: "abcdef1" },
      deployment: { status: "success", httpStatus: 200, verified: true },
    },
  };
}

test("accepts a complete, traceable research run", () => {
  assert.deepEqual(validateResearchArtifacts(completeRun(), { complete: true }), []);
});

test("requires every candidate to have a final disposition", () => {
  const run = completeRun();
  run.selection.selectedIds = [];
  run.digest.items = [];
  const errors = validateResearchArtifacts(run, { complete: true });
  assert.ok(errors.some((error) => error.includes("未记录最终入选或淘汰决定")));
});

test("rejects a candidate that references a missing retrieval batch", () => {
  const run = completeRun();
  run.candidates.candidates[0].retrievalIds = ["retrieval-missing"];
  const errors = validateResearchArtifacts(run, { complete: true });
  assert.ok(errors.some((error) => error.includes("不存在的 retrievalId")));
});

test("accepts a complete historical backfill with a baseline collection", () => {
  const run = completeRun();
  const item = run.digest.items[0];
  run.manifest.runType = "historical-backfill";
  run.digest = {
    schemaVersion: 1,
    id: "foundation-test",
    title: "AI 工程基础精选",
    generatedAt: "2026-07-22T01:45:00Z",
    coverage: {
      from: item.publishedAt,
      to: item.publishedAt,
      primaryFrom: "2026-01-22",
      primaryTo: "2026-07-21",
      exceptionalOlder: 0,
    },
    overview: "本次回溯整理可复核的一手工程文章和实证研究，为后续每日新增内容建立稳定的历史基底。",
    items: [item],
  };
  run.checks.commands = [
    { command: "npm run catalog:build", exitCode: 0 },
    { command: "npm test", exitCode: 0 },
  ];
  assert.deepEqual(validateResearchArtifacts(run, { complete: true }), []);
});
